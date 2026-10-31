using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public sealed class RoundClock(IServiceScopeFactory scopes, IHubContext<GameHub> hub, GameGate gate, GameSettings settings, ILogger<RoundClock> log) : BackgroundService
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
                var session = await db.Sessions.SingleAsync(ct);
                if (session.Phase != "playing" || session.EndsAt > JsonData.Now) continue;
                if (session.RoundPhase != "choice")
                {
                    var choice = session.Round is 2 or 3 or 4;
                    await hub.Clients.All.SendAsync("RoundEnded", new { n = session.Round, choiceEndsAt = choice ? JsonData.Now + settings.ChoiceSeconds * 1000L : (long?)null }, ct);
                    if (choice)
                    {
                        session.RoundPhase = "choice"; session.EndsAt = JsonData.Now + settings.ChoiceSeconds * 1000L;
                        await db.SaveChangesAsync(ct);
                        await hub.Clients.All.SendAsync("RoundStarted", GameLogic.RoundView(session), ct);
                        continue;
                    }
                }
                if (session.Round >= 4) { await GameLogic.Finish(db, hub); continue; }
                session.Round++;
                session.RoundPhase = session.Round switch { 2 => "gossip", 3 => "blindspots", 4 => "interrogation", _ => "presentation" };
                session.EndsAt = JsonData.Now + settings.RoundSeconds * 1000L;
                await db.SaveChangesAsync(ct);
                await hub.Clients.All.SendAsync("RoundStarted", GameLogic.RoundView(session), ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Round transition failed");
            }
            finally { gate.Lock.Release(); }
        }
    }
}
