namespace Backend;

/// <summary>
/// Client-reported runtime diagnostics and current UI/gameplay activity code.
/// </summary>
/// <param name="Fps">Current client rendering frame rate in frames per second.</param>
/// <param name="PingMs">Latest measured round-trip latency in milliseconds.</param>
/// <param name="Activity">Short activity code describing what the participant is currently doing.</param>
public sealed record DiagnosticsRequest(int Fps, int PingMs, string Activity);
