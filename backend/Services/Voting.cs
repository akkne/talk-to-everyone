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
        foreach (var player in await db.Players.Where(p => p.Connected && p.ConnectionId != null).ToListAsync())
            await clients.Client(player.ConnectionId!).SendAsync("VotingState", View(session, player.Id));
    }
    public static async Task Start(GameDb db, IHubClients<IClientProxy> clients, GameSession session, GameSettings settings)
    {
        var data = JsonData.Read<VotingData>(session.VotingJson);
        data.Stage = 1; data.Ballots.Clear();
        data.Electorate = await db.Players.Where(p => p.Connected).Select(p => p.Id).ToListAsync();
        data.Candidates = AllPairs(await db.Npcs.Where(n => !data.Eliminated.Contains(n.Id)).ToListAsync());
        session.RoundPhase = "choice"; session.EndsAt = JsonData.Now + settings.ChoiceSeconds * 1000L;
        session.VotingJson = JsonData.Write(data); await db.SaveChangesAsync();
        await clients.All.SendAsync("RoundStarted", GameLogic.RoundView(session));
        await Broadcast(db, clients, session);
    }
    // Called under GameGate by the clock or immediately after the last ballot.
    public static async Task<bool> Advance(GameDb db, IHubClients<IClientProxy> clients, GameSession session, GameSettings settings)
    {
        var data = JsonData.Read<VotingData>(session.VotingJson);
        if (session.RoundPhase != "choice" || data.Stage == 0) return false;
        var connectedIds = await db.Players.Where(p => p.Connected).Select(p => p.Id).ToListAsync();
        var activeElectorate = data.Electorate.Where(connectedIds.Contains).ToList();
        var allConnectedVoted = activeElectorate.Count > 0 && activeElectorate.All(data.Ballots.ContainsKey);
        if (session.EndsAt > JsonData.Now && data.Ballots.Count < data.Electorate.Count && !allConnectedVoted) return false;
        var nominations = Nominations(data);
        if (data.Stage == 1 && nominations.Count > 1)
        {
            data.Stage = 2; data.Candidates = nominations; data.Ballots.Clear();
            // Disconnected jurors may rejoin; their absence cannot block the timer.
            session.EndsAt = JsonData.Now + settings.ChoiceSeconds * 1000L;
            session.VotingJson = JsonData.Write(data); await db.SaveChangesAsync();
            await Broadcast(db, clients, session); return false;
        }
        var pair = PickWinner(data);
        var npcs = await db.Npcs.Where(n => pair.Contains(n.Id)).ToListAsync();
        data.TeamScore += Points(npcs.Single(n => n.Id == pair[0]), npcs.Single(n => n.Id == pair[1]), session.Round);
        data.Eliminated.AddRange(pair); data.Stage = 0; data.Ballots.Clear(); data.Candidates.Clear(); data.Electorate.Clear();
        session.VotingJson = JsonData.Write(data);
        session.RoundPhase = "resolved"; session.EndsAt = JsonData.Now;
        foreach (var player in await db.Players.ToListAsync())
        {
            player.Score = data.TeamScore;
            var board = JsonData.Read<BoardData>(player.BoardJson);
            PruneBoard(board, data.Eliminated);
            player.BoardJson = JsonData.Write(board);
            var questions = JsonData.Read<QuestionData>(player.QuestionsJson);
            questions.AskedTo.RemoveAll(data.Eliminated.Contains);
            player.QuestionsJson = JsonData.Write(questions);
        }
        db.Messages.RemoveRange(await db.Messages.Where(m => data.Eliminated.Contains(m.NpcId)).ToListAsync());
        // Retire legacy individual choices too; only the team result is retained.
        db.Choices.RemoveRange(await db.Choices.Where(c => data.Eliminated.Contains(c.A!) || data.Eliminated.Contains(c.B!)).ToListAsync());
        await db.SaveChangesAsync();
        await clients.All.SendAsync("NpcsRemoved", new { ids = pair, teamScore = data.TeamScore });
        await clients.All.SendAsync("ScoreUpdate", new { players = GameLogic.Scoreboard(await db.Players.ToListAsync()) });
        foreach (var player in await db.Players.Where(p => p.Connected && p.ConnectionId != null).ToListAsync())
        {
            await clients.Client(player.ConnectionId!).SendAsync("BoardSnapshot", new { board = JsonData.Read<BoardData>(player.BoardJson), requestId = "" });
            await clients.Client(player.ConnectionId!).SendAsync("QuestionState", new { questions = JsonData.Read<QuestionData>(player.QuestionsJson) });
        }
        await Broadcast(db, clients, session);
        return true;
    }

    public static void PruneBoard(BoardData board, List<string> removed)
    {
        board.Pairs.RemoveAll(p => p.Any(removed.Contains)); board.Liars.RemoveAll(removed.Contains);
        foreach (var key in board.Notes.Keys.Where(removed.Contains).ToArray()) board.Notes.Remove(key);
        foreach (var key in board.Locks.Keys.Where(k => k.Split(':').Any(removed.Contains)).ToArray()) board.Locks.Remove(key);
        foreach (var key in board.Submitted.Where(p => p.Value?.Any(removed.Contains) == true).Select(p => p.Key).ToArray()) board.Submitted.Remove(key);
    }
}
