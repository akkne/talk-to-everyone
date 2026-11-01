using Microsoft.EntityFrameworkCore;
using Prometheus;

namespace Backend;

public static class GameMetrics
{
    public static readonly Counter LobbiesCreated = Metrics.CreateCounter("game_lobbies_created_total", "Lobbies created.");
    public static readonly Counter LobbyJoins = Metrics.CreateCounter("game_lobby_joins_total", "Successful lobby joins and reconnects.");
    public static readonly Counter LobbyKicks = Metrics.CreateCounter("game_lobby_kicks_total", "Players removed from a lobby by its host.");
    public static readonly Counter GamesStarted = Metrics.CreateCounter("game_matches_started_total", "Matches started.");
    public static readonly Counter HubRejections = Metrics.CreateCounter("game_hub_rejections_total", "Rejected game commands by operation and reason.", new CounterConfiguration { LabelNames = ["operation", "reason"] });
    public static readonly Counter LlmRequests = Metrics.CreateCounter("game_llm_requests_total", "NPC generation requests by purpose and outcome.", new CounterConfiguration { LabelNames = ["purpose", "outcome"] });
    public static readonly Histogram LlmDuration = Metrics.CreateHistogram("game_llm_duration_seconds", "NPC generation request duration in seconds, including fallback.", new HistogramConfiguration { LabelNames = ["purpose"], Buckets = [0.5, 1, 2, 5, 10, 20, 40, 80, 120] });
    public static readonly Gauge ActiveLobbies = Metrics.CreateGauge("game_active_lobbies", "Lobbies with at least one connected player.");
    public static readonly Gauge ActiveMatches = Metrics.CreateGauge("game_active_matches", "Playing sessions with at least one connected player.");
    public static readonly Gauge ConnectedPlayers = Metrics.CreateGauge("game_connected_players", "Connected players across all sessions.");
    public static readonly Gauge SignalRConnections = Metrics.CreateGauge("game_signalr_connections", "Open game SignalR connections.");
}

public sealed class GameMetricsSnapshotService(IServiceScopeFactory scopes, ILogger<GameMetricsSnapshotService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<GameDb>();
                GameMetrics.ConnectedPlayers.Set(await db.Players.CountAsync(p => p.Connected, stoppingToken));
                GameMetrics.ActiveLobbies.Set(await db.Sessions.CountAsync(s => s.Phase == "lobby" && db.Players.Any(p => p.SessionId == s.Id && p.Connected), stoppingToken));
                GameMetrics.ActiveMatches.Set(await db.Sessions.CountAsync(s => s.Phase == "playing" && db.Players.Any(p => p.SessionId == s.Id && p.Connected), stoppingToken));
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Failed to refresh game metrics snapshot");
            }
        }
    }
}
