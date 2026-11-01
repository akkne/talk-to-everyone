namespace Backend;

/// <summary>
/// Represents the live speaking state of a judge in the voice channel.
/// </summary>
/// <param name="PlayerId">Identifier of the participant.</param>
/// <param name="Speaking">Whether the participant is currently speaking.</param>
/// <param name="UpdatedAt">Unix timestamp in milliseconds UTC of the latest state transition.</param>
public sealed record VoiceSpeakerView(string PlayerId, bool Speaking, long UpdatedAt);
