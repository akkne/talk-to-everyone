using System.Text.Json;
using Backend;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Dialogue.Tests;

public sealed class FinalRevealTests
{
    [Fact]
    public void GeneratedMatchHasThreeFriendPairsAndFourActors()
    {
        var roster = NpcDatabase.CreateRoster();
        var reveal = JsonSerializer.SerializeToElement(GameLogic.Reveal(roster));
        Assert.Equal(10, roster.Count);
        Assert.Equal(3, reveal.GetProperty("trueFriends").GetArrayLength());
        Assert.Equal(4, reveal.GetProperty("actors").GetArrayLength());
    }

    [Fact]
    public async Task FinishAndReconnectRevealAllThreePairsAndFourActorsAfterEliminations()
    {
        var options = new DbContextOptionsBuilder<GameDb>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new GameDb(options);
        var session = new GameSession
        {
            Phase = "playing", Round = 5, RoundPhase = "debate",
            VotingJson = JsonData.Write(new VotingData { Eliminated = ["friend-1", "friend-2", "actor-7", "actor-8"], TeamScore = 300 })
        };
        db.Sessions.Add(session);
        var me = new GamePlayer { Id = "player-a", Name = "Аня", SessionId = session.Id };
        db.Players.Add(me);
        await db.SaveChangesAsync();

        var redisStore = new RedisGameStore();
        var npcs = Enumerable.Range(1, 6).Select(number => new GameNpc
        {
            Id = $"friend-{number}", SessionId = session.Id, Number = number, Name = $"Друг {number}", Role = "friend",
            RelatedNumber = number == 2 ? 0 : number % 2 == 0 ? number - 1 : number + 1
        }).Concat(Enumerable.Range(7, 4).Select(number => new GameNpc
        {
            Id = $"actor-{number}", SessionId = session.Id, Number = number, Name = $"Актёр {number}", Role = "actor"
        })).ToList();
        await redisStore.SaveNpcsAsync(session.Id, npcs);

        var events = new RecordingProxy();
        await GameLogic.Finish(db, redisStore, new RecordingHub(events), session);
        var ended = await events.Events.Reader.ReadAsync();
        Assert.Equal("GameEnded", ended.method);
        Assert.Equal(10, ended.payload.GetProperty("npcs").GetArrayLength());
        Assert.Equal(3, ended.payload.GetProperty("reveal").GetProperty("trueFriends").GetArrayLength());
        Assert.Equal(4, ended.payload.GetProperty("reveal").GetProperty("actors").GetArrayLength());
        Assert.Equal("friend-1", ended.payload.GetProperty("reveal").GetProperty("trueFriends")[0][0].GetString());
        Assert.Equal("friend-2", ended.payload.GetProperty("reveal").GetProperty("trueFriends")[0][1].GetString());
        Assert.Equal("actor-7", ended.payload.GetProperty("reveal").GetProperty("actors")[0].GetString());
        Assert.Equal(300, ended.payload.GetProperty("scoreboard")[0].GetProperty("score").GetInt32());

        var snapshot = JsonSerializer.SerializeToElement(await GameLogic.Snapshot(db, redisStore, me, new GameSettings(), new MapCatalog(Path.Combine(AppContext.BaseDirectory, "Maps"))));
        Assert.Equal(10, snapshot.GetProperty("npcs").GetArrayLength());
        Assert.Equal(3, snapshot.GetProperty("reveal").GetProperty("trueFriends").GetArrayLength());
        Assert.Equal(4, snapshot.GetProperty("reveal").GetProperty("actors").GetArrayLength());
    }
}
