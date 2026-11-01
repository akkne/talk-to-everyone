namespace Backend;

/// <summary>
/// Immutable view of the current game pause state shared with connected clients.
/// </summary>
/// <param name="Paused">Whether the session and NPC bots are currently paused.</param>
/// <param name="PausedRemainingMs">Remaining phase duration in milliseconds preserved while paused.</param>
/// <param name="EndsAt">Effective phase deadline in Unix milliseconds UTC.</param>
/// <param name="PausedBy">Player identifier of the host who paused the session, if paused.</param>
public sealed record GamePauseView(bool Paused, long PausedRemainingMs, long EndsAt, string? PausedBy);
