using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public sealed record AuthRequest(string Token, string? Name = null);
public sealed record ChunkRequest(string ReqId, string[] Ids);
public sealed record ReleaseRequest(string[] Ids);
public sealed record PoseRequest(long Seq, Vec3 Position, double Yaw, double Pitch, double JumpOffset = 0);
public sealed record SeatRequest(string RequestId, string SeatId);
public sealed record CommandRequest(string RequestId);
public sealed record PairRequest(string RequestId, string A, string B);
public sealed record NpcRequest(string RequestId, string Npc);
public sealed record NoteRequest(string RequestId, string Npc, string Text);
public sealed record SubmitRequest(string RequestId, int Round, string? A, string? B, bool Skip, int Stage = 1);
public sealed record QuestionRequest(string RequestId, string TargetNpc, string Text);
public sealed record PingRequest(long T);
public sealed record KickPlayerRequest(string RequestId, string PlayerId);

[Authorize]
public sealed partial class GameHub(
    GameDb db,
    GameGate gate,
    GameSettings settings,
    MapCatalog maps,
    LlmClient llm,
    RoundDirector director,
    IParticipantTelemetryRegistry telemetry,
    SessionPauseRegistry pauseRegistry,
    ILogger<GameHub> log,
    IVoiceRoomCoordinator? voiceRoomCoordinator = null) : Hub
{
    private readonly IVoiceRoomCoordinator voiceRoom = voiceRoomCoordinator ?? new VoiceRoomCoordinator();
    private GamePlayer? Me => db.Players.SingleOrDefault(p => p.ConnectionId == Context.ConnectionId && p.Connected);
    private ISessionPauseGate pauseGate => pauseRegistry.For(Me?.SessionId ?? "");

    public override async Task OnConnectedAsync()
    {
        GameMetrics.SignalRConnections.Inc();
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        GameMetrics.SignalRConnections.Dec();
        await gate.Lock.WaitAsync();
        try
        {
            var me = Me;
            if (me != null)
            {
                me.Connected = false;
                me.ConnectionId = null;
                var now = JsonData.Now;
                telemetry.MarkDisconnected(me.Id, now);
                var wasSpeaking = voiceRoom.ClearSpeaker(me.Id);
                var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
                if (me.Role == "leader")
                {
                    var nextLeader = await db.Players.FirstOrDefaultAsync(p => p.SessionId == me.SessionId && p.Connected && p.Id != me.Id);
                    if (nextLeader != null)
                    {
                        me.Role = "judge";
                        nextLeader.Role = "leader";
                    }
                }
                await db.SaveChangesAsync();
                if (session.Phase == "lobby") { db.Players.Remove(me); await db.SaveChangesAsync(); }
                if (!await db.Players.AnyAsync(p => p.SessionId == me.SessionId && p.Connected))
                {
                    director.CancelCurrentRound(me.SessionId);
                    pauseRegistry.Remove(me.SessionId);
                    await LobbyDirectory.Delete(db, me.SessionId);
                    return;
                }
                if (session.Phase == "playing" && session.RoundPhase == "choice")
                {
                    await Voting.Advance(db, Clients, session, settings);
                }
                if (wasSpeaking)
                {
                    await Clients.Group(me.SessionId).SendAsync("VoiceSpeakingUpdated", new { playerId = me.Id, speaking = false, at = now });
                }
                await BroadcastLobby(me.SessionId);
                await BroadcastPlayers(me.SessionId);
                await BroadcastParticipants(me.SessionId);
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

    private async Task<LocationScene> Location(GamePlayer me)
    {
        var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
        return maps.Location(session.Id, session.MapId);
    }

    private async Task BroadcastLobby(string sessionId)
    {
        var players = await db.Players.AsNoTracking().Where(p => p.SessionId == sessionId).ToListAsync();
        var session = await db.Sessions.SingleAsync(s => s.Id == sessionId);
        await Clients.Group(sessionId).SendAsync("LobbyState", GameLogic.Lobby(players, session));
    }

    private async Task BroadcastPlayers(string sessionId)
    {
        var players = await db.Players.AsNoTracking().Where(p => p.SessionId == sessionId).ToListAsync();
        await Clients.Group(sessionId).SendAsync("PlayersTick", new { players = players.Select(GameLogic.PlayerView).ToArray(), serverTime = JsonData.Now });
        var session = await db.Sessions.SingleAsync(s => s.Id == sessionId);
        await Clients.Group(sessionId).SendAsync("SeatState", new { seats = GameLogic.Seats(players, maps.Location(session.Id, session.MapId)) });
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
            var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? Context.User?.FindFirst("sub")?.Value;
            var account = string.IsNullOrWhiteSpace(userId)
                ? null
                : await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId);
            if (account == null)
            {
                await Clients.Caller.SendAsync("AuthErr", new { code = "AUTH_REQUIRED", message = "Необходима авторизация пользователя." });
                return;
            }

            var rawToken = request?.Token?.Trim() ?? "";
            if (Me != null || request == null || rawToken.Length != 4 || !rawToken.All(char.IsAsciiDigit))
            {
                await Clients.Caller.SendAsync("AuthErr", new { code = "INVALID_TOKEN", message = "Неверный код комнаты." });
                return;
            }

            var baseName = account.Name.Trim();
            if (baseName.Length is < 1 or > 32)
            {
                await Clients.Caller.SendAsync("AuthErr", new { code = "NAME_TAKEN", message = "Имя должно содержать 1–32 символа." });
                return;
            }

            var session = await db.Sessions.SingleOrDefaultAsync(s => s.RoomCode == rawToken);
            if (session == null)
            {
                await Clients.Caller.SendAsync("AuthErr", new { code = "INVALID_TOKEN", message = "Лобби с таким кодом не найдено." });
                return;
            }
            var userHash = GameLogic.HashToken($"user:{account.Id}");
            if (JsonData.Read<List<string>>(session.KickedUserHashesJson).Contains(userHash))
            {
                await Clients.Caller.SendAsync("AuthErr", new { code = "LOBBY_KICKED", message = "Ведущий удалил вас из этого лобби." });
                return;
            }

            var allPlayers = await db.Players.Where(p => p.SessionId == session.Id).ToListAsync();
            var me = allPlayers.FirstOrDefault(p => p.TokenHash == userHash);

            var name = baseName;
            var nameConflict = allPlayers.FirstOrDefault(p => p.Id != me?.Id && string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));
            if (nameConflict != null)
            {
                if (!nameConflict.Connected && session.Phase == "lobby")
                {
                    db.Players.Remove(nameConflict);
                    allPlayers.Remove(nameConflict);
                    await db.SaveChangesAsync();
                }
                else
                {
                    var suffix = $" ({account.Login})";
                    var maxBaseLen = Math.Max(1, 32 - suffix.Length);
                    name = $"{(baseName.Length > maxBaseLen ? baseName[..maxBaseLen] : baseName)}{suffix}";
                }
            }

            if (me != null)
            {
                me.Name = name;
                me.TokenHash = userHash;
            }
            else
            {
                if (allPlayers.Count >= 8)
                {
                    var stale = allPlayers.FirstOrDefault(p => !p.Connected && session.Phase == "lobby");
                    if (stale != null)
                    {
                        db.Players.Remove(stale);
                        allPlayers.Remove(stale);
                        await db.SaveChangesAsync();
                    }
                    else
                    {
                        await Clients.Caller.SendAsync("AuthErr", new { code = "SESSION_FULL", message = "Комната заполнена (максимум 8 игроков)." });
                        return;
                    }
                }

                var idx = allPlayers.Count;
                var initialPose = new PoseData
                {
                    Position = maps.Location(session.Id, session.MapId).Spawn(idx)
                };

                me = new GamePlayer
                {
                    Name = name,
                    Role = "judge",
                    SessionId = session.Id,
                    TokenHash = userHash,
                    Score = JsonData.Read<VotingData>(session.VotingJson).TeamScore,
                    BoardJson = JsonData.Write(new BoardData()),
                    QuestionsJson = JsonData.Write(new QuestionData()),
                    PoseJson = JsonData.Write(initialPose)
                };
                db.Players.Add(me);
                allPlayers.Add(me);
            }

            var activeLeader = allPlayers.FirstOrDefault(p => p.Id != me.Id && p.Role == "leader" && p.Connected);
            if (activeLeader == null || account.Id == session.OwnerUserId)
            {
                foreach (var other in allPlayers.Where(p => p.Id != me.Id && p.Role == "leader")) other.Role = "judge";
                me.Role = "leader";
            }

            if (me.ConnectionId != null && me.ConnectionId != Context.ConnectionId)
            {
                await Clients.Client(me.ConnectionId).SendAsync("ServerError", new { code = "AUTH_REQUIRED", message = "Сессия открыта в другом окне." });
            }

            me.ConnectionId = Context.ConnectionId;
            me.Connected = true;
            await db.SaveChangesAsync();
            LobbyDirectory.Joined(session.Id);
            await Groups.AddToGroupAsync(Context.ConnectionId, session.Id);
            GameMetrics.LobbyJoins.Inc();

            await Clients.Caller.SendAsync("AuthOk", new { playerId = me.Id, sessionId = session.Id, role = me.Role });
            await Clients.Caller.SendAsync("StateSnapshot", await GameLogic.Snapshot(db, me, settings, maps, telemetry, pauseGate));
            await BroadcastLobby(me.SessionId);
            await BroadcastPlayers(me.SessionId);
            await BroadcastParticipants(me.SessionId);
        }
        finally { gate.Lock.Release(); }
    }

    public async Task StartGame()
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
            if (me.Role != "leader" || (session.Phase != "lobby" && session.Phase != "finished")) return;
            if (maps.Find(session.MapId)?.Available != true)
            {
                await Clients.Caller.SendAsync("ServerError", new { code = "MAP_UNAVAILABLE", message = "Эта карта пока недоступна для игры." });
                return;
            }
            pauseGate.Reset();
            var roster = NpcDatabase.CreateRoster();
            foreach (var npc in roster) { npc.SessionId = me.SessionId; npc.Id = $"{npc.Id}-{me.SessionId}"; }
            await using var transaction = await db.Database.BeginTransactionAsync();
            db.Messages.RemoveRange(await db.Messages.Where(m => m.SessionId == me.SessionId).ToListAsync());
            db.Choices.RemoveRange(await db.Choices.Where(c => c.SessionId == me.SessionId).ToListAsync());
            db.Npcs.RemoveRange(await db.Npcs.Where(n => n.SessionId == me.SessionId).ToListAsync());
            await db.SaveChangesAsync();
            db.Npcs.AddRange(roster);
            session.VotingJson = JsonData.Write(new VotingData());
            session.Phase = "playing"; session.Round = 1; session.RoundPhase = "presentation";
            session.EndsAt = JsonData.Now + settings.RoundSeconds * 1000L;

            var players = await db.Players.Where(p => p.SessionId == me.SessionId).ToListAsync();
            foreach (var p in players)
            {
                p.Score = 0;
                p.BoardJson = JsonData.Write(new BoardData());
                p.QuestionsJson = JsonData.Write(new QuestionData());
                p.ProcessedJson = "[]";
            }

            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            GameMetrics.GamesStarted.Inc();
            var npcs = await db.Npcs.Where(n => n.SessionId == me.SessionId).OrderBy(n => n.Number).ToListAsync();
            var scene = maps.Location(session.Id, session.MapId).Data;
            await Clients.Group(me.SessionId).SendAsync("GameStarted", new { rounds = GameLogic.RoundSpecs(settings.RoundSeconds), npcs = npcs.Select(GameLogic.NpcView).ToArray(), sceneVersion = (string?)scene["version"], scene });
            await Clients.Group(me.SessionId).SendAsync("GamePauseChanged", pauseGate.CurrentView(session, JsonData.Now));
            await Clients.Group(me.SessionId).SendAsync("RoundStarted", GameLogic.RoundView(session, pauseGate));
            foreach (var p in players.Where(p => p.Connected && p.ConnectionId != null))
            {
                await Clients.Client(p.ConnectionId!).SendAsync("BoardSnapshot", new { board = new BoardData(), requestId = "" });
                await Clients.Client(p.ConnectionId!).SendAsync("QuestionState", new { questions = new QuestionData() });
            }
            await BroadcastLobby(me.SessionId);
            await BroadcastParticipants(me.SessionId);
            director.TriggerRound(me.SessionId, 1, "presentation");
        }
        finally { gate.Lock.Release(); }
    }

    public async Task SelectMap(string mapId)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
            if (me.Role != "leader" || session.Phase != "lobby" || maps.Find(mapId) == null)
            {
                await Clients.Caller.SendAsync("ServerError", new { code = "MAP_SELECTION_REJECTED", message = "Карту может выбрать ведущий до начала игры." });
                return;
            }
            session.MapId = mapId;
            LocationScene.Drop(session.Id);
            await db.SaveChangesAsync();
            await BroadcastLobby(session.Id);
        }
        finally { gate.Lock.Release(); }
    }

    // Demo control: the leader can end the current timed phase for everyone.
    public async Task SkipRound(CommandRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            if (request == null || !ValidRequestId(request.RequestId))
            { await ActionReject("SkipRound", "INVALID_REQUEST", request?.RequestId); return; }
            var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
            if (me.Role != "leader" || session.Phase != "playing" || session.RoundPhase == "resolved")
            { await ActionReject("SkipRound", "WRONG_PHASE", request.RequestId); return; }
            if (Seen(me, "SkipRound", request.RequestId)) return;
            if (pauseGate.IsPaused)
            {
                pauseGate.Reset();
                await Clients.Group(me.SessionId).SendAsync("GamePauseChanged", pauseGate.CurrentView(session, JsonData.Now));
            }
            if (session.EndsAt <= JsonData.Now) return;
            session.EndsAt = JsonData.Now;
            Remember(me, "SkipRound", request.RequestId);
            await db.SaveChangesAsync();
            await Clients.Group(me.SessionId).SendAsync("RoundStarted", GameLogic.RoundView(session, pauseGate));
            if (session.RoundPhase == "choice") await Voting.Broadcast(db, Clients, session);
        }
        finally { gate.Lock.Release(); }
    }

    public async Task ResetGame()
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
            if (me.Role != "leader" && session.Phase != "finished") return;

            pauseGate.Reset();
            director.CancelCurrentRound(me.SessionId);
            db.Messages.RemoveRange(await db.Messages.Where(m => m.SessionId == me.SessionId).ToListAsync());
            db.Choices.RemoveRange(await db.Choices.Where(c => c.SessionId == me.SessionId).ToListAsync());
            var disconnected = await db.Players.Where(p => p.SessionId == me.SessionId && !p.Connected).ToListAsync();
            db.Players.RemoveRange(disconnected);

            LocationScene.Drop(session.Id);
            session.Phase = "lobby";
            session.Round = 0;
            session.RoundPhase = "";
            session.EndsAt = 0;
            session.VotingJson = JsonData.Write(new VotingData());

            var connectedPlayers = await db.Players.Where(p => p.SessionId == me.SessionId && p.Connected).ToListAsync();
            var idx = 0;
            foreach (var p in connectedPlayers)
            {
                p.Score = 0;
                p.BoardJson = JsonData.Write(new BoardData());
                p.QuestionsJson = JsonData.Write(new QuestionData());
                p.ProcessedJson = "[]";
                p.PoseJson = JsonData.Write(new PoseData { Position = maps.Location(session.Id, session.MapId).Spawn(idx) });
                idx++;
            }
            if (connectedPlayers.Count > 0 && !connectedPlayers.Any(p => p.Role == "leader"))
            {
                connectedPlayers[0].Role = "leader";
            }

            await db.SaveChangesAsync();

            foreach (var p in connectedPlayers.Where(p => p.ConnectionId != null))
            {
                await Clients.Client(p.ConnectionId!).SendAsync("StateSnapshot", await GameLogic.Snapshot(db, p, settings, maps, telemetry, pauseGate));
            }
            await BroadcastLobby(me.SessionId);
            await BroadcastPlayers(me.SessionId);
            await BroadcastParticipants(me.SessionId);
        }
        finally { gate.Lock.Release(); }
    }

    public async Task RequestChunk(ChunkRequest request)
    {
        var me = await Authorized(); if (me == null) return;
        if (request?.Ids == null || request.Ids.Length > 3 || request.Ids.Length == 0 || string.IsNullOrWhiteSpace(request.ReqId))
        { await Clients.Caller.SendAsync("ServerError", new { code = "BAD_PAYLOAD", message = "Неверный запрос деталей." }); return; }
        var eliminated = JsonData.Read<VotingData>((await db.Sessions.SingleAsync(s => s.Id == me.SessionId)).VotingJson).Eliminated;
        var npcs = await db.Npcs.Where(n => n.SessionId == me.SessionId && request.Ids.Contains(n.Id) && !eliminated.Contains(n.Id)).ToListAsync();
        await Clients.Caller.SendAsync("ChunkData", new { reqId = request.ReqId, npcs = npcs.Select(n => new
        { id = n.Id, details = GameLogic.Details(n), sizeBytes = Encoding.UTF8.GetByteCount(JsonData.Write(GameLogic.Details(n))) }).ToArray() });
    }

    public async Task ReleaseChunk(ReleaseRequest request) { _ = await Authorized(); }
    public async Task Ping(PingRequest request)
    { if (await Authorized() != null) await Clients.Caller.SendAsync("Pong", new { t = request.T, serverTime = JsonData.Now }); }
}
