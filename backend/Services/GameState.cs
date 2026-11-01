using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public static class GameLogic
{
    public static readonly object Scene = new
    {
        version = "1", room = new
        {
            width = 18, depth = 14, height = 6,
            platforms = new[] { new { id = "upper", center = new Vec3(0, 1.35, -4.5), size = new Vec3(14, 0.3, 2.5) } },
            ramps = new[] { new { id = "left-ramp", from = new Vec3(-6.5, 0, 0), to = new Vec3(-6.5, 1.5, -4), width = 1.3 },
                new { id = "right-ramp", from = new Vec3(6.5, 0, 0), to = new Vec3(6.5, 1.5, -4), width = 1.3 } },
            obstacles = Array.Empty<object>(), walls = new[] {
                new { id = "back", center = new Vec3(0, 3, -7), size = new Vec3(18, 6, 0.3) },
                new { id = "front", center = new Vec3(0, 3, 7), size = new Vec3(18, 6, 0.3) },
                new { id = "left", center = new Vec3(-9, 3, 0), size = new Vec3(0.3, 6, 14) },
                new { id = "right", center = new Vec3(9, 3, 0), size = new Vec3(0.3, 6, 14) } }
        },
        npcStands = Enumerable.Range(1, 10).Select(n => new { id = $"anchor-{n}", position = new Vec3((n <= 5 ? n - 3 : n - 8) * 2.1 + (n <= 5 ? 0 : 0.45), n <= 5 ? 0 : 1.5, n <= 5 ? -2.5 : -5), yaw = 0, level = n <= 5 ? 0 : 1 }).ToArray(),
        playerSeats = Enumerable.Range(1, 8).Select(n => new { id = $"seat-{n}", position = new Vec3((n - 4.5) * 1.6, 0, 3.5), yaw = 0, exit = new Vec3((n - 4.5) * 1.6, 0, 5) }).ToArray(),
        spawnPoints = new[] { new Vec3(0, 0, 5) }
    };

    public static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    public static string PairKey(string a, string b) => string.CompareOrdinal(a, b) < 0 ? $"{a}:{b}" : $"{b}:{a}";
    public static object PlayerView(GamePlayer p) => new { id = p.Id, name = p.Name, connected = p.Connected, pose = JsonData.Read<PoseData>(p.PoseJson) };
    public static object NpcView(GameNpc n) => new { id = n.Id, number = n.Number, name = n.Name, color = n.Color, anchorId = $"anchor-{n.Number}", appearance = NpcAppearance.From(n) };
    public static object Details(GameNpc n) => new { displayName = n.Name, photoColor = n.Color, voiceHint = "neutral" };
    public static object RoundView(GameSession s, ISessionPauseGate? pauseGate = null)
    {
        var pause = pauseGate?.CurrentView(s, JsonData.Now);
        var effectiveEndsAt = pause is { Paused: true } ? pause.EndsAt : s.EndsAt;
        return new
        {
            n = s.Round,
            phase = s.RoundPhase,
            endsAt = effectiveEndsAt,
            choiceEndsAt = s.RoundPhase == "choice" ? effectiveEndsAt : (long?)null,
            paused = pause?.Paused ?? false,
            pausedRemainingMs = pause?.PausedRemainingMs ?? 0L
        };
    }
    public static object[] RoundSpecs(int durationSec) =>
    [
        new { n = 1, phase = "presentation", title = "Визитки", durationSec },
        new { n = 2, phase = "gossip", title = "Истории", durationSec },
        new { n = 3, phase = "blindspots", title = "Факты", durationSec },
        new { n = 4, phase = "interrogation", title = "Допрос", durationSec },
        new { n = 5, phase = "debate", title = "Перепалка", durationSec }
    ];
    public static object Seats(IEnumerable<GamePlayer> players) => Enumerable.Range(1, 8).Select(n => new
    {
        id = $"seat-{n}", occupiedBy = players.FirstOrDefault(p => p.Connected && JsonData.Read<PoseData>(p.PoseJson).SeatId == $"seat-{n}")?.Id
    }).ToArray();
    public static object Lobby(IEnumerable<GamePlayer> players, GameSession session) => new
    {
        sessionId = session.Id, players = players.Select(p => new { id = p.Id, name = p.Name, connected = p.Connected }).ToArray(),
        leaderId = players.FirstOrDefault(p => p.Role == "leader" && p.Connected)?.Id ?? players.FirstOrDefault(p => p.Role == "leader")?.Id,
        minPlayers = 1,
        canStart = (session.Phase == "lobby" || session.Phase == "finished") && players.Any(p => p.Role == "leader" && p.Connected),
        started = session.Phase == "playing"
    };

    public static async Task<object> Snapshot(
        GameDb db,
        GamePlayer me,
        GameSettings settings,
        IParticipantTelemetryRegistry? telemetry = null,
        ISessionPauseGate? pauseGate = null)
    {
        var session = await db.Sessions.SingleAsync();
        var players = await db.Players.AsNoTracking().ToListAsync();
        var voting = JsonData.Read<VotingData>(session.VotingJson);
        var npcs = await db.Npcs.AsNoTracking().Where(n => !voting.Eliminated.Contains(n.Id)).OrderBy(n => n.Number).ToListAsync();
        var chat = await db.Messages.AsNoTracking().Where(m => !m.IsQuestion && !voting.Eliminated.Contains(m.NpcId)).OrderBy(m => m.At).Select(m => new
        { m.Id, npc = m.NpcId, m.Text, m.InReplyTo, m.Emotion, m.At }).ToListAsync();
        var scoreboard = session.Phase == "finished" ? Scoreboard(players) : null;
        var pause = pauseGate?.CurrentView(session, JsonData.Now) ?? new GamePauseView(false, 0L, session.EndsAt, null);
        var participants = telemetry?.BuildSnapshot(players, session) ?? [];
        return new
        {
            sessionId = session.Id, me = new { id = me.Id, role = me.Role }, phase = session.Phase,
            round = session.Phase == "lobby" ? null : RoundView(session, pauseGate), rounds = RoundSpecs(settings.RoundSeconds), scene = Scene,
            gameInfo = await GameRules.InfoAsync(db, settings),
            players = players.Select(PlayerView).ToArray(), npcs = npcs.Select(NpcView).ToArray(), seats = Seats(players),
            board = JsonData.Read<BoardData>(me.BoardJson), questions = JsonData.Read<QuestionData>(me.QuestionsJson), chat,
            worldSizeBytes = Encoding.UTF8.GetByteCount(JsonData.Write(Scene))
                + npcs.Sum(n => Encoding.UTF8.GetByteCount(JsonData.Write(NpcView(n)))
                    + Encoding.UTF8.GetByteCount(JsonData.Write(Details(n)))),
            score = players.ToDictionary(p => p.Id, _ => voting.TeamScore), scoreboard, teamScore = voting.TeamScore,
            voting = session.RoundPhase == "choice" ? Voting.View(session, me.Id) : null,
            reveal = session.Phase == "finished" ? Reveal(npcs) : null,
            paused = pause.Paused,
            pausedRemainingMs = pause.PausedRemainingMs,
            participants
        };
    }

    public static object Reveal(List<GameNpc> npcs) => new
    {
        trueFriends = npcs.Where(n => n.Role == "friend" && n.Number < n.RelatedNumber && npcs.Any(other => other.Number == n.RelatedNumber))
            .Select(n => new[] { n.Id, $"npc-{n.RelatedNumber}" }).ToArray(),
        actors = npcs.Where(n => n.Role == "actor").Select(n => n.Id).ToArray()
    };

    public static object[] Scoreboard(List<GamePlayer> players) => players.OrderByDescending(p => p.Score)
        .Select(p => (object)new { id = p.Id, score = p.Score, title = p.Score >= 500 ? "Гений дедукции" : "Судья" }).ToArray();

    public static async Task Finish(GameDb db, IHubContext<GameHub> hub)
    {
        var session = await db.Sessions.SingleAsync();
        var players = await db.Players.ToListAsync();
        var voting = JsonData.Read<VotingData>(session.VotingJson);
        var npcs = await db.Npcs.Where(n => !voting.Eliminated.Contains(n.Id)).ToListAsync();
        foreach (var player in players) player.Score = voting.TeamScore;
        session.Phase = "finished"; session.Round = 5; session.RoundPhase = "reveal"; session.EndsAt = 0;
        await db.SaveChangesAsync();
        var scoreboard = Scoreboard(players);
        await hub.Clients.All.SendAsync("GameEnded", new { reveal = Reveal(npcs), scoreboard });
        await hub.Clients.All.SendAsync("ScoreUpdate", new { players = scoreboard });
    }
}
