using System.Security.Claims;
using System.Text.Json;
using Backend;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Backend.Dialogue.Tests;

/// <summary>
/// Intermediate and full backend tests for Stage 1A: Escape menu telemetry, participant actions, and host soft pause.
/// </summary>
public sealed class EscapeMenuAndPauseTests
{
    /// <summary>
    /// Verifies that all participant activity states map to accurate Russian descriptions.
    /// </summary>
    [Theory]
    [InlineData("escape_menu", "walking", "playing", "presentation", false, "Смотрит в меню")]
    [InlineData("board", "walking", "playing", "gossip", false, "Изучает доску")]
    [InlineData("listening", "walking", "playing", "presentation", false, "Слушает участника")]
    [InlineData("listening", "seated", "playing", "presentation", false, "Сидит и слушает участника")]
    [InlineData("asking_question", "walking", "playing", "interrogation", false, "Задает вопрос")]
    [InlineData("voting", "walking", "playing", "choice", false, "Выбирает пару")]
    [InlineData("", "seated", "playing", "presentation", false, "Сидит в кресле")]
    [InlineData("", "walking", "playing", "presentation", false, "Ходит по студии")]
    [InlineData("", "walking", "playing", "interrogation", true, "Задает вопрос")]
    [InlineData("", "walking", "lobby", "", false, "Ожидает в лобби")]
    [InlineData("escape_menu", "walking", "lobby", "", false, "Смотрит в меню")]
    public void Stage1A_ActivityCatalogDescribesEveryParticipantAction(
        string rawActivity,
        string poseMode,
        string sessionPhase,
        string roundPhase,
        bool pendingQuestion,
        string expectedAction)
    {
        var catalog = new PlayerActivityCatalog();
        var player = new GamePlayer
        {
            Id = "p-1",
            Name = "Судья 1",
            Connected = true,
            PoseJson = JsonData.Write(new PoseData { Mode = poseMode }),
            QuestionsJson = JsonData.Write(new QuestionData { Pending = pendingQuestion })
        };
        var session = new GameSession
        {
            Phase = sessionPhase,
            Round = 1,
            RoundPhase = roundPhase,
            VotingJson = JsonData.Write(new VotingData())
        };

        var code = catalog.NormalizeActivityCode(rawActivity, player, session);
        var description = catalog.DescribeAction(code, player, session);
        Assert.Equal(expectedAction, description);
    }

    /// <summary>
    /// Verifies that telemetry registry records clamped FPS/Ping, orders leader first, and handles disconnection.
    /// </summary>
    [Fact]
    public void Stage1A_TelemetryRegistryRecordsMetricsAndFormatsParticipantViews()
    {
        var catalog = new PlayerActivityCatalog();
        var registry = new ParticipantTelemetryRegistry(catalog);
        var session = new GameSession { Phase = "playing", Round = 2, RoundPhase = "gossip" };

        var judge = new GamePlayer
        {
            Id = "judge-1",
            Name = "Борис",
            Role = "judge",
            Connected = true,
            PoseJson = JsonData.Write(new PoseData { Mode = "seated", SeatId = "seat-1" })
        };
        var host = new GamePlayer
        {
            Id = "host-1",
            Name = "Алексей",
            Role = "leader",
            Connected = true,
            PoseJson = JsonData.Write(new PoseData { Mode = "walking" })
        };

        registry.RecordDiagnostics(judge, session, new DiagnosticsRequest(144, 28, "listening"), 1000L);
        registry.RecordDiagnostics(host, session, new DiagnosticsRequest(2500, -10, "escape_menu"), 1005L);

        var snapshot = registry.BuildSnapshot([judge, host], session);
        Assert.Equal(2, snapshot.Count);

        Assert.Equal("host-1", snapshot[0].Id);
        Assert.Equal(ParticipantTelemetryRegistry.MaxFps, snapshot[0].Fps);
        Assert.Equal(0, snapshot[0].PingMs);
        Assert.Equal("Смотрит в меню", snapshot[0].ActionText);

        Assert.Equal("judge-1", snapshot[1].Id);
        Assert.Equal(144, snapshot[1].Fps);
        Assert.Equal(28, snapshot[1].PingMs);
        Assert.Equal("Сидит и слушает участника", snapshot[1].ActionText);

        judge.Connected = false;
        registry.MarkDisconnected(judge.Id, 2000L);
        var afterDisconnect = registry.BuildSnapshot([judge, host], session);
        Assert.Equal("Нет связи", afterDisconnect[1].ActionText);
        Assert.Equal(0, afterDisconnect[1].Fps);
        Assert.Equal(0, afterDisconnect[1].PingMs);
    }

    /// <summary>
    /// Verifies that pausing preserves remaining round time and resuming shifts the round deadline forward.
    /// </summary>
    [Fact]
    public void Stage1A_PauseGateFreezesAndRestoresRemainingRoundTime()
    {
        var gate = new SessionPauseGate();
        var session = new GameSession
        {
            Phase = "playing",
            Round = 3,
            RoundPhase = "blindspots",
            EndsAt = 100_000L
        };

        var pausedView = gate.ApplyPause(session, true, "host-1", 40_000L);
        Assert.True(pausedView.Paused);
        Assert.Equal(60_000L, pausedView.PausedRemainingMs);
        Assert.Equal("host-1", pausedView.PausedBy);

        var duringPause = gate.CurrentView(session, 75_000L);
        Assert.True(duringPause.Paused);
        Assert.Equal(60_000L, duringPause.PausedRemainingMs);
        Assert.Equal(135_000L, duringPause.EndsAt);

        var resumedView = gate.ApplyPause(session, false, "host-1", 90_000L);
        Assert.False(resumedView.Paused);
        Assert.Equal(0L, resumedView.PausedRemainingMs);
        Assert.Equal(150_000L, session.EndsAt);
    }

    /// <summary>
    /// Verifies that RoundDirector suspends NPC bot speeches while paused and resumes when unpaused.
    /// </summary>
    [Fact]
    public async Task Stage1A_RoundDirectorPausesAndResumesBotSpeeches()
    {
        var services = new ServiceCollection();
        var databaseName = Guid.NewGuid().ToString();
        services.AddDbContext<GameDb>(o => o.UseInMemoryDatabase(databaseName));
        using var provider = services.BuildServiceProvider();
        GameSession session;
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDb>();
            session = new GameSession
            {
                Phase = "playing",
                Round = 1,
                RoundPhase = "presentation",
                EndsAt = DateTimeOffset.UtcNow.AddMinutes(3).ToUnixTimeMilliseconds()
            };
            db.Sessions.Add(session);
            db.Npcs.AddRange(LlmEmotionTests.Speaker, LlmEmotionTests.Partner);
            await db.SaveChangesAsync();
        }

        var pauseGate = new SessionPauseGate();
        pauseGate.ApplyPause(session, true, "host-1", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

        var events = new RecordingProxy();
        var transport = new ModelTransport("happy");
        var director = new RoundDirector(
            provider.GetRequiredService<IServiceScopeFactory>(),
            new RecordingHub(events),
            new GameGate(),
            new GameSettings(),
            LlmEmotionTests.Client(transport),
            NullLogger<RoundDirector>.Instance,
            pauseGate);

        try
        {
            director.TriggerRound(1, "presentation");
            await Task.Delay(1500);
            Assert.False(events.Events.Reader.TryRead(out _));

            pauseGate.ApplyPause(session, false, "host-1", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            var firstEvent = await events.Events.Reader.ReadAsync(deadline.Token);
            Assert.Equal("NpcThinking", firstEvent.method);
            var secondEvent = await events.Events.Reader.ReadAsync(deadline.Token);
            Assert.Equal("NpcSay", secondEvent.method);
        }
        finally
        {
            director.CancelCurrentRound();
        }
    }

    /// <summary>
    /// Verifies GameHub permissions for SetGamePause (leader vs judge) and soft pause allowing movement/board while blocking bot questions.
    /// </summary>
    [Fact]
    public async Task Stage1A_GameHubEnforcesHostPausePermissionsAndSoftPauseRules()
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
            Round = 4,
            RoundPhase = "interrogation",
            EndsAt = JsonData.Now + 60_000L
        };
        var host = new GamePlayer
        {
            Id = "host-id",
            Name = "Хост",
            Role = "leader",
            Connected = true,
            ConnectionId = "conn-host",
            BoardJson = JsonData.Write(new BoardData()),
            QuestionsJson = JsonData.Write(new QuestionData()),
            PoseJson = JsonData.Write(new PoseData { Position = new Vec3(0, 0, 5), Mode = "walking" })
        };
        var judge = new GamePlayer
        {
            Id = "judge-id",
            Name = "Судья",
            Role = "judge",
            Connected = true,
            ConnectionId = "conn-judge",
            BoardJson = JsonData.Write(new BoardData()),
            QuestionsJson = JsonData.Write(new QuestionData()),
            PoseJson = JsonData.Write(new PoseData { Position = new Vec3(0.8, 0, 3.5), Mode = "walking" })
        };

        db.Sessions.Add(session);
        db.Players.AddRange(host, judge);
        db.Npcs.AddRange(LlmEmotionTests.Speaker, LlmEmotionTests.Partner);
        await db.SaveChangesAsync();

        var telemetry = new ParticipantTelemetryRegistry(new PlayerActivityCatalog());
        var pauseGate = new SessionPauseGate();
        var gate = new GameGate();
        var settings = new GameSettings();
        var allProxy = new RecordingProxy();
        var callerProxy = new RecordingProxy();
        var director = new RoundDirector(
            provider.GetRequiredService<IServiceScopeFactory>(),
            new RecordingHub(allProxy),
            gate,
            settings,
            LlmEmotionTests.Client(new ModelTransport("neutral")),
            NullLogger<RoundDirector>.Instance,
            pauseGate);

        var hub = new GameHub(
            db,
            gate,
            settings,
            LlmEmotionTests.Client(new ModelTransport("neutral")),
            director,
            telemetry,
            pauseGate,
            NullLogger<GameHub>.Instance)
        {
            Clients = new TestHubCallerClients(allProxy, callerProxy),
            Context = new TestHubCallerContext("conn-judge")
        };

        // 1. Regular judge cannot pause the game
        await hub.SetGamePause(new PauseRequest("req-forbidden", true));
        Assert.False(pauseGate.IsPaused);
        Assert.True(callerProxy.Events.Reader.TryRead(out var rejectEvent));
        Assert.Equal("ActionReject", rejectEvent.method);
        Assert.Equal("FORBIDDEN", rejectEvent.payload.GetProperty("code").GetString());

        // 2. Host can pause the game
        hub.Context = new TestHubCallerContext("conn-host");
        await hub.SetGamePause(new PauseRequest("req-pause-1", true));
        Assert.True(pauseGate.IsPaused);

        // 3. Soft pause allows judge to move, sit down, and edit board notes
        hub.Context = new TestHubCallerContext("conn-judge");
        await hub.SitDown(new SeatRequest("req-sit-1", "seat-3"));
        var updatedJudge = await db.Players.AsNoTracking().SingleAsync(p => p.Id == "judge-id");
        Assert.Equal("seated", JsonData.Read<PoseData>(updatedJudge.PoseJson).Mode);

        await hub.SaveNote(new NoteRequest("req-note-1", "npc-1", "Подозрительная история"));
        updatedJudge = await db.Players.AsNoTracking().SingleAsync(p => p.Id == "judge-id");
        Assert.Equal("Подозрительная история", JsonData.Read<BoardData>(updatedJudge.BoardJson).Notes["npc-1"]);

        // 4. Soft pause blocks asking questions to bots while paused
        while (callerProxy.Events.Reader.TryRead(out _)) { }
        await hub.AskQuestion(new QuestionRequest("req-q-1", "npc-1", "Где ты был?"));
        Assert.True(callerProxy.Events.Reader.TryRead(out var qReject));
        Assert.Equal("QuestionReject", qReject.method);
        Assert.Equal("GAME_PAUSED", qReject.payload.GetProperty("code").GetString());

        // 5. Host unpauses the game -> bot questions work again
        hub.Context = new TestHubCallerContext("conn-host");
        await hub.SetGamePause(new PauseRequest("req-resume-1", false));
        Assert.False(pauseGate.IsPaused);

        hub.Context = new TestHubCallerContext("conn-judge");
        while (callerProxy.Events.Reader.TryRead(out _)) { }
        await hub.AskQuestion(new QuestionRequest("req-q-2", "npc-1", "Где ты был?"));
        Assert.True(callerProxy.Events.Reader.TryRead(out var qOk));
        Assert.Equal("QuestionOk", qOk.method);
    }
}

internal sealed class TestHubCallerClients(IClientProxy all, IClientProxy caller) : IHubCallerClients
{
    public IClientProxy Caller => caller;
    public IClientProxy Others => all;
    public IClientProxy All => all;
    public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => all;
    public IClientProxy Client(string connectionId) => caller;
    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => all;
    public IClientProxy Group(string groupName) => all;
    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => all;
    public IClientProxy Groups(IReadOnlyList<string> groupNames) => all;
    public IClientProxy OthersInGroup(string groupName) => all;
    public IClientProxy User(string userId) => caller;
    public IClientProxy Users(IReadOnlyList<string> userIds) => all;
}

internal sealed class TestHubCallerContext(string connectionId) : HubCallerContext
{
    public override string ConnectionId => connectionId;
    public override string? UserIdentifier => null;
    public override ClaimsPrincipal? User => null;
    public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
    public override IFeatureCollection Features { get; } = new FeatureCollection();
    public override CancellationToken ConnectionAborted => CancellationToken.None;
    public override void Abort() { }
}
