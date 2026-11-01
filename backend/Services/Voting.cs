using System.Security.Cryptography;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public static class Voting
{
    public static bool IsChoiceRound(int round) => round is 2 or 4 or 5;
    public static List<string[]> AllPairs(IEnumerable<GameNpc> npcs)
    {
        var ids = npcs.Select(n => n.Id).Order().ToArray();
        return ids.SelectMany((a, i) => ids.Skip(i + 1).Select(b => new[] { a, b })).ToList();
    }
    public static string Key(string[] pair) => GameLogic.PairKey(pair[0], pair[1]);
    public static object View(GameSession session, string playerId)
    {
        var data = JsonData.Read<VotingData>(session.VotingJson);
        return new { round = session.Round, stage = data.Stage, candidates = data.Candidates,
            eligible = data.Electorate.Contains(playerId), submitted = data.Ballots.ContainsKey(playerId),
            received = data.Ballots.Count, total = data.Electorate.Count, endsAt = session.EndsAt };
    }
    public static List<string[]> Nominations(VotingData data) => data.Ballots.Values.DistinctBy(Key).ToList();
    public static string[] PickWinner(VotingData data)
    {
        var groups = data.Ballots.Values.GroupBy(Key).ToList();
        var leaders = groups.Count == 0 ? data.Candidates : groups.Where(g => g.Count() == groups.Max(x => x.Count())).Select(g => g.First()).ToList();
        if (leaders.Count == 0) throw new InvalidOperationException("No eligible pair.");
        return leaders[RandomNumberGenerator.GetInt32(leaders.Count)];
    }
    public static int Points(GameNpc a, GameNpc b, int round) =>
        a.Role == "friend" && b.Role == "friend" && a.RelatedNumber == b.Number && b.RelatedNumber == a.Number
            ? round == 2 ? 300 : round == 4 ? 200 : 100
            : a.Role == "actor" && b.Role == "actor" ? -150 : a.Role != b.Role ? -100 : 0;

    public static async Task Broadcast(GameDb db, IHubClients<IClientProxy> clients, GameSession session)
    {
        foreach (var player in await db.Players.Where(p => p.SessionId == session.Id && p.Connected && p.ConnectionId != null).ToListAsync())
            await clients.Client(player.ConnectionId!).SendAsync("VotingState", View(session, player.Id));
    }
    public static async Task Start(GameDb db, IGameRedisStore redisStore, IHubClients<IClientProxy> clients, GameSession session, GameSettings settings)
    {
        var data = JsonData.Read<VotingData>(session.VotingJson);
        data.Stage = 1; data.Ballots.Clear();
        data.Electorate = await db.Players.Where(p => p.SessionId == session.Id && p.Connected).Select(p => p.Id).ToListAsync();
        var npcs = await redisStore.GetNpcsAsync(session.Id);
        data.Candidates = AllPairs(npcs.Where(n => !data.Eliminated.Contains(n.Id)));
        session.RoundPhase = "choice"; session.EndsAt = JsonData.Now + settings.ChoiceSeconds * 1000L;
        session.VotingJson = JsonData.Write(data); await db.SaveChangesAsync();
        await clients.Group(session.Id).SendAsync("RoundStarted", GameLogic.RoundView(session));
        await Broadcast(db, clients, session);
    }
    public static Task Start(GameDb db, IHubClients<IClientProxy> clients, GameSession session, GameSettings settings)
        => Start(db, new RedisGameStore(), clients, session, settings);

    public static async Task<bool> Advance(GameDb db, IGameRedisStore redisStore, IHubClients<IClientProxy> clients, GameSession session, GameSettings settings)
    {
        var data = JsonData.Read<VotingData>(session.VotingJson);
        if (session.RoundPhase != "choice" || data.Stage == 0) return false;
        var connectedIds = await db.Players.Where(p => p.SessionId == session.Id && p.Connected).Select(p => p.Id).ToListAsync();
        var activeElectorate = data.Electorate.Where(connectedIds.Contains).ToList();
        var allConnectedVoted = activeElectorate.Count > 0 && activeElectorate.All(data.Ballots.ContainsKey);
        if (session.EndsAt > JsonData.Now && data.Ballots.Count < data.Electorate.Count && !allConnectedVoted) return false;
        var nominations = Nominations(data);
        if (data.Stage == 1 && nominations.Count > 1)
        {
            data.Stage = 2; data.Candidates = nominations; data.Ballots.Clear();
            session.EndsAt = JsonData.Now + settings.ChoiceSeconds * 1000L;
            session.VotingJson = JsonData.Write(data); await db.SaveChangesAsync();
            await Broadcast(db, clients, session); return false;
        }
        var pair = PickWinner(data);
        var npcs = await redisStore.GetNpcsAsync(session.Id);
        var winnerNpcs = npcs.Where(n => pair.Contains(n.Id)).ToList();
        data.TeamScore += Points(winnerNpcs.Single(n => n.Id == pair[0]), winnerNpcs.Single(n => n.Id == pair[1]), session.Round);
        data.Eliminated.AddRange(pair); data.Stage = 0; data.Ballots.Clear(); data.Candidates.Clear(); data.Electorate.Clear();
        session.VotingJson = JsonData.Write(data);
        session.RoundPhase = "resolved"; session.EndsAt = JsonData.Now;
        var players = await db.Players.Where(p => p.SessionId == session.Id).ToListAsync();
        foreach (var player in players)
        {
            player.Score = data.TeamScore;
            var board = await redisStore.GetPlayerBoardAsync(session.Id, player.Id) ?? JsonData.Read<BoardData>(player.BoardJson);
            PruneBoard(board, data.Eliminated);
            await redisStore.SetPlayerBoardAsync(session.Id, player.Id, board);
            player.BoardJson = JsonData.Write(board);

            var questions = await redisStore.GetPlayerQuestionsAsync(session.Id, player.Id) ?? JsonData.Read<QuestionData>(player.QuestionsJson);
            questions.AskedTo.RemoveAll(data.Eliminated.Contains);
            await redisStore.SetPlayerQuestionsAsync(session.Id, player.Id, questions);
            player.QuestionsJson = JsonData.Write(questions);
        }
        await redisStore.RemoveMessagesByNpcIdsAsync(session.Id, data.Eliminated);
        await redisStore.RemoveChoicesByNpcIdsAsync(session.Id, data.Eliminated);
        await db.SaveChangesAsync();
        await clients.Group(session.Id).SendAsync("NpcsRemoved", new { ids = pair, teamScore = data.TeamScore });
        await clients.Group(session.Id).SendAsync("ScoreUpdate", new { players = GameLogic.Scoreboard(players) });
        foreach (var player in players.Where(p => p.Connected && p.ConnectionId != null))
        {
            var b = await redisStore.GetPlayerBoardAsync(session.Id, player.Id) ?? JsonData.Read<BoardData>(player.BoardJson);
            var q = await redisStore.GetPlayerQuestionsAsync(session.Id, player.Id) ?? JsonData.Read<QuestionData>(player.QuestionsJson);
            await clients.Client(player.ConnectionId!).SendAsync("BoardSnapshot", new { board = b, requestId = "" });
            await clients.Client(player.ConnectionId!).SendAsync("QuestionState", new { questions = q });
        }
        await Broadcast(db, clients, session);
        return true;
    }
    public static Task<bool> Advance(GameDb db, IHubClients<IClientProxy> clients, GameSession session, GameSettings settings)
        => Advance(db, new RedisGameStore(), clients, session, settings);

    private static void PruneBoard(BoardData b, List<string> eliminated)
    {
        b.Pairs.RemoveAll(pair => pair.Any(eliminated.Contains));
        b.Liars.RemoveAll(eliminated.Contains);
        foreach (var key in b.Locks.Keys.Where(k => k.Split(':').Any(eliminated.Contains)).ToList()) b.Locks.Remove(key);
        foreach (var npc in eliminated) b.Notes.Remove(npc);
    }
}
