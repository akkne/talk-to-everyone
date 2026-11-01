using System.Text.Json;
using System.Threading.Channels;
using Backend;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Backend.Dialogue.Tests;

public sealed class RoundFiveTests
{
    [Fact]
    public async Task Stages1And3_RealRoundFiveDirectorPersistsAndBroadcastsEmotionForEachNpc()
    {
        var services = new ServiceCollection();
        var databaseName = Guid.NewGuid().ToString();
        services.AddDbContext<GameDb>(o => o.UseInMemoryDatabase(databaseName));
        var redisStore = new RedisGameStore();
        services.AddSingleton<IGameRedisStore>(redisStore);
        using var provider = services.BuildServiceProvider();
        string sessionId;
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDb>();
            var session = new GameSession { Phase = "playing", Round = 5, RoundPhase = "debate", EndsAt = DateTimeOffset.UtcNow.AddMinutes(5).ToUnixTimeMilliseconds() };
            db.Sessions.Add(session);
            sessionId = session.Id;
            var speaker = LlmEmotionTests.Speaker; var partner = LlmEmotionTests.Partner;
            speaker.SessionId = session.Id; partner.SessionId = session.Id;
            await redisStore.SaveNpcsAsync(session.Id, [speaker, partner]);
            await db.SaveChangesAsync();
        }
        var events = new RecordingProxy();
        var transport = new ModelTransport("angry");
        var director = new RoundDirector(provider.GetRequiredService<IServiceScopeFactory>(), new RecordingHub(events),
            new GameGate(), new GameSettings(), LlmEmotionTests.Client(transport), NullLogger<RoundDirector>.Instance, new SessionPauseRegistry(), redisStore);
        try
        {
            director.TriggerRound(sessionId, 5, "debate");
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            var replies = new List<JsonElement>();
            var sequence = new List<string>();
            while (replies.Count < 2)
            {
                var item = await events.Events.Reader.ReadAsync(deadline.Token);
                sequence.Add(item.method);
                if (item.method == "NpcSay") replies.Add(item.payload);
            }
            Assert.Equal(new[] { "NpcThinking", "NpcSay", "NpcThinking", "NpcSay" }, sequence);
            Assert.Equal(new[] { "npc-1", "npc-2" }, replies.Select(r => r.GetProperty("npc").GetString()));
            Assert.All(replies, r => Assert.Equal("angry", r.GetProperty("emotion").GetString()));
            var saved = await redisStore.GetMessagesAsync(sessionId);
            Assert.Equal(2, saved.Count);
            Assert.All(saved, m => Assert.Equal("angry", m.Emotion));
        }
        finally
        {
            director.CancelCurrentRound(sessionId);
        }
    }
}


internal sealed class RecordingProxy : IClientProxy
{
    internal Channel<(string method, JsonElement payload)> Events { get; } = Channel.CreateUnbounded<(string, JsonElement)>();
    public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
    {
        Events.Writer.TryWrite((method, JsonSerializer.SerializeToElement(args[0])));
        return Task.CompletedTask;
    }
}

internal sealed class RecordingHub(RecordingProxy proxy) : IHubContext<GameHub>
{
    public IHubClients Clients { get; } = new RecordingClients(proxy);
    public IGroupManager Groups => throw new NotSupportedException();
}

internal sealed class RecordingClients(RecordingProxy proxy) : IHubClients
{
    public IClientProxy All => proxy;
    public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => proxy;
    public IClientProxy Client(string connectionId) => proxy;
    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => proxy;
    public IClientProxy Group(string groupName) => proxy;
    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => proxy;
    public IClientProxy Groups(IReadOnlyList<string> groupNames) => proxy;
    public IClientProxy User(string userId) => proxy;
    public IClientProxy Users(IReadOnlyList<string> userIds) => proxy;
}
