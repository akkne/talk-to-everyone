using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public static class GameLogic
{
    public static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    public static string PairKey(string a, string b) => string.CompareOrdinal(a, b) < 0 ? $"{a}:{b}" : $"{b}:{a}";
    public static object PlayerView(GamePlayer p) => new
    {
        id = p.Id,
        name = p.Name,
        connected = p.Connected,
        pose = JsonData.Read<PoseData>(p.PoseJson),
        avatar = JsonData.Read<AvatarData>(p.AvatarJson)
    };
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
    public static object Seats(IEnumerable<GamePlayer> players, LocationScene scene) => scene.Seats.Select(seat => new
    {
        id = (string)seat!["id"]!, occupiedBy = players.FirstOrDefault(p => p.Connected && JsonData.Read<PoseData>(p.PoseJson).SeatId == (string)seat["id"]!)?.Id
    }).ToArray();
    public static object Lobby(IEnumerable<GamePlayer> players, GameSession session) => new
    {
        sessionId = session.Id, roomCode = session.RoomCode, mapId = session.MapId,
        players = players.Select(p => new
        {
            id = p.Id,
            name = p.Name,
            connected = p.Connected,
            avatar = JsonData.Read<AvatarData>(p.AvatarJson)
        }).ToArray(),
        leaderId = players.FirstOrDefault(p => p.Role == "leader" && p.Connected)?.Id ?? players.FirstOrDefault(p => p.Role == "leader")?.Id,
        minPlayers = 1,
        canStart = (session.Phase == "lobby" || session.Phase == "finished") && players.Any(p => p.Role == "leader" && p.Connected),
        started = session.Phase == "playing"
    };

    public static async Task<object> Snapshot(
        GameDb db,
        GamePlayer me,
        GameSettings settings,
        MapCatalog maps,
        IParticipantTelemetryRegistry? telemetry = null,
        ISessionPauseGate? pauseGate = null)
    {
        var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
        var players = await db.Players.AsNoTracking().Where(p => p.SessionId == me.SessionId).ToListAsync();
        var voting = JsonData.Read<VotingData>(session.VotingJson);
        var npcs = await db.Npcs.AsNoTracking()
            .Where(n => n.SessionId == me.SessionId && (session.Phase == "finished" || !voting.Eliminated.Contains(n.Id)))
            .OrderBy(n => n.Number).ToListAsync();
        var messages = await db.Messages.AsNoTracking()
            .Where(m => m.SessionId == me.SessionId && !voting.Eliminated.Contains(m.NpcId))
            .OrderBy(m => m.At).ThenBy(m => m.Id).ToListAsync();
        var juryQuestions = messages.Where(m => m.IsQuestion && m.InReplyTo != null)
            .GroupBy(m => m.InReplyTo!).ToDictionary(g => g.Key, g => g.Last());
        var playerNames = players.ToDictionary(p => p.Id, p => p.Name);
        var chat = messages.Where(m => !m.IsQuestion).Select(m =>
        {
            var question = m.InReplyTo != null && juryQuestions.TryGetValue(m.InReplyTo, out var found) ? found : null;
            return new { m.Id, npc = m.NpcId, m.Text, m.InReplyTo, m.Emotion, m.At,
                questionText = question?.Text,
                questioner = question != null && playerNames.TryGetValue(question.PlayerId, out var name) ? name : null };
        }).ToList();
        var scoreboard = session.Phase == "finished" ? Scoreboard(players) : null;
        var pause = pauseGate?.CurrentView(session, JsonData.Now) ?? new GamePauseView(false, 0L, session.EndsAt, null);
        var participants = telemetry?.BuildSnapshot(players, session) ?? [];
        var location = maps.Location(session.Id, session.MapId);
        return new
        {
            sessionId = session.Id, me = new { id = me.Id, role = me.Role }, phase = session.Phase,
            round = session.Phase == "lobby" ? null : RoundView(session, pauseGate), rounds = RoundSpecs(settings.RoundSeconds), scene = location.Data,
            gameInfo = await GameRules.InfoAsync(db, settings),
            players = players.Select(PlayerView).ToArray(), npcs = npcs.Select(NpcView).ToArray(), seats = Seats(players, location),
            board = JsonData.Read<BoardData>(me.BoardJson), questions = JsonData.Read<QuestionData>(me.QuestionsJson), chat,
            worldSizeBytes = Encoding.UTF8.GetByteCount(JsonData.Write(location.Data))
                + npcs.Sum(n => Encoding.UTF8.GetByteCount(JsonData.Write(NpcView(n)))
                    + Encoding.UTF8.GetByteCount(JsonData.Write(Details(n)))),
            score = players.ToDictionary(p => p.Id, _ => voting.TeamScore), scoreboard, teamScore = voting.TeamScore,
            voting = session.RoundPhase == "choice" ? Voting.View(session, me.Id) : null,
            reveal = session.Phase == "finished" ? Reveal(npcs) : null,
            paused = pause.Paused,
            pausedRemainingMs = pause.PausedRemainingMs,
            participants,
            speakingPlayerIds = participants.Where(p => p.Speaking).Select(p => p.Id).ToArray()
        };
    }

    public static object Reveal(List<GameNpc> npcs)
    {
        var friends = npcs.Where(n => n.Role == "friend").ToDictionary(n => n.Number);
        var pairs = new List<string[]>();
        var seen = new HashSet<string>();
        foreach (var friend in friends.Values.OrderBy(n => n.Number))
        {
            if (!friends.TryGetValue(friend.RelatedNumber, out var partner) || partner.Id == friend.Id) continue;
            if (!seen.Add(PairKey(friend.Id, partner.Id))) continue;
            pairs.Add(friend.Number < partner.Number ? [friend.Id, partner.Id] : [partner.Id, friend.Id]);
        }
        return new
        {
            trueFriends = pairs.ToArray(),
            actors = npcs.Where(n => n.Role == "actor").OrderBy(n => n.Number).Select(n => n.Id).ToArray()
        };
    }

    public static object[] Scoreboard(List<GamePlayer> players) => players.OrderByDescending(p => p.Score)
        .Select(p => (object)new { id = p.Id, score = p.Score, title = p.Score >= 500 ? "Гений дедукции" : "Судья" }).ToArray();

    public static async Task Finish(GameDb db, IHubContext<GameHub> hub, GameSession session)
    {
        var players = await db.Players.Where(p => p.SessionId == session.Id).ToListAsync();
        var voting = JsonData.Read<VotingData>(session.VotingJson);
        var npcs = await db.Npcs.AsNoTracking().Where(n => n.SessionId == session.Id).OrderBy(n => n.Number).ToListAsync();
        foreach (var player in players) player.Score = voting.TeamScore;
        session.Phase = "finished"; session.Round = 5; session.RoundPhase = "reveal"; session.EndsAt = 0;
        await db.SaveChangesAsync();
        var scoreboard = Scoreboard(players);
        await hub.Clients.Group(session.Id).SendAsync("GameEnded", new { reveal = Reveal(npcs), scoreboard, npcs = npcs.Select(NpcView).ToArray() });
        await hub.Clients.Group(session.Id).SendAsync("ScoreUpdate", new { players = scoreboard });
    }
}
