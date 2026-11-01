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
    ISessionPauseGate? pauseGate = null)
{
    private readonly ISessionPauseGate _pauseGate = pauseGate ?? new SessionPauseGate();
    private CancellationTokenSource? _roundCts;
    private readonly object _sync = new();
    private int _activeRound;

    public void CancelCurrentRound()
    {
        lock (_sync)
        {
            _activeRound = 0;
            _roundCts?.Cancel();
            _roundCts?.Dispose();
            _roundCts = null;
        }
    }

    public void TriggerRound(int round, string phase)
    {
        if (round is not (1 or 2 or 3 or 5)) return;
        CancellationToken token;
        lock (_sync)
        {
            if (_activeRound == round) return;
            _activeRound = round;
            _roundCts?.Cancel();
            _roundCts?.Dispose();
            _roundCts = new CancellationTokenSource();
            token = _roundCts.Token;
        }
        _ = Task.Run(() => RunRoundSpeechesAsync(round, phase, token), token);
    }

    private async Task RunRoundSpeechesAsync(int round, string phase, CancellationToken ct)
    {
        try
        {
            await Task.Delay(1200, ct);
            List<GameNpc> activeNpcs;
            List<GameNpc> fullRoster;
            using (var scope = scopes.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<GameDb>();
                var session = await db.Sessions.AsNoTracking().SingleAsync(ct);
                if (session.Phase != "playing" || session.Round != round || session.RoundPhase == "choice") return;
                var eliminated = JsonData.Read<VotingData>(session.VotingJson).Eliminated;
                fullRoster = await db.Npcs.AsNoTracking().OrderBy(n => n.Number).ToListAsync(ct);
                activeNpcs = fullRoster.Where(n => !eliminated.Contains(n.Id)).ToList();
            }

            if (activeNpcs.Count == 0) return;
            var paceDelayMs = Math.Clamp((settings.RoundSeconds * 1000) / Math.Max(2, activeNpcs.Count + 2), 1800, 6500);

            foreach (var npc in activeNpcs)
            {
                ct.ThrowIfCancellationRequested();
                await _pauseGate.WaitWhilePausedAsync(ct);

                await hub.Clients.All.SendAsync("NpcThinking", new { npc = npc.Id, questionId = $"r{round}:{npc.Id}" }, ct);

                string speech;
                string emotion;
                await gate.LlmLock.WaitAsync(ct);
                try
                {
                    List<GameMessage> history;
                    using (var scope = scopes.CreateScope())
                    {
                        var db = scope.ServiceProvider.GetRequiredService<GameDb>();
                        var session = await db.Sessions.AsNoTracking().SingleAsync(ct);
                        if (session.Phase != "playing" || session.Round != round || session.RoundPhase == "choice") return;
                        history = await db.Messages.AsNoTracking().OrderByDescending(m => m.At).Take(16).ToListAsync(ct);
                    }
                    (speech, emotion) = await llm.GenerateRoundSpeech(npc, round, phase, fullRoster, history, ct);
                }
                finally
                {
                    gate.LlmLock.Release();
                }

                await _pauseGate.WaitWhilePausedAsync(ct);

                await gate.Lock.WaitAsync(ct);
                try
                {
                    using var scope = scopes.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<GameDb>();
                    var session = await db.Sessions.SingleAsync(ct);
                    var voting = JsonData.Read<VotingData>(session.VotingJson);
                    if (session.Phase != "playing" || session.Round != round || session.RoundPhase == "choice" || voting.Eliminated.Contains(npc.Id))
                        return;

                    var line = new GameMessage
                    {
                        PlayerId = "",
                        NpcId = npc.Id,
                        Text = speech,
                        Emotion = emotion,
                        InReplyTo = null,
                        IsQuestion = false,
                        At = JsonData.Now
                    };
                    db.Messages.Add(line);
                    await db.SaveChangesAsync(ct);
                    await hub.Clients.All.SendAsync("NpcSay", new
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
    ISessionPauseGate pauseGate,
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
                if (pauseGate.IsPaused) continue;
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<GameDb>();
                var session = await db.Sessions.SingleAsync(ct);
                if (session.Phase != "playing") continue;
                if (session.RoundPhase == "choice")
                {
                    if (!await Voting.Advance(db, hub.Clients, session, settings)) continue;
                }
                else if (session.EndsAt > JsonData.Now)
                {
                    director.TriggerRound(session.Round, session.RoundPhase);
                    continue;
                }
                else if (session.RoundPhase != "resolved")
                {
                    director.CancelCurrentRound();
                    var choice = Voting.IsChoiceRound(session.Round);
                    await hub.Clients.All.SendAsync("RoundEnded", new { n = session.Round, choiceEndsAt = choice ? JsonData.Now + settings.ChoiceSeconds * 1000L : (long?)null }, ct);
                    if (choice) { await Voting.Start(db, hub.Clients, session, settings); continue; }
                }
                if (session.Round >= 5) { director.CancelCurrentRound(); await GameLogic.Finish(db, hub); continue; }
                session.Round++;
                session.RoundPhase = session.Round switch { 2 => "gossip", 3 => "blindspots", 4 => "interrogation", 5 => "debate", _ => "presentation" };
                session.EndsAt = JsonData.Now + settings.RoundSeconds * 1000L;
                await db.SaveChangesAsync(ct);
                await hub.Clients.All.SendAsync("RoundStarted", GameLogic.RoundView(session, pauseGate), ct);
                director.TriggerRound(session.Round, session.RoundPhase);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Round transition failed");
            }
            finally { gate.Lock.Release(); }
        }
    }
}
