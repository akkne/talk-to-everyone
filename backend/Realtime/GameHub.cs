using System.Text;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public sealed record AuthRequest(string Token, string Name);
public sealed record ChunkRequest(string ReqId, string[] Ids);
public sealed record ReleaseRequest(string[] Ids);
public sealed record PoseRequest(long Seq, Vec3 Position, double Yaw, double Pitch);
public sealed record SeatRequest(string RequestId, string SeatId);
public sealed record CommandRequest(string RequestId);
public sealed record PairRequest(string RequestId, string A, string B);
public sealed record NpcRequest(string RequestId, string Npc);
public sealed record NoteRequest(string RequestId, string Npc, string Text);
public sealed record SubmitRequest(string RequestId, int Round, string? A, string? B, bool Skip);
public sealed record QuestionRequest(string RequestId, string TargetNpc, string Text);
public sealed record PingRequest(long T);

public sealed partial class GameHub(GameDb db, GameGate gate, GameSettings settings, LlmClient llm, ILogger<GameHub> log) : Hub
{
    private GamePlayer? Me => db.Players.SingleOrDefault(p => p.ConnectionId == Context.ConnectionId && p.Connected);

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = Me;
            if (me != null)
            {
                me.Connected = false; me.ConnectionId = null;
                await db.SaveChangesAsync();
                await BroadcastLobby();
            }
        }
        finally { gate.Lock.Release(); }
        await base.OnDisconnectedAsync(exception);
    }

    private async Task<GamePlayer?> Authorized()
    {
        var me = Me;
        if (me == null) await Clients.Caller.SendAsync("ServerError", new { code = "AUTH_REQUIRED", message = "Сначала войдите в игру." });
        return me;
    }

    private async Task BroadcastLobby()
    {
        var players = await db.Players.AsNoTracking().ToListAsync();
        var session = await db.Sessions.SingleAsync();
        await Clients.All.SendAsync("LobbyState", GameLogic.Lobby(players, session));
    }

    private async Task BroadcastPlayers()
    {
        var players = await db.Players.AsNoTracking().ToListAsync();
        await Clients.All.SendAsync("PlayersTick", new { players = players.Select(GameLogic.PlayerView).ToArray(), serverTime = JsonData.Now });
        await Clients.All.SendAsync("SeatState", new { seats = GameLogic.Seats(players) });
    }

    private static bool ValidRequestId(string? id) => !string.IsNullOrWhiteSpace(id) && id.Length <= 64;
    private static bool Seen(GamePlayer player, string op, string id) =>
        JsonData.Read<List<string>>(player.ProcessedJson).Contains($"{op}:{id}");
    private static void Remember(GamePlayer player, string op, string id)
    {
        var ids = JsonData.Read<List<string>>(player.ProcessedJson);
        ids.Add($"{op}:{id}");
        player.ProcessedJson = JsonData.Write(ids);
    }

    public async Task Auth(AuthRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            if (Me != null || request == null || !settings.Tokens.TryGetValue(request.Token ?? "", out var role))
            {
                await Clients.Caller.SendAsync("AuthErr", new { code = "INVALID_TOKEN", message = "Неверный токен." }); return;
            }
            var name = request.Name?.Trim() ?? "";
            if (name.Length is < 1 or > 32)
            {
                await Clients.Caller.SendAsync("AuthErr", new { code = "NAME_TAKEN", message = "Имя должно содержать 1–32 символа." }); return;
            }
            var hash = GameLogic.HashToken(request.Token!);
            var me = await db.Players.SingleOrDefaultAsync(p => p.TokenHash == hash);
            if (me == null)
            {
                if (await db.Players.AnyAsync(p => p.Name == name))
                { await Clients.Caller.SendAsync("AuthErr", new { code = "NAME_TAKEN", message = "Имя занято." }); return; }
                if (await db.Players.CountAsync() >= 8)
                { await Clients.Caller.SendAsync("AuthErr", new { code = "SESSION_FULL", message = "Комната заполнена." }); return; }
                me = new GamePlayer { Name = name, Role = role, TokenHash = hash,
                    BoardJson = JsonData.Write(new BoardData()), QuestionsJson = JsonData.Write(new QuestionData()), PoseJson = JsonData.Write(new PoseData()) };
                db.Players.Add(me);
            }
            else if (me.Name != name)
            {
                if (await db.Players.AnyAsync(p => p.Name == name && p.Id != me.Id))
                { await Clients.Caller.SendAsync("AuthErr", new { code = "NAME_TAKEN", message = "Имя занято." }); return; }
                me.Name = name;
            }
            if (me.ConnectionId != null && me.ConnectionId != Context.ConnectionId)
                await Clients.Client(me.ConnectionId).SendAsync("ServerError", new { code = "AUTH_REQUIRED", message = "Сессия открыта в другом окне." });
            me.ConnectionId = Context.ConnectionId; me.Connected = true;
            await db.SaveChangesAsync();
            await Clients.Caller.SendAsync("AuthOk", new { playerId = me.Id, sessionId = "main", role = me.Role });
            await Clients.Caller.SendAsync("StateSnapshot", await GameLogic.Snapshot(db, me, settings));
            await BroadcastLobby();
            await BroadcastPlayers();
        }
        finally { gate.Lock.Release(); }
    }

    public async Task StartGame()
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            var session = await db.Sessions.SingleAsync();
            if (me.Role != "leader" || session.Phase != "lobby") return;
            session.Phase = "playing"; session.Round = 1; session.RoundPhase = "presentation";
            session.EndsAt = JsonData.Now + settings.RoundSeconds * 1000L;
            await db.SaveChangesAsync();
            var npcs = await db.Npcs.OrderBy(n => n.Number).ToListAsync();
            await Clients.All.SendAsync("GameStarted", new { rounds = GameLogic.RoundSpecs(settings.RoundSeconds), npcs = npcs.Select(GameLogic.NpcView).ToArray(), sceneVersion = "1" });
            await Clients.All.SendAsync("RoundStarted", GameLogic.RoundView(session));
            await BroadcastLobby();
        }
        finally { gate.Lock.Release(); }
    }

    public async Task RequestChunk(ChunkRequest request)
    {
        if (await Authorized() == null) return;
        if (request?.Ids == null || request.Ids.Length > 3 || request.Ids.Length == 0 || string.IsNullOrWhiteSpace(request.ReqId))
        { await Clients.Caller.SendAsync("ServerError", new { code = "BAD_PAYLOAD", message = "Неверный запрос деталей." }); return; }
        var npcs = await db.Npcs.Where(n => request.Ids.Contains(n.Id)).ToListAsync();
        await Clients.Caller.SendAsync("ChunkData", new { reqId = request.ReqId, npcs = npcs.Select(n => new
        { id = n.Id, details = GameLogic.Details(n), sizeBytes = Encoding.UTF8.GetByteCount(JsonData.Write(GameLogic.Details(n))) }).ToArray() });
    }

    public async Task ReleaseChunk(ReleaseRequest request) { _ = await Authorized(); }
    public async Task Ping(PingRequest request)
    { if (await Authorized() != null) await Clients.Caller.SendAsync("Pong", new { t = request.T, serverTime = JsonData.Now }); }

}
