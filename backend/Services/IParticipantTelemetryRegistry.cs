namespace Backend;

/// <summary>
/// Thread-safe store of participant diagnostics (FPS, ping, current action, and speaking state).
/// </summary>
public interface IParticipantTelemetryRegistry
{
    /// <summary>
    /// Records a diagnostic report from a participant.
    /// </summary>
    /// <param name="player">The reporting player entity.</param>
    /// <param name="session">The current game session.</param>
    /// <param name="request">The diagnostic metrics reported by the client.</param>
    /// <param name="nowMs">Current server time in Unix milliseconds UTC.</param>
    void RecordDiagnostics(GamePlayer player, GameSession session, DiagnosticsRequest request, long nowMs);

    /// <summary>
    /// Updates the voice speaking state of a participant.
    /// </summary>
    /// <param name="playerId">Unique identifier of the participant.</param>
    /// <param name="speaking">Whether the participant is currently speaking.</param>
    /// <param name="nowMs">Current server time in Unix milliseconds UTC.</param>
    void UpdateSpeaking(string playerId, bool speaking, long nowMs);

    /// <summary>
    /// Clears transient speaking or menu state when a participant disconnects.
    /// </summary>
    /// <param name="playerId">Unique identifier of the disconnected participant.</param>
    /// <param name="nowMs">Current server time in Unix milliseconds UTC.</param>
    void MarkDisconnected(string playerId, long nowMs);

    /// <summary>
    /// Builds the ordered list of participant statuses for the current session.
    /// </summary>
    /// <param name="players">All players in the session.</param>
    /// <param name="session">Current game session entity.</param>
    /// <returns>Read-only list of participant telemetry snapshots.</returns>
    IReadOnlyList<ParticipantStatusView> BuildSnapshot(IEnumerable<GamePlayer> players, GameSession session);
}
