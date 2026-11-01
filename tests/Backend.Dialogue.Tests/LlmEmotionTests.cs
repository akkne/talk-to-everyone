using System.Net;
using System.Text.Json;
using Backend;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Backend.Dialogue.Tests;

public sealed class LlmEmotionTests
{
    internal static GameNpc Speaker => new() { Id = "npc-1", Name = "Аня", Number = 1, Role = "friend", RelatedNumber = 2, Persona = "Решительная и эмоциональная", Lore = "Дружим с детства" };
    internal static GameNpc Partner => new() { Id = "npc-2", Name = "Боря", Number = 2, Role = "friend", RelatedNumber = 1 };

    [Theory]
    [InlineData("neutral", "neutral")]
    [InlineData("happy", "happy")]
    [InlineData("sad", "sad")]
    [InlineData("angry", "angry")]
    [InlineData("surprised", "surprised")]
    [InlineData(" RAGE ", "angry")]
    [InlineData("ROFL", "happy")]
    [InlineData("SMIRK", "happy")]
    [InlineData("SWEAT", "sad")]
    [InlineData("FACEPALM", "sad")]
    [InlineData("SHOCK", "surprised")]
    [InlineData("invented", "neutral")]
    [InlineData(null, "neutral")]
    public async Task Stage1_QuestionCarriesNormalizedModelEmotion(string? raw, string expected)
    {
        var transport = new ModelTransport(raw);
        var result = await Client(transport).Answer(Speaker, "Ты врёшь о своём друге?", [], [Speaker, Partner]);
        Assert.Equal(expected, result.emotion);
        Assert.Equal(ModelTransport.Reply, result.text);
        var request = Assert.Single(transport.Requests);
        Assert.Contains("команда анимации", request.GetProperty("messages")[0].GetProperty("content").GetString());
        Assert.Contains("Ты врёшь", request.GetProperty("messages")[1].GetProperty("content").GetString());
        Assert.Equal(new[] { "neutral", "happy", "sad", "angry", "surprised" },
            request.GetProperty("format").GetProperty("properties").GetProperty("emotion").GetProperty("enum").EnumerateArray().Select(e => e.GetString()));
    }

    [Theory]
    [InlineData(1, "presentation")]
    [InlineData(2, "gossip")]
    [InlineData(3, "blindspots")]
    [InlineData(5, "debate")]
    public async Task Stage1_AllAutomaticRoundsRequestAnEmotion(int round, string phase)
    {
        var transport = new ModelTransport("angry");
        var result = await Client(transport).GenerateRoundSpeech(Speaker, round, phase, [Speaker, Partner],
            [new GameMessage { NpcId = Partner.Id, Text = "Я не верю твоей истории!", At = 10 }]);
        Assert.Equal("angry", result.emotion);
        var prompt = Assert.Single(transport.Requests).GetProperty("messages")[1].GetProperty("content").GetString()!;
        Assert.Contains("emotion", prompt);
        if (round == 5)
        {
            Assert.Contains("Раунд 5", prompt);
            Assert.Contains(Partner.Name, prompt);
            Assert.Contains("Я не верю твоей истории!", prompt);
        }
    }

    [Fact]
    public async Task Stage1_InvalidEmotionTypeFallsBackWithoutLosingSpeech()
    {
        var transport = new ModelTransport("unused") { EmotionAsNumber = true };
        var result = await Client(transport).Answer(Speaker, "Расскажи историю", []);
        Assert.Equal("neutral", result.emotion);
        Assert.Equal(ModelTransport.Reply, result.text);
    }

    internal static LlmClient Client(ModelTransport transport) => new(new HttpClient(transport),
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["OLLAMA_BASE_URL"] = "http://fake-ollama", ["OLLAMA_MODEL"] = "test-model"
        }).Build(), NullLogger<LlmClient>.Instance);
}

internal sealed class ModelTransport(string? emotion) : HttpMessageHandler
{
    internal const string Reply = "Не согласна! Я защищаю своего друга и помню нашу общую историю.";
    internal List<JsonElement> Requests { get; } = [];
    internal bool EmotionAsNumber { get; init; }
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        if (request.RequestUri!.AbsolutePath == "/api/tags")
            return Json(new { models = new[] { new { name = "test-model" } } });
        Requests.Add(JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)).RootElement.Clone());
        return Json(new { message = new { content = JsonSerializer.Serialize(new { text = Reply, emotion = EmotionAsNumber ? (object)42 : emotion }) } });
    }
    private static HttpResponseMessage Json(object value) => new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(value), System.Text.Encoding.UTF8, "application/json") };
}
