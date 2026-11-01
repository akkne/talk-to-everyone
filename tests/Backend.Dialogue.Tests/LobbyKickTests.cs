using System.Security.Claims;
using Backend;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Backend.Dialogue.Tests;

public sealed class LobbyKickTests
{
    [Fact]
    public async Task HostCanKickOnlyDuringLobbyAndKickedAccountCannotRejoin()
    {
        var services = new ServiceCollection();
        services.AddDbContext<GameDb>(options => options.UseInMemoryDatabase(Guid.NewGuid().ToString()));
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDb>();
        var session = new GameSession { Id = "room", RoomCode = "1234", Phase = "playing" };
        var host = new GamePlayer { Id = "host", SessionId = session.Id, Role = "leader", Connected = true, ConnectionId = "conn-host", Name = "Host", TokenHash = GameLogic.HashToken("user:host-account") };
        var judge = new GamePlayer { Id = "judge", SessionId = session.Id, Role = "judge", Connected = true, ConnectionId = "conn-judge", Name = "Judge", TokenHash = GameLogic.HashToken("user:judge-account") };
        db.Sessions.Add(session);
        db.Players.AddRange(host, judge);
        db.Users.Add(new UserAccount { Id = "judge-account", Login = "judge", Name = "Judge" });
        await db.SaveChangesAsync();

        var all = new RecordingProxy();
        var caller = new RecordingProxy();
        var gate = new GameGate();
        var settings = new GameSettings();
        var pauseRegistry = new SessionPauseRegistry();
        var maps = new MapCatalog(Path.Combine(AppContext.BaseDirectory, "Maps"));
        var llm = LlmEmotionTests.Client(new ModelTransport("neutral"));
        var director = new RoundDirector(provider.GetRequiredService<IServiceScopeFactory>(), new RecordingHub(all), gate, settings, llm, NullLogger<RoundDirector>.Instance, pauseRegistry);
        var hub = new GameHub(db, gate, settings, maps, llm, director, new ParticipantTelemetryRegistry(new PlayerActivityCatalog()), pauseRegistry, NullLogger<GameHub>.Instance)
        {
            Clients = new TestHubCallerClients(all, caller),
            Groups = new NoopGroupManager(),
            Context = new TestHubCallerContext("conn-judge")
        };

        await hub.KickPlayer(new KickPlayerRequest("judge-try", host.Id));
        Assert.True(caller.Events.Reader.TryRead(out var forbidden));
        Assert.Equal("FORBIDDEN", forbidden.payload.GetProperty("code").GetString());
        Assert.Equal(2, await db.Players.CountAsync());

        hub.Context = new TestHubCallerContext("conn-host");
        await hub.KickPlayer(new KickPlayerRequest("wrong-phase", judge.Id));
        Assert.True(caller.Events.Reader.TryRead(out var wrongPhase));
        Assert.Equal("WRONG_PHASE", wrongPhase.payload.GetProperty("code").GetString());
        Assert.Equal(2, await db.Players.CountAsync());

        session.Phase = "lobby";
        await db.SaveChangesAsync();
        await hub.KickPlayer(new KickPlayerRequest("self-kick", host.Id));
        Assert.True(caller.Events.Reader.TryRead(out var invalidTarget));
        Assert.Equal("INVALID_TARGET", invalidTarget.payload.GetProperty("code").GetString());
        Assert.Equal(2, await db.Players.CountAsync());

        await hub.KickPlayer(new KickPlayerRequest("kick", judge.Id));
        Assert.Equal(1, await db.Players.CountAsync());
        Assert.Contains(judge.TokenHash, JsonData.Read<List<string>>(session.KickedUserHashesJson));

        while (caller.Events.Reader.TryRead(out _)) { }
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "judge-account")], "test");
        hub.Context = new TestHubCallerContext("conn-rejoin", new ClaimsPrincipal(identity));
        await hub.Auth(new AuthRequest("1234"));
        Assert.True(caller.Events.Reader.TryRead(out var rejected));
        Assert.Equal("AuthErr", rejected.method);
        Assert.Equal("LOBBY_KICKED", rejected.payload.GetProperty("code").GetString());
        Assert.Equal(1, await db.Players.CountAsync());
    }
}

internal sealed class NoopGroupManager : IGroupManager
{
    public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
}
