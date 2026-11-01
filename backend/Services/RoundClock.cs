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
    SessionPauseRegistry pauseRegistry)
{
    private readonly Dictionary<string, (int Round, CancellationTokenSource Cts)> active = new();
    private readonly object sync = new();

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
                fullRoster = await db.Npcs.AsNoTracking().Where(n => n.SessionId == sessionId).OrderBy(n => n.Number).ToListAsync(ct);
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
                        var history = await db.ConversationEvents.AsNoTracking()
                            .Where(e => e.GameId == session.GameId).OrderBy(e => e.Sequence).ToListAsync(ct);
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
                    db.Messages.Add(line);
                    NpcConversationLog.Append(db, session, speech, npc.Id);
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
            log.LogWarning(ex, "Error while running round {Round} speeches", round);
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
    ILogger<RoundClock> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        while (await timer.WaitForNextTickAsync(ct))
        {
            await gate.Lock.WaitAsync(ct);
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<GameDb>();
                foreach (var session in await db.Sessions.Where(s => s.Phase == "playing").ToListAsync(ct))
                {
                var pauseGate = pauseRegistry.For(session.Id);
                if (pauseGate.IsPaused) continue;
                if (session.Phase != "playing") continue;
                if (session.RoundPhase == "choice")
                {
                    if (!await Voting.Advance(db, hub.Clients, session, settings)) continue;
                }
                else if (session.EndsAt > JsonData.Now)
                {
                    director.TriggerRound(session.Id, session.Round, session.RoundPhase);
                    continue;
                }
                else if (session.RoundPhase != "resolved")
                {
                    director.CancelCurrentRound(session.Id);
                    var choice = Voting.IsChoiceRound(session.Round);
                    await hub.Clients.Group(session.Id).SendAsync("RoundEnded", new { n = session.Round, choiceEndsAt = choice ? JsonData.Now + settings.ChoiceSeconds * 1000L : (long?)null }, ct);
                    if (choice) { await Voting.Start(db, hub.Clients, session, settings); continue; }
                }
                if (session.Round >= 5) { director.CancelCurrentRound(session.Id); await GameLogic.Finish(db, hub, session); continue; }
                session.Round++;
                session.RoundPhase = session.Round switch { 2 => "gossip", 3 => "blindspots", 4 => "interrogation", 5 => "debate", _ => "presentation" };
                session.EndsAt = JsonData.Now + settings.RoundSeconds * 1000L;
                await db.SaveChangesAsync(ct);
                await hub.Clients.Group(session.Id).SendAsync("RoundStarted", GameLogic.RoundView(session, pauseGate), ct);
                director.TriggerRound(session.Id, session.Round, session.RoundPhase);
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Round transition failed");
            }
            finally { gate.Lock.Release(); }
        }
    }
}
