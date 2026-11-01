using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;

namespace Backend;

public sealed partial class GameHub
{
    public async Task SendPose(PoseRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            var location = await Location(me);
            var pose = await redisStore.GetPlayerPoseAsync(me.SessionId, me.Id) ?? JsonData.Read<PoseData>(me.PoseJson);
            // Jump animation is an offset above the validated navigation surface.
            if (!Finite(request.JumpOffset) || request.JumpOffset is < 0 or > 0.83 || (pose.Mode == "seated" && request.JumpOffset != 0))
            { await ActionReject("SendPose", "INVALID_POSE", null, request.Seq); return; }
            if (request.Seq <= pose.Seq || request.Position == null || !Finite(request.Yaw) || !Finite(request.Pitch) || !Finite(request.Position.X) || !Finite(request.Position.Y) || !Finite(request.Position.Z) || Math.Abs(request.Pitch) > Math.PI / 3 + 0.05)
            { await ActionReject("SendPose", "INVALID_POSE", null, request.Seq); return; }
            var now = JsonData.Now;
            if (pose.UpdatedAt != 0 && now - pose.UpdatedAt < 60) return;
            if (pose.Mode == "seated")
            {
                if (Math.Abs(request.Yaw) > 2 * Math.PI / 3 + 0.05) { await ActionReject("SendPose", "INVALID_POSE", null, request.Seq); return; }
                pose.Yaw = request.Yaw; pose.Pitch = request.Pitch;
            }
            else
            {
                var p = request.Position;
                var seconds = pose.UpdatedAt == 0 ? 1 : Math.Clamp((now - pose.UpdatedAt) / 1000.0, 0.05, 2.0);
                if (!location.CanTravel(pose.Position, p) || Distance(p, pose.Position) > 2.5 * seconds + 0.6)
                { await ActionReject("SendPose", "COLLISION", null, request.Seq); return; }
                pose.Position = p; pose.Yaw = request.Yaw; pose.Pitch = request.Pitch;
            }
            pose.JumpOffset = request.JumpOffset;
            pose.Seq = request.Seq; pose.UpdatedAt = now;
            await redisStore.SetPlayerPoseAsync(me.SessionId, me.Id, pose);
            me.PoseJson = JsonData.Write(pose);
            await BroadcastPlayers(me.SessionId);
        }
        finally { gate.Lock.Release(); }
    }

    public async Task SitDown(SeatRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            var location = await Location(me);
            if (request == null || !ValidRequestId(request.RequestId)) { await ActionReject("SitDown", "INVALID_POSE", request?.RequestId); return; }
            if (await redisStore.HasSeenCommandAsync(me.SessionId, me.Id, "SitDown", request.RequestId)) { await BroadcastPlayers(me.SessionId); return; }
            var pose = await redisStore.GetPlayerPoseAsync(me.SessionId, me.Id) ?? JsonData.Read<PoseData>(me.PoseJson);
            var seat = location.Seats.FirstOrDefault(n => (string?)n!["id"] == request.SeatId);
            if (seat == null || pose.Mode != "walking") { await ActionReject("SitDown", "WRONG_MODE", request.RequestId); return; }
            var seatPos = LocationScene.Point(location.Seat(request.SeatId)["position"]!);
            if (Distance(pose.Position, seatPos) > 1.6) { await ActionReject("SitDown", "TOO_FAR", request.RequestId); return; }
            var otherPoses = await redisStore.GetPlayerPosesAsync(me.SessionId);
            var activePlayerIds = await db.Players.Where(p => p.SessionId == me.SessionId && p.Id != me.Id && p.Connected).Select(p => p.Id).ToListAsync();
            if (activePlayerIds.Any(id => (otherPoses.TryGetValue(id, out var op) ? op.SeatId : null) == request.SeatId))
            { await ActionReject("SitDown", "SEAT_TAKEN", request.RequestId); return; }
            pose.Position = seatPos; pose.Mode = "seated"; pose.SeatId = request.SeatId; pose.Yaw = LocationScene.N(seat, "yaw"); pose.JumpOffset = 0;
            await redisStore.SetPlayerPoseAsync(me.SessionId, me.Id, pose);
            me.PoseJson = JsonData.Write(pose);
            await redisStore.RememberCommandAsync(me.SessionId, me.Id, "SitDown", request.RequestId);
            await db.SaveChangesAsync();
            await BroadcastPlayers(me.SessionId); await BroadcastParticipants(me.SessionId);
        }
        finally { gate.Lock.Release(); }
    }

    public async Task StandUp(CommandRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            var location = await Location(me);
            if (request == null || !ValidRequestId(request.RequestId)) { await ActionReject("StandUp", "INVALID_POSE", request?.RequestId); return; }
            if (await redisStore.HasSeenCommandAsync(me.SessionId, me.Id, "StandUp", request.RequestId)) { await BroadcastPlayers(me.SessionId); return; }
            var pose = await redisStore.GetPlayerPoseAsync(me.SessionId, me.Id) ?? JsonData.Read<PoseData>(me.PoseJson);
            if (pose.Mode != "seated") { await ActionReject("StandUp", "WRONG_MODE", request.RequestId); return; }
            var exit = LocationScene.Point(location.Seat(pose.SeatId!)["exit"]!);
            if (location.SolidAt(exit)) { await ActionReject("StandUp", "COLLISION", request.RequestId); return; }
            pose.Position = exit; pose.Mode = "walking"; pose.SeatId = null;
            await redisStore.SetPlayerPoseAsync(me.SessionId, me.Id, pose);
            me.PoseJson = JsonData.Write(pose);
            await redisStore.RememberCommandAsync(me.SessionId, me.Id, "StandUp", request.RequestId);
            await db.SaveChangesAsync();
            await BroadcastPlayers(me.SessionId); await BroadcastParticipants(me.SessionId);
        }
        finally { gate.Lock.Release(); }
    }

    private static bool Finite(double n) => double.IsFinite(n);
    private static double Distance(Vec3 a, Vec3 b) => Math.Sqrt(Math.Pow(a.X - b.X, 2) + Math.Pow(a.Y - b.Y, 2) + Math.Pow(a.Z - b.Z, 2));
    private Task ActionReject(string op, string code, string? requestId, long? seq = null)
    {
        GameMetrics.HubRejections.WithLabels(op, code).Inc();
        return Clients.Caller.SendAsync("ActionReject", new { op, code, message = "Действие недоступно.", requestId, seq });
    }
}
