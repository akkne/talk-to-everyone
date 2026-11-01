namespace Backend;

/// <summary>
/// Immutable telemetry sample stored per participant in memory.
/// </summary>
/// <param name="Fps">Clamped frames-per-second value.</param>
/// <param name="PingMs">Clamped round-trip ping in milliseconds.</param>
/// <param name="ActivityCode">Normalized activity code reported by the client.</param>
/// <param name="Speaking">Whether the participant's microphone is currently active.</param>
/// <param name="UpdatedAt">Unix timestamp in milliseconds when the sample was recorded.</param>
public sealed record ParticipantTelemetrySample(
    int Fps,
    int PingMs,
    string ActivityCode,
    bool Speaking,
    long UpdatedAt);
