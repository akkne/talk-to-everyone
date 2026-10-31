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
            var pose = JsonData.Read<PoseData>(me.PoseJson);
            if (request.Seq <= pose.Seq || request.Position == null || !Finite(request.Yaw) || !Finite(request.Pitch) || !Finite(request.Position.X) || !Finite(request.Position.Y) || !Finite(request.Position.Z) || Math.Abs(request.Pitch) > Math.PI / 3)
            { await ActionReject("SendPose", "INVALID_POSE", null, request.Seq); return; }
            var now = JsonData.Now;
            if (pose.UpdatedAt != 0 && now - pose.UpdatedAt < 80) return;
            if (pose.Mode == "seated")
            {
                if (Math.Abs(request.Yaw) > 2 * Math.PI / 3) { await ActionReject("SendPose", "INVALID_POSE", null, request.Seq); return; }
                pose.Yaw = request.Yaw; pose.Pitch = request.Pitch;
            }
            else
            {
                var p = request.Position;
                var seconds = pose.UpdatedAt == 0 ? 1 : Math.Min(1, (now - pose.UpdatedAt) / 1000.0);
                if (Math.Abs(p.X) > 8.7 || p.Z is < -6.7 or > 6.7 ||
                    Math.Abs(p.Y - GroundHeight(p)) > 0.2 || Distance(p, pose.Position) > 2.5 * seconds + 0.3)
                { await ActionReject("SendPose", "COLLISION", null, request.Seq); return; }
                pose.Position = p; pose.Yaw = request.Yaw; pose.Pitch = request.Pitch;
            }
            pose.Seq = request.Seq; pose.UpdatedAt = now; me.PoseJson = JsonData.Write(pose);
            await db.SaveChangesAsync(); await BroadcastPlayers();
        }
        finally { gate.Lock.Release(); }
    }

    public async Task SitDown(SeatRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            if (request == null || !ValidRequestId(request.RequestId)) { await ActionReject("SitDown", "INVALID_POSE", request?.RequestId); return; }
            if (Seen(me, "SitDown", request.RequestId)) { await BroadcastPlayers(); return; }
            var pose = JsonData.Read<PoseData>(me.PoseJson);
            var seat = Enumerable.Range(1, 8).FirstOrDefault(n => request.SeatId == $"seat-{n}");
            if (seat == 0 || pose.Mode != "walking") { await ActionReject("SitDown", "WRONG_MODE", request.RequestId); return; }
            var seatPos = new Vec3((seat - 4.5) * 1.6, 0, 3.5);
            if (Distance(pose.Position, seatPos) > 1.5) { await ActionReject("SitDown", "TOO_FAR", request.RequestId); return; }
            if ((await db.Players.Where(p => p.Id != me.Id).Select(p => p.PoseJson).ToListAsync())
                .Any(json => JsonData.Read<PoseData>(json).SeatId == request.SeatId))
            { await ActionReject("SitDown", "SEAT_TAKEN", request.RequestId); return; }
            pose.Position = seatPos; pose.Mode = "seated"; pose.SeatId = request.SeatId; pose.Yaw = 0;
            me.PoseJson = JsonData.Write(pose); Remember(me, "SitDown", request.RequestId);
            await db.SaveChangesAsync(); await BroadcastPlayers();
        }
        finally { gate.Lock.Release(); }
    }

    public async Task StandUp(CommandRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            if (request == null || !ValidRequestId(request.RequestId)) { await ActionReject("StandUp", "INVALID_POSE", request?.RequestId); return; }
            if (Seen(me, "StandUp", request.RequestId)) { await BroadcastPlayers(); return; }
            var pose = JsonData.Read<PoseData>(me.PoseJson);
            if (pose.Mode != "seated") { await ActionReject("StandUp", "WRONG_MODE", request.RequestId); return; }
            pose.Position = new Vec3(pose.Position.X, 0, 5); pose.Mode = "walking"; pose.SeatId = null;
            me.PoseJson = JsonData.Write(pose); Remember(me, "StandUp", request.RequestId);
            await db.SaveChangesAsync(); await BroadcastPlayers();
        }
        finally { gate.Lock.Release(); }
    }

    private static bool Finite(double n) => double.IsFinite(n);
    private static double Distance(Vec3 a, Vec3 b) => Math.Sqrt(Math.Pow(a.X - b.X, 2) + Math.Pow(a.Y - b.Y, 2) + Math.Pow(a.Z - b.Z, 2));
    private static double GroundHeight(Vec3 p)
    {
        if (Math.Abs(Math.Abs(p.X) - 6.5) <= 0.8 && p.Z is >= -4 and <= 0)
            return -p.Z * 0.375;
        return Math.Abs(p.X) <= 7 && p.Z is >= -5.75 and <= -3.25 ? 1.5 : 0;
    }
    private Task ActionReject(string op, string code, string? requestId, long? seq = null) =>
        Clients.Caller.SendAsync("ActionReject", new { op, code, message = "Действие недоступно.", requestId, seq });

}
