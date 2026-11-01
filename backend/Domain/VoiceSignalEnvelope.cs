namespace Backend;

/// <summary>
/// Server-to-client voice signaling envelope delivered to a specific target judge.
/// </summary>
/// <param name="SenderPlayerId">Identifier of the judge who sent the signal.</param>
/// <param name="TargetPlayerId">Identifier of the judge receiving the signal.</param>
/// <param name="SignalType">Normalized signal type (offer, answer, ice, audio-chunk).</param>
/// <param name="Payload">Raw signal payload.</param>
/// <param name="SentAt">Unix timestamp in milliseconds UTC when the signal was relayed.</param>
public sealed record VoiceSignalEnvelope(
    string SenderPlayerId,
    string TargetPlayerId,
    string SignalType,
    string Payload,
    long SentAt);
