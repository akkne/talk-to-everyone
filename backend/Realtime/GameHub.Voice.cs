using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public sealed partial class GameHub
{
    /// <summary>
    /// Relays a WebRTC SDP offer/answer, ICE candidate, or voice frame to another connected judge.
    /// </summary>
    /// <param name="request">Voice signaling payload targeting a specific judge.</param>
    public async Task SendVoiceSignal(VoiceSignalRequest request)
    {
        string? targetConnectionId = null;
        VoiceSignalEnvelope? envelope = null;

        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized();
            if (me == null)
            {
                return;
            }

            if (!voiceRoom.TryCreateSignal(me.Id, request, JsonData.Now, out envelope) || envelope == null)
            {
                await ActionReject("SendVoiceSignal", "INVALID_VOICE_SIGNAL", null);
                return;
            }

            var target = await db.Players
                .AsNoTracking()
                .SingleOrDefaultAsync(p => p.Id == envelope.TargetPlayerId && p.Connected);

            if (target == null || string.IsNullOrWhiteSpace(target.ConnectionId))
            {
                await ActionReject("SendVoiceSignal", "TARGET_NOT_CONNECTED", null);
                return;
            }

            targetConnectionId = target.ConnectionId;
        }
        finally
        {
            gate.Lock.Release();
        }

        await Clients.Client(targetConnectionId).SendAsync("VoiceSignalReceived", envelope);
    }

    /// <summary>
    /// Updates whether the calling judge is actively speaking on their microphone and broadcasts the status.
    /// </summary>
    /// <param name="request">Voice speaking state payload.</param>
    public async Task SetVoiceSpeaking(VoiceSpeakingRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized();
            if (me == null || request == null)
            {
                return;
            }

            var now = JsonData.Now;
            var view = voiceRoom.SetSpeaking(me.Id, request.Speaking, now);
            telemetry.UpdateSpeaking(me.Id, request.Speaking, now);

            await Clients.All.SendAsync("VoiceSpeakingUpdated", new
            {
                playerId = view.PlayerId,
                speaking = view.Speaking,
                at = view.UpdatedAt
            });
            await BroadcastParticipants();
        }
        finally
        {
            gate.Lock.Release();
        }
    }
}
