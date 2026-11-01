namespace Backend;

/// <summary>
/// Coordinates voice signaling validation and active speaker states among studio participants.
/// </summary>
public interface IVoiceRoomCoordinator
{
    /// <summary>
    /// Validates a client voice signal and constructs a relay envelope if valid.
    /// </summary>
    /// <param name="senderPlayerId">Identifier of the sending participant.</param>
    /// <param name="request">Incoming client signal payload.</param>
    /// <param name="nowMs">Current server time in Unix milliseconds UTC.</param>
    /// <param name="envelope">Constructed envelope when validation succeeds.</param>
    /// <returns>True when the signal is valid and ready to relay; otherwise false.</returns>
    bool TryCreateSignal(
        string senderPlayerId,
        VoiceSignalRequest? request,
        long nowMs,
        out VoiceSignalEnvelope? envelope);

    /// <summary>
    /// Updates the speaking status for a participant.
    /// </summary>
    /// <param name="playerId">Participant identifier.</param>
    /// <param name="speaking">Whether the participant is currently speaking.</param>
    /// <param name="nowMs">Current server time in Unix milliseconds UTC.</param>
    /// <returns>Updated speaker status view.</returns>
    VoiceSpeakerView SetSpeaking(string playerId, bool speaking, long nowMs);

    /// <summary>
    /// Clears speaking status when a participant disconnects or resets.
    /// </summary>
    /// <param name="playerId">Participant identifier.</param>
    /// <returns>True if the participant was actively speaking prior to clearing.</returns>
    bool ClearSpeaker(string playerId);

    /// <summary>
    /// Returns the identifiers of all currently speaking connected participants.
    /// </summary>
    /// <param name="connectedPlayerIds">Set of currently connected player identifiers.</param>
    /// <returns>Read-only list of speaking player IDs.</returns>
    IReadOnlyList<string> GetActiveSpeakerIds(IEnumerable<string> connectedPlayerIds);
}
