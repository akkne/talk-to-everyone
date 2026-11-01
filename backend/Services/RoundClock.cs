using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public sealed class RoundDirector(
    IServiceScopeFactory scopes,
    IHubContext<GameHub> hub,
    GameGate gate,
    GameSettings settings,
    LlmClient llm,
    ILogger<RoundDirector> log,
    SessionPauseRegistry pauseRegistry,
    IGameRedisStore? redisStore = null)
{
    private readonly Dictionary<string, (int Round, CancellationTokenSource Cts)> active = new();
    private readonly object sync = new();
    private readonly IGameRedisStore store = redisStore ?? new RedisGameStore();

    public void CancelCurrentRound(string sessionId)
    {
        lock (sync)
        {
            if (!active.Remove(sessionId, out var current)) return;
            current.Cts.Cancel();
            current.Cts.Dispose();
        }
    }

    public void TriggerRound(string sessionId, int round, string phase)
    {
        if (round is not (1 or 2 or 3 or 5)) return;
        CancellationToken token;
        lock (sync)
        {
            if (active.TryGetValue(sessionId, out var current))
            {
                if (current.Round == round) return;
                current.Cts.Cancel();
                current.Cts.Dispose();
            }
            var cts = new CancellationTokenSource();
            active[sessionId] = (round, cts);
            token = cts.Token;
        }
        _ = Task.Run(() => RunRoundSpeechesAsync(sessionId, round, phase, token), token);
    }

    private async Task RunRoundSpeechesAsync(string sessionId, int round, string phase, CancellationToken ct)
    {
        var pauseGate = pauseRegistry.For(sessionId);
        try
        {
            await Task.Delay(1200, ct);
            List<GameNpc> activeNpcs;
            List<GameNpc> fullRoster;
            using (var scope = scopes.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<GameDb>();
                var session = await db.Sessions.AsNoTracking().SingleAsync(s => s.Id == sessionId, ct);
                if (session.Phase != "playing" || session.Round != round || session.RoundPhase == "choice") return;
                var eliminated = JsonData.Read<VotingData>(session.VotingJson).Eliminated;
                fullRoster = (await store.GetNpcsAsync(sessionId)).OrderBy(n => n.Number).ToList();
                activeNpcs = fullRoster.Where(n => !eliminated.Contains(n.Id)).ToList();
            }

            if (activeNpcs.Count == 0) return;
            var paceDelayMs = Math.Clamp((settings.RoundSeconds * 1000) / Math.Max(2, activeNpcs.Count + 2), 1800, 6500);

            foreach (var npc in activeNpcs)
            {
                ct.ThrowIfCancellationRequested();
                await pauseGate.WaitWhilePausedAsync(ct);

                await hub.Clients.Group(sessionId).SendAsync("NpcThinking", new { npc = npc.Id, questionId = $"r{round}:{npc.Id}" }, ct);

                string speech;
                string emotion;
                string gameId;
                try
                {
                    await gate.LlmLock.WaitAsync(ct);
                    try
                    {
                        using var scope = scopes.CreateScope();
                        var db = scope.ServiceProvider.GetRequiredService<GameDb>();
                        var session = await db.Sessions.AsNoTracking().SingleAsync(s => s.Id == sessionId, ct);
                        if (session.Phase != "playing" || session.Round != round || session.RoundPhase == "choice") return;
                        gameId = session.GameId;
                        var history = await store.GetConversationEventsAsync(sessionId, session.GameId);
                        (speech, emotion) = await llm.GenerateRoundSpeech(npc, round, phase, fullRoster, [], ct, history);
                    }
                    finally
                    {
                        gate.LlmLock.Release();
                    }
                }
                catch (Exception ex) when (!ct.IsCancellationRequested)
                {
                    log.LogWarning(ex, "NPC speech failed for {NpcId} in round {Round}", npc.Id, round);
                    continue;
                }

                await pauseGate.WaitWhilePausedAsync(ct);

                await gate.Lock.WaitAsync(ct);
                try
                {
                    using var scope = scopes.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<GameDb>();
                    var session = await db.Sessions.SingleAsync(s => s.Id == sessionId, ct);
                    var voting = JsonData.Read<VotingData>(session.VotingJson);
                    if (session.Phase != "playing" || session.GameId != gameId || session.Round != round || session.RoundPhase == "choice" || voting.Eliminated.Contains(npc.Id))
                        return;

                    var line = new GameMessage
                    {
                        SessionId = sessionId,
                        PlayerId = "",
                        NpcId = npc.Id,
                        Text = speech,
                        Emotion = emotion,
                        InReplyTo = null,
                        IsQuestion = false,
                        At = JsonData.Now
                    };
                    await store.AddMessageAsync(sessionId, line);
                    NpcConversationLog.Append(store, session, speech, npc.Id);
                    await db.SaveChangesAsync(ct);
                    await hub.Clients.Group(sessionId).SendAsync("NpcSay", new
                    {
                        id = line.Id,
                        npc = line.NpcId,
                        text = line.Text,
                        inReplyTo = line.InReplyTo,
                        emotion = line.Emotion,
                        at = line.At
                    }, ct);
                }
                finally
                {
                    gate.Lock.Release();
                }

                await Task.Delay(paceDelayMs, ct);
            }
        }
        catch (OperationCanceledException)
        {
            // Normal cancellation when round changes or game resets
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Round routine terminated for {SessionId}", sessionId);
        }
    }
}

public sealed class RoundClock(
    IServiceScopeFactory scopes,
    IHubContext<GameHub> hub,
    GameGate gate,
    GameSettings settings,
    RoundDirector director,
    SessionPauseRegistry pauseRegistry,
    IGameRedisStore redisStore,
    ILogger<RoundClock> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(500));
        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                await TickAsync(ct);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                log.LogError(ex, "Round clock tick failed");
            }
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        await gate.Lock.WaitAsync(ct);
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<GameDb>();
            var now = JsonData.Now;
            var playing = await db.Sessions.Where(s => s.Phase == "playing").ToListAsync(ct);
            foreach (var session in playing)
            {
                var pauseGate = pauseRegistry.For(session.Id);
                if (pauseGate.IsPaused) continue;

                if (session.RoundPhase == "choice")
                {
                    await Voting.Advance(db, redisStore, hub.Clients, session, settings);
                }

                if (session.EndsAt <= now)
                {
                    var nextRound = session.Round + 1;
                    if (session.Round == 5 && session.RoundPhase != "choice")
                    {
                        await Voting.Start(db, redisStore, hub.Clients, session, settings);
                    }
                    else if (session.Round == 5 && session.RoundPhase == "choice")
                    {
                        await GameLogic.Finish(db, redisStore, hub, session);
                    }
                    else if (session.RoundPhase != "choice" && Voting.IsChoiceRound(session.Round))
                    {
                        await Voting.Start(db, redisStore, hub.Clients, session, settings);
                    }
                    else
                    {
                        director.CancelCurrentRound(session.Id);
                        var phase = nextRound switch
                        {
                            2 => "gossip",
                            3 => "blindspots",
                            4 => "interrogation",
                            5 => "debate",
                            _ => "presentation"
                        };
                        session.Round = nextRound;
                        session.RoundPhase = phase;
                        session.EndsAt = now + settings.RoundSeconds * 1000L;
                        if (nextRound == 4)
                        {
                            var players = await db.Players.Where(p => p.SessionId == session.Id).ToListAsync(ct);
                            foreach (var p in players)
                            {
                                var q = new QuestionData();
                                p.QuestionsJson = JsonData.Write(q);
                                await redisStore.SetPlayerQuestionsAsync(session.Id, p.Id, q);
                                if (p.Connected && p.ConnectionId != null)
                                    await hub.Clients.Client(p.ConnectionId).SendAsync("QuestionState", new { questions = q }, ct);
                            }
                        }
                        await db.SaveChangesAsync(ct);
                        await hub.Clients.Group(session.Id).SendAsync("RoundStarted", GameLogic.RoundView(session, pauseGate), ct);
                        director.TriggerRound(session.Id, nextRound, phase);
                    }
                }
            }
        }
        finally
        {
            gate.Lock.Release();
        }
    }
}
