using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public sealed partial class GameHub
{
    /// <summary>
    /// Receives live FPS, network latency, and current UI/gameplay activity from a connected participant.
    /// </summary>
    /// <param name="request">Client diagnostic metrics payload.</param>
    public async Task ReportDiagnostics(DiagnosticsRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized();
            if (me == null || request == null)
            {
                return;
            }

            var session = await db.Sessions.AsNoTracking().SingleAsync(s => s.Id == me.SessionId);
            telemetry.RecordDiagnostics(me, session, request, JsonData.Now);
            await BroadcastParticipants(me.SessionId);
        }
        finally
        {
            gate.Lock.Release();
        }
    }

    /// <summary>
    /// Pauses or resumes the active game timer and all NPC bots. Restricted to the session host (leader).
    /// </summary>
    /// <param name="request">Pause command payload containing request ID and target pause state.</param>
    public async Task SetGamePause(PauseRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized();
            if (me == null)
            {
                return;
            }

            if (request == null || !ValidRequestId(request.RequestId))
            {
                await ActionReject("SetGamePause", "INVALID_REQUEST", request?.RequestId);
                return;
            }

            if (me.Role != "leader")
            {
                await ActionReject("SetGamePause", "FORBIDDEN", request.RequestId);
                return;
            }

            var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
            if (session.Phase != "playing")
            {
                await ActionReject("SetGamePause", "WRONG_PHASE", request.RequestId);
                return;
            }

            if (Seen(me, "SetGamePause", request.RequestId))
            {
                var existingView = pauseGate.CurrentView(session, JsonData.Now);
                await Clients.Caller.SendAsync("GamePauseChanged", existingView);
                return;
            }

            var now = JsonData.Now;
            var pauseView = pauseGate.ApplyPause(session, request.Paused, me.Id, now);
            Remember(me, "SetGamePause", request.RequestId);
            await db.SaveChangesAsync();

            log.LogInformation(
                "Session {SessionId} pause state set to {Paused} by host {PlayerId}",
                session.Id,
                pauseView.Paused,
                me.Id);

            await Clients.Group(me.SessionId).SendAsync("GamePauseChanged", pauseView);
            await Clients.Group(me.SessionId).SendAsync("RoundStarted", GameLogic.RoundView(session, pauseGate));
            if (session.RoundPhase == "choice")
            {
                await Voting.Broadcast(db, Clients, session);
            }
        }
        finally
        {
            gate.Lock.Release();
        }
    }

    private async Task BroadcastParticipants(string sessionId)
    {
        var players = await db.Players.AsNoTracking().Where(p => p.SessionId == sessionId).ToListAsync();
        var session = await db.Sessions.AsNoTracking().SingleAsync(s => s.Id == sessionId);
        var participants = telemetry.BuildSnapshot(players, session);
        await Clients.Group(sessionId).SendAsync("ParticipantsUpdated", new { participants });
    }
}
