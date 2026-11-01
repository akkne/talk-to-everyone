namespace Backend;

/// <summary>
/// Client-to-server WebRTC / voice signaling message addressed to another judge in the studio.
/// </summary>
/// <param name="TargetPlayerId">Identifier of the recipient participant.</param>
/// <param name="SignalType">Signal category: offer, answer, ice, or audio-chunk.</param>
/// <param name="Payload">Serialized SDP, ICE candidate, or encoded audio frame payload.</param>
public sealed record VoiceSignalRequest(string TargetPlayerId, string SignalType, string Payload);
