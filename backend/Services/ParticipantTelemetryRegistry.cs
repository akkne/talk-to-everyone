using System.Collections.Concurrent;

namespace Backend;

/// <summary>
/// In-memory implementation of <see cref="IParticipantTelemetryRegistry"/> storing live participant diagnostics.
/// </summary>
/// <param name="activityCatalog">Catalog used to normalize and describe participant activities.</param>
public sealed class ParticipantTelemetryRegistry(IPlayerActivityCatalog activityCatalog) : IParticipantTelemetryRegistry
{
    /// <summary>Maximum allowed FPS value to guard against malformed telemetry payloads.</summary>
    public const int MaxFps = 1000;

    /// <summary>Maximum allowed ping value in milliseconds.</summary>
    public const int MaxPingMs = 30000;

    private readonly ConcurrentDictionary<string, ParticipantTelemetrySample> _samples = new(StringComparer.Ordinal);

    /// <inheritdoc />
    public void RecordDiagnostics(GamePlayer player, GameSession session, DiagnosticsRequest request, long nowMs)
    {
        var clampedFps = Math.Clamp(request.Fps, 0, MaxFps);
        var clampedPing = Math.Clamp(request.PingMs, 0, MaxPingMs);
        var normalizedActivity = activityCatalog.NormalizeActivityCode(request.Activity, player, session);

        _samples.AddOrUpdate(
            player.Id,
            _ => new ParticipantTelemetrySample(clampedFps, clampedPing, normalizedActivity, false, nowMs),
            (_, existing) => existing with
            {
                Fps = clampedFps,
                PingMs = clampedPing,
                ActivityCode = normalizedActivity,
                UpdatedAt = nowMs
            });
    }

    /// <inheritdoc />
    public void UpdateSpeaking(string playerId, bool speaking, long nowMs)
    {
        _samples.AddOrUpdate(
            playerId,
            _ => new ParticipantTelemetrySample(0, 0, PlayerActivityCatalog.Walking, speaking, nowMs),
            (_, existing) => existing with { Speaking = speaking, UpdatedAt = nowMs });
    }

    /// <inheritdoc />
    public void MarkDisconnected(string playerId, long nowMs)
    {
        _samples.AddOrUpdate(
            playerId,
            _ => new ParticipantTelemetrySample(0, 0, PlayerActivityCatalog.Offline, false, nowMs),
            (_, existing) => existing with
            {
                Fps = 0,
                PingMs = 0,
                ActivityCode = PlayerActivityCatalog.Offline,
                Speaking = false,
                UpdatedAt = nowMs
            });
    }

    /// <inheritdoc />
    public IReadOnlyList<ParticipantStatusView> BuildSnapshot(IEnumerable<GamePlayer> players, GameSession session)
    {
        var result = new List<ParticipantStatusView>();
        foreach (var player in players.OrderByDescending(p => p.Role == "leader").ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase))
        {
            _samples.TryGetValue(player.Id, out var sample);
            var rawActivity = sample?.ActivityCode;
            var activityCode = activityCatalog.NormalizeActivityCode(rawActivity, player, session);
            var actionText = activityCatalog.DescribeAction(activityCode, player, session);
            var fps = player.Connected ? (sample?.Fps ?? 0) : 0;
            var pingMs = player.Connected ? (sample?.PingMs ?? 0) : 0;
            var speaking = player.Connected && (sample?.Speaking ?? false);

            result.Add(new ParticipantStatusView(
                player.Id,
                player.Name,
                player.Role,
                player.Connected,
                fps,
                pingMs,
                activityCode,
                actionText,
                speaking));
        }

        return result;
    }
}
