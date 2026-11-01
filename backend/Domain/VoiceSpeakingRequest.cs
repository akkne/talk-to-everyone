namespace Backend;

/// <summary>
/// Client command notifying the studio whether the participant is currently transmitting voice audio.
/// </summary>
/// <param name="Speaking">True when the participant's microphone is actively transmitting speech.</param>
public sealed record VoiceSpeakingRequest(bool Speaking);
