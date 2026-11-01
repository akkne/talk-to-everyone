using System.Collections.Concurrent;

namespace Backend;

/// <summary>
/// Default thread-safe coordinator for studio voice signaling and speaking indicator state.
/// </summary>
public sealed class VoiceRoomCoordinator : IVoiceRoomCoordinator
{
    /// <summary>Maximum allowed serialized signal payload length in characters.</summary>
    public const int MaxPayloadLength = 65536;

    private static readonly HashSet<string> AllowedSignalTypes = new(StringComparer.Ordinal)
    {
        "offer",
        "answer",
        "ice",
        "audio-chunk"
    };

    private readonly ConcurrentDictionary<string, VoiceSpeakerView> _speakers = new(StringComparer.Ordinal);

    /// <inheritdoc />
    public bool TryCreateSignal(
        string senderPlayerId,
        VoiceSignalRequest? request,
        long nowMs,
        out VoiceSignalEnvelope? envelope)
    {
        envelope = null;
        if (request == null ||
            string.IsNullOrWhiteSpace(senderPlayerId) ||
            string.IsNullOrWhiteSpace(request.TargetPlayerId) ||
            string.Equals(senderPlayerId, request.TargetPlayerId, StringComparison.Ordinal))
        {
            return false;
        }

        var normalizedType = request.SignalType?.Trim().ToLowerInvariant() ?? string.Empty;
        if (!AllowedSignalTypes.Contains(normalizedType))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(request.Payload) || request.Payload.Length > MaxPayloadLength)
        {
            return false;
        }

        envelope = new VoiceSignalEnvelope(
            senderPlayerId,
            request.TargetPlayerId.Trim(),
            normalizedType,
            request.Payload,
            nowMs);
        return true;
    }

    /// <inheritdoc />
    public VoiceSpeakerView SetSpeaking(string playerId, bool speaking, long nowMs)
    {
        var view = new VoiceSpeakerView(playerId, speaking, nowMs);
        _speakers[playerId] = view;
        return view;
    }

    /// <inheritdoc />
    public bool ClearSpeaker(string playerId)
    {
        if (_speakers.TryRemove(playerId, out var removed))
        {
            return removed.Speaking;
        }

        return false;
    }

    /// <inheritdoc />
    public IReadOnlyList<string> GetActiveSpeakerIds(IEnumerable<string> connectedPlayerIds)
    {
        var connected = new HashSet<string>(connectedPlayerIds, StringComparer.Ordinal);
        return _speakers.Values
            .Where(s => s.Speaking && connected.Contains(s.PlayerId))
            .OrderBy(s => s.PlayerId, StringComparer.Ordinal)
            .Select(s => s.PlayerId)
            .ToArray();
    }
}
