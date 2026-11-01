namespace Backend;

/// <summary>
/// Immutable snapshot of a participant's live status for the host Escape menu panel.
/// </summary>
/// <param name="Id">Unique player identifier.</param>
/// <param name="Name">Display name of the participant.</param>
/// <param name="Role">Assigned role in the session (leader or judge).</param>
/// <param name="Connected">Whether the participant currently has an active connection.</param>
/// <param name="Fps">Latest reported rendering frame rate.</param>
/// <param name="PingMs">Latest reported network latency in milliseconds.</param>
/// <param name="ActivityCode">Machine-readable activity identifier.</param>
/// <param name="ActionText">Localized human-readable description of the participant's current action.</param>
/// <param name="Speaking">Whether the participant is currently transmitting voice audio.</param>
public sealed record ParticipantStatusView(
    string Id,
    string Name,
    string Role,
    bool Connected,
    int Fps,
    int PingMs,
    string ActivityCode,
    string ActionText,
    bool Speaking);
