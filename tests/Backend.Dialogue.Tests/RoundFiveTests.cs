using System.Net;
using System.Text.Json;
using System.Threading.Channels;
using Backend;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Backend.Dialogue.Tests;

public sealed class RoundFiveTests
{
    [Fact]
    public void FallbackLinesStayDistinctAndPassSpeechPolicy()
    {
        var roster = Enumerable.Range(1, 10).Select(number => new GameNpc
        {
            Id = $"npc-{number}", Number = number, Name = $"Участник{number}", RelatedNumber = number == 10 ? 1 : number + 1
        }).ToArray();
        var policy = new NpcSpeechPolicy();
        foreach (var round in new[] { 1, 2, 3, 4, 5 })
        {
            var lines = roster.Select(npc =>
            {
                var speech = NpcFallbackSpeech.For(npc, round);
                Assert.Null(policy.Reject(npc, roster, speech.text, []));
                Assert.DoesNotContain("я тоже", speech.text, StringComparison.OrdinalIgnoreCase);
                return speech.text;
            }).ToArray();
            Assert.Equal(10, lines.Distinct().Count());
        }
    }

    [Fact]
    public async Task RestartedDirectorResumesAfterSavedSlot()
    {
        var services = new ServiceCollection();
        var databaseName = Guid.NewGuid().ToString();
        services.AddDbContext<GameDb>(o => o.UseInMemoryDatabase(databaseName));
        using var provider = services.BuildServiceProvider();
        var session = new GameSession { Phase = "playing", Round = 2, RoundPhase = "gossip", EndsAt = JsonData.Now - 1 };
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDb>();
            db.Sessions.Add(session);
            var first = LlmEmotionTests.Speaker; var second = LlmEmotionTests.Partner;
            first.SessionId = session.Id; second.SessionId = session.Id;
            db.Npcs.AddRange(first, second);
            NpcConversationLog.Append(db, session, "Я уже рассказала свою историю.", first.Id);
            await db.SaveChangesAsync();
        }
        var events = new RecordingProxy();
        var director = new RoundDirector(provider.GetRequiredService<IServiceScopeFactory>(), new RecordingHub(events),
            new GameGate(), new GameSettings(), LlmEmotionTests.Client(new ModelTransport("happy")),
            NullLogger<RoundDirector>.Instance, new SessionPauseRegistry());
        try
        {
            director.TriggerRound(session.Id, 2, "gossip");
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var thinking = await events.Events.Reader.ReadAsync(deadline.Token);
            var speaking = await events.Events.Reader.ReadAsync(deadline.Token);
            Assert.Equal("NpcThinking", thinking.method);
            Assert.Equal("NpcSay", speaking.method);
            Assert.Equal("npc-2", speaking.payload.GetProperty("npc").GetString());
            while (!director.IsRoundComplete(session.Id, 2)) await Task.Delay(20, deadline.Token);
            Assert.False(events.Events.Reader.TryRead(out _));
        }
        finally { director.CancelCurrentRound(session.Id); }
    }

    [Fact]
    public async Task FailedModelReplyStillProducesEverySlotInOrder()
    {
        var services = new ServiceCollection();
        var databaseName = Guid.NewGuid().ToString();
        services.AddDbContext<GameDb>(o => o.UseInMemoryDatabase(databaseName));
        using var provider = services.BuildServiceProvider();
        var session = new GameSession { Phase = "playing", Round = 1, RoundPhase = "presentation", EndsAt = JsonData.Now - 1 };
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDb>();
            db.Sessions.Add(session);
            var first = LlmEmotionTests.Speaker; var second = LlmEmotionTests.Partner;
            first.SessionId = session.Id; second.SessionId = session.Id;
            db.Npcs.AddRange(first, second);
            await db.SaveChangesAsync();
        }
        var events = new RecordingProxy();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["OLLAMA_BASE_URL"] = "http://fake-ollama", ["OLLAMA_MODEL"] = "test-model"
        }).Build();
        var director = new RoundDirector(provider.GetRequiredService<IServiceScopeFactory>(), new RecordingHub(events),
            new GameGate(), new GameSettings(), new LlmClient(new HttpClient(new BrokenFirstTransport()), config, NullLogger<LlmClient>.Instance),
            NullLogger<RoundDirector>.Instance, new SessionPauseRegistry());
        try
        {
            director.TriggerRound(session.Id, 1, "presentation");
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            var sequence = new List<string>();
            var replies = new List<JsonElement>();
            while (replies.Count < 2)
            {
                var item = await events.Events.Reader.ReadAsync(deadline.Token);
                sequence.Add(item.method);
                if (item.method == "NpcSay") replies.Add(item.payload);
            }
            Assert.Equal(new[] { "NpcThinking", "NpcSay", "NpcThinking", "NpcSay" }, sequence);
            Assert.Equal(new[] { "npc-1", "npc-2" }, replies.Select(r => r.GetProperty("npc").GetString()));
            Assert.Equal(NpcFallbackSpeech.For(LlmEmotionTests.Speaker, 1).text, replies[0].GetProperty("text").GetString());
            Assert.Equal(ModelTransport.Reply, replies[1].GetProperty("text").GetString());
            using var scope = provider.CreateScope();
            Assert.Equal(2, await scope.ServiceProvider.GetRequiredService<GameDb>().Messages.CountAsync());
            while (!director.IsRoundComplete(session.Id, 1)) await Task.Delay(20, deadline.Token);
        }
        finally { director.CancelCurrentRound(session.Id); }
    }

    [Fact]
    public async Task Stages1And3_RealRoundFiveDirectorPersistsAndBroadcastsEmotionForEachNpc()
    {
        var services = new ServiceCollection();
        var databaseName = Guid.NewGuid().ToString();
        services.AddDbContext<GameDb>(o => o.UseInMemoryDatabase(databaseName));
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
            db.Npcs.AddRange(speaker, partner);
            await db.SaveChangesAsync();
        }
        var events = new RecordingProxy();
        var transport = new ModelTransport("angry");
        var director = new RoundDirector(provider.GetRequiredService<IServiceScopeFactory>(), new RecordingHub(events),
            new GameGate(), new GameSettings(), LlmEmotionTests.Client(transport), NullLogger<RoundDirector>.Instance, new SessionPauseRegistry());
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
            using var scope = provider.CreateScope();
            var saved = await scope.ServiceProvider.GetRequiredService<GameDb>().Messages.OrderBy(m => m.At).ToListAsync();
            Assert.Equal(2, saved.Count);
            Assert.All(saved, m => Assert.Equal("angry", m.Emotion));
            Assert.Contains(ModelTransport.Reply, transport.Requests[1].GetProperty("messages")[1].GetProperty("content").GetString());
        }
        finally { director.CancelCurrentRound(sessionId); }
    }
}

internal sealed class BrokenFirstTransport : HttpMessageHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        if (request.RequestUri!.AbsolutePath == "/api/tags") return Json(new { models = new[] { new { name = "test-model" } } });
        var payload = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
        var system = payload.RootElement.GetProperty("messages")[0].GetProperty("content").GetString()!;
        var content = system.Contains("слот №1") ? "{\"text\": " : JsonSerializer.Serialize(new { text = ModelTransport.Reply, emotion = "happy" });
        return Json(new { message = new { content } });
    }

    private static HttpResponseMessage Json(object value) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(value), System.Text.Encoding.UTF8, "application/json")
    };
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
