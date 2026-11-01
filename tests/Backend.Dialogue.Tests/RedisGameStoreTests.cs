using Backend;
using Xunit;

namespace Backend.Dialogue.Tests;

public sealed class RedisGameStoreTests
{
    [Fact]
    public async Task NpcsAreSavedRetrievedAndDeletedPerSession()
    {
        var store = new RedisGameStore();
        var sessionId = "session-test-1";

        var npcs = new List<GameNpc>
        {
            new() { Id = "npc-1", SessionId = sessionId, Number = 1, Name = "Алиса", Role = "friend", RelatedNumber = 2 },
            new() { Id = "npc-2", SessionId = sessionId, Number = 2, Name = "Борис", Role = "friend", RelatedNumber = 1 }
        };

        await store.SaveNpcsAsync(sessionId, npcs);
        var retrieved = await store.GetNpcsAsync(sessionId);
        Assert.Equal(2, retrieved.Count);
        Assert.Equal("Алиса", retrieved[0].Name);

        var single = await store.GetNpcAsync(sessionId, "npc-2");
        Assert.NotNull(single);
        Assert.Equal("Борис", single.Name);

        await store.DeleteNpcsAsync(sessionId);
        var empty = await store.GetNpcsAsync(sessionId);
        Assert.Empty(empty);
    }

    [Fact]
    public async Task PlayerMovementAndPosesAreStoredAndUpdatedFast()
    {
        var store = new RedisGameStore();
        var sessionId = "session-move-1";
        var playerId = "player-1";

        var pose1 = new PoseData { Position = new Vec3(1, 0, 1), Yaw = 0.5, Seq = 10, Mode = "walking" };
        await store.SetPlayerPoseAsync(sessionId, playerId, pose1);

        var retrieved = await store.GetPlayerPoseAsync(sessionId, playerId);
        Assert.NotNull(retrieved);
        Assert.Equal(1, retrieved.Position.X);
        Assert.Equal("walking", retrieved.Mode);

        var pose2 = new PoseData { Position = new Vec3(2, 0, 2), Yaw = 1.0, Seq = 11, Mode = "seated", SeatId = "seat-1" };
        await store.SetPlayerPoseAsync(sessionId, playerId, pose2);

        var allPoses = await store.GetPlayerPosesAsync(sessionId);
        Assert.True(allPoses.ContainsKey(playerId));
        Assert.Equal("seated", allPoses[playerId].Mode);
        Assert.Equal("seat-1", allPoses[playerId].SeatId);

        await store.ResetPosesAsync(sessionId);
        var cleared = await store.GetPlayerPosesAsync(sessionId);
        Assert.Empty(cleared);
    }

    [Fact]
    public async Task ConversationEventsAndMessagesAreLoggedAndPruned()
    {
        var store = new RedisGameStore();
        var sessionId = "session-chat-1";

        var msg1 = new GameMessage { Id = "m-1", SessionId = sessionId, NpcId = "npc-1", Text = "Привет!", At = 100 };
        var msg2 = new GameMessage { Id = "m-2", SessionId = sessionId, NpcId = "npc-2", Text = "Пока!", At = 200 };
        await store.AddMessageAsync(sessionId, msg1);
        await store.AddMessageAsync(sessionId, msg2);

        var allMessages = await store.GetMessagesAsync(sessionId);
        Assert.Equal(2, allMessages.Count);

        var ev1 = new NpcConversationEvent { Id = "ev-1", SessionId = sessionId, GameId = "game-1", Sequence = 1, Text = "Реплика 1" };
        var ev2 = new NpcConversationEvent { Id = "ev-2", SessionId = sessionId, GameId = "game-1", Sequence = 2, Text = "Реплика 2" };
        await store.AddConversationEventAsync(sessionId, ev1);
        await store.AddConversationEventAsync(sessionId, ev2);

        var events = await store.GetConversationEventsAsync(sessionId, "game-1");
        Assert.Equal(2, events.Count);

        // Prune eliminated NPC messages
        await store.RemoveMessagesByNpcIdsAsync(sessionId, ["npc-1"]);
        var remainingMessages = await store.GetMessagesAsync(sessionId);
        Assert.Single(remainingMessages);
        Assert.Equal("npc-2", remainingMessages[0].NpcId);

        await store.ClearSessionGameStateAsync(sessionId);
        Assert.Empty(await store.GetMessagesAsync(sessionId));
        Assert.Empty(await store.GetConversationEventsAsync(sessionId));
    }

    [Fact]
    public async Task GamificationBoardAndQuestionsStateAreMaintained()
    {
        var store = new RedisGameStore();
        var sessionId = "session-game-1";
        var playerId = "player-1";

        var board = new BoardData
        {
            Pairs = [["npc-1", "npc-2"]],
            Liars = ["npc-3"],
            Notes = new Dictionary<string, string> { ["npc-1"] = "Не врёт" }
        };
        await store.SetPlayerBoardAsync(sessionId, playerId, board);
        var retrievedBoard = await store.GetPlayerBoardAsync(sessionId, playerId);
        Assert.NotNull(retrievedBoard);
        Assert.Single(retrievedBoard.Pairs);
        Assert.Equal("Не врёт", retrievedBoard.Notes["npc-1"]);

        var questions = new QuestionData
        {
            Remaining = 1,
            AskedTo = ["npc-1"],
            Pending = true
        };
        await store.SetPlayerQuestionsAsync(sessionId, playerId, questions);
        var retrievedQuestions = await store.GetPlayerQuestionsAsync(sessionId, playerId);
        Assert.NotNull(retrievedQuestions);
        Assert.Equal(1, retrievedQuestions.Remaining);
        Assert.True(retrievedQuestions.Pending);

        // Idempotency seen tracking
        Assert.False(await store.HasSeenCommandAsync(sessionId, playerId, "SubmitPair", "req-1"));
        await store.RememberCommandAsync(sessionId, playerId, "SubmitPair", "req-1");
        Assert.True(await store.HasSeenCommandAsync(sessionId, playerId, "SubmitPair", "req-1"));
    }
}
