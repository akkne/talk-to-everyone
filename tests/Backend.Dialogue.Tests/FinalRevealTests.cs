using System.Text.Json;
using Backend;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Dialogue.Tests;

public sealed class FinalRevealTests
{
    [Fact]
    public async Task FinishAndReconnectRevealEliminatedFriendsAndActorsWithFullRoster()
    {
        var options = new DbContextOptionsBuilder<GameDb>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new GameDb(options);
        db.Sessions.Add(new GameSession
        {
            Phase = "playing", Round = 5, RoundPhase = "debate",
            VotingJson = JsonData.Write(new VotingData { Eliminated = ["friend-a", "friend-b", "actor-a"], TeamScore = 300 })
        });
        var me = new GamePlayer { Id = "player-a", Name = "Аня" };
        db.Players.Add(me);
        db.Npcs.AddRange(
            new GameNpc { Id = "friend-a", Number = 1, Name = "А", Role = "friend", RelatedNumber = 2 },
            new GameNpc { Id = "friend-b", Number = 2, Name = "Б", Role = "friend", RelatedNumber = 1 },
            new GameNpc { Id = "actor-a", Number = 3, Name = "В", Role = "actor" });
        await db.SaveChangesAsync();

        var events = new RecordingProxy();
        await GameLogic.Finish(db, new RecordingHub(events));
        var ended = await events.Events.Reader.ReadAsync();
        Assert.Equal("GameEnded", ended.method);
        Assert.Equal(3, ended.payload.GetProperty("npcs").GetArrayLength());
        Assert.Equal("friend-a", ended.payload.GetProperty("reveal").GetProperty("trueFriends")[0][0].GetString());
        Assert.Equal("friend-b", ended.payload.GetProperty("reveal").GetProperty("trueFriends")[0][1].GetString());
        Assert.Equal("actor-a", ended.payload.GetProperty("reveal").GetProperty("actors")[0].GetString());
        Assert.Equal(300, ended.payload.GetProperty("scoreboard")[0].GetProperty("score").GetInt32());

        var snapshot = JsonSerializer.SerializeToElement(await GameLogic.Snapshot(db, me, new GameSettings()));
        Assert.Equal(3, snapshot.GetProperty("npcs").GetArrayLength());
        Assert.Equal(1, snapshot.GetProperty("reveal").GetProperty("trueFriends").GetArrayLength());
        Assert.Equal(1, snapshot.GetProperty("reveal").GetProperty("actors").GetArrayLength());
    }
}
