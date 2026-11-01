using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend;

/// <summary>Advances shared scene routines and food restocks independently of clients.</summary>
public sealed class DirectorClock(IServiceScopeFactory scopes, IHubContext<GameHub> hub, GameGate gate,
    MapCatalog maps, SessionPauseRegistry pauses, ILogger<DirectorClock> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct) {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(200));
        while (await timer.WaitForNextTickAsync(ct)) {
            await gate.Lock.WaitAsync(ct);
            try {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<GameDb>();
                var sessions = await db.Sessions.AsNoTracking().Where(s => s.Phase == "playing" || s.MapId == "club").ToListAsync(ct);
                foreach (var session in sessions) {
                    var location = LocationScene.For(session.Id, maps.Scene(session.MapId));
                    var players = await db.Players.AsNoTracking().Where(p => p.SessionId == session.Id && p.Connected).ToListAsync(ct);
                    var now = JsonData.Now;
                    var changed = location.RestockFood(now);
                    changed |= location.Director.Tick(location, players, now, pauses.For(session.Id).IsPaused);
                    if (changed)
                        await hub.Clients.Group(session.Id).SendAsync("LocationState", new {
                            doors = location.Items("doors"), foods = location.Items("foods"), directorRun = location.Data["directorRun"],
                            activeLightingPreset = (string?)location.Data["activeLightingPreset"],
                            fanOn = (bool?)location.Data["fanOn"], musicTrack = (string?)location.Data["musicTrack"]
                        }, ct);
                }
            } catch (Exception e) when (e is not OperationCanceledException) { log.LogError(e, "Director routine failed"); }
            finally { gate.Lock.Release(); }
        }
    }
}
