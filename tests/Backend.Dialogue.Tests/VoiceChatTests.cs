using Backend;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Backend.Dialogue.Tests;

/// <summary>
/// Intermediate and full backend tests for Stage 2A: Voice chat signaling and speaking state between judges.
/// </summary>
public sealed class VoiceChatTests
{
    /// <summary>
    /// Verifies that VoiceRoomCoordinator validates signal types, targets, and payload limits.
    /// </summary>
    [Theory]
    [InlineData("judge-1", "judge-2", "offer", "{\"sdp\":\"v=0\"}", true)]
    [InlineData("judge-1", "judge-2", "ANSWER", "{\"sdp\":\"v=0\"}", true)]
    [InlineData("judge-1", "judge-2", "ice", "{\"candidate\":\"1\"}", true)]
    [InlineData("judge-1", "judge-2", "audio-chunk", "AAAA", true)]
    [InlineData("judge-1", "judge-1", "offer", "{\"sdp\":\"v=0\"}", false)]
    [InlineData("judge-1", "judge-2", "unknown", "{\"sdp\":\"v=0\"}", false)]
    [InlineData("judge-1", "judge-2", "offer", "", false)]
    public void Stage2A_VoiceCoordinatorValidatesSignals(
        string senderId,
        string targetId,
        string signalType,
        string payload,
        bool expectedValid)
    {
        var coordinator = new VoiceRoomCoordinator();
        var ok = coordinator.TryCreateSignal(
            senderId,
            new VoiceSignalRequest(targetId, signalType, payload),
            12345L,
            out var envelope);

        Assert.Equal(expectedValid, ok);
        if (expectedValid)
        {
            Assert.NotNull(envelope);
            Assert.Equal(senderId, envelope!.SenderPlayerId);
            Assert.Equal(targetId, envelope.TargetPlayerId);
            Assert.Equal(signalType.ToLowerInvariant(), envelope.SignalType);
        }
        else
        {
            Assert.Null(envelope);
        }
    }

    /// <summary>
    /// Verifies that GameHub relays voice signals between judges, broadcasts speaking icons, and clears speaking on disconnect.
    /// </summary>
    [Fact]
    public async Task Stage2A_GameHubRelaysSignalsAndBroadcastsSpeakingStatus()
    {
        var services = new ServiceCollection();
        var databaseName = Guid.NewGuid().ToString();
        services.AddDbContext<GameDb>(o => o.UseInMemoryDatabase(databaseName));
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDb>();

        var session = new GameSession
        {
            Id = "main",
            Phase = "playing",
            Round = 1,
            RoundPhase = "presentation",
            EndsAt = JsonData.Now + 60_000L
        };
        var judgeA = new GamePlayer
        {
            Id = "judge-a",
            Name = "Судья А",
            Role = "leader",
            Connected = true,
            ConnectionId = "conn-a",
            PoseJson = JsonData.Write(new PoseData { Position = new Vec3(-1.5, 0, 3.5), Mode = "seated" })
        };
        var judgeB = new GamePlayer
        {
            Id = "judge-b",
            Name = "Судья Б",
            Role = "judge",
            Connected = true,
            ConnectionId = "conn-b",
            PoseJson = JsonData.Write(new PoseData { Position = new Vec3(1.5, 0, 3.5), Mode = "seated" })
        };

        db.Sessions.Add(session);
        judgeA.SessionId = session.Id; judgeB.SessionId = session.Id;
        db.Players.AddRange(judgeA, judgeB);
        await db.SaveChangesAsync();

        var telemetry = new ParticipantTelemetryRegistry(new PlayerActivityCatalog());
        var pauseRegistry = new SessionPauseRegistry();
        var voiceCoordinator = new VoiceRoomCoordinator();
        var gate = new GameGate();
        var settings = new GameSettings();
        var allProxy = new RecordingProxy();
        var clientProxy = new RecordingProxy();
        var director = new RoundDirector(
            provider.GetRequiredService<IServiceScopeFactory>(),
            new RecordingHub(allProxy),
            gate,
            settings,
            LlmEmotionTests.Client(new ModelTransport("neutral")),
            NullLogger<RoundDirector>.Instance,
            pauseRegistry);

        var hub = new GameHub(
            db,
            gate,
            settings,
            new MapCatalog(Path.Combine(AppContext.BaseDirectory, "Maps")),
            LlmEmotionTests.Client(new ModelTransport("neutral")),
            director,
            telemetry,
            pauseRegistry,
            NullLogger<GameHub>.Instance,
            voiceCoordinator)
        {
            Clients = new TestHubCallerClients(allProxy, clientProxy),
            Context = new TestHubCallerContext("conn-a")
        };

        // 1. Judge A sends WebRTC offer to Judge B
        await hub.SendVoiceSignal(new VoiceSignalRequest("judge-b", "offer", "{\"sdp\":\"offer-sdp\"}"));
        Assert.True(clientProxy.Events.Reader.TryRead(out var signalEvent));
        Assert.Equal("VoiceSignalReceived", signalEvent.method);
        Assert.Equal("judge-a", signalEvent.payload.GetProperty("SenderPlayerId").GetString());
        Assert.Equal("judge-b", signalEvent.payload.GetProperty("TargetPlayerId").GetString());
        Assert.Equal("offer", signalEvent.payload.GetProperty("SignalType").GetString());

        // 2. Judge A starts speaking -> broadcasts VoiceSpeakingUpdated and ParticipantsUpdated with speaking = true
        await hub.SetVoiceSpeaking(new VoiceSpeakingRequest(true));
        Assert.True(allProxy.Events.Reader.TryRead(out var speakEvent));
        Assert.Equal("VoiceSpeakingUpdated", speakEvent.method);
        Assert.Equal("judge-a", speakEvent.payload.GetProperty("playerId").GetString());
        Assert.True(speakEvent.payload.GetProperty("speaking").GetBoolean());

        Assert.True(allProxy.Events.Reader.TryRead(out var participantsEvent));
        Assert.Equal("ParticipantsUpdated", participantsEvent.method);
        var firstParticipant = participantsEvent.payload.GetProperty("participants")[0];
        Assert.Equal("judge-a", firstParticipant.GetProperty("Id").GetString());
        Assert.True(firstParticipant.GetProperty("Speaking").GetBoolean());

        // 3. Judge A disconnects while speaking -> VoiceSpeakingUpdated (speaking = false) is broadcast automatically
        while (allProxy.Events.Reader.TryRead(out _)) { }
        await hub.OnDisconnectedAsync(null);
        var disconnectEvents = new List<(string method, System.Text.Json.JsonElement payload)>();
        while (allProxy.Events.Reader.TryRead(out var ev))
        {
            disconnectEvents.Add(ev);
        }

        var resetSpeak = Assert.Single(disconnectEvents, e => e.method == "VoiceSpeakingUpdated");
        Assert.Equal("judge-a", resetSpeak.payload.GetProperty("playerId").GetString());
        Assert.False(resetSpeak.payload.GetProperty("speaking").GetBoolean());
    }
}
