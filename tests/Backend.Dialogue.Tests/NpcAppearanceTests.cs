using System.Text.Json;
using Backend;
using Xunit;
namespace Backend.Dialogue.Tests;
public sealed class NpcAppearanceTests
{
    [Fact]
    public void EveryDatabasePersonaHasPublicLookWithoutRoleOrRelationships()
    {
        using var database = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Data","bots_database_v2.json")));
        var root = database.RootElement;
        var bots = root.GetProperty("pairs").EnumerateArray().SelectMany(p => new[] {p.GetProperty("bot_1"),p.GetProperty("bot_2")})
            .Concat(root.GetProperty("actors").EnumerateArray().Select(a=>a.GetProperty("bot"))).ToArray();
        Assert.Equal(80,bots.Length);
        var bald = 0;
        foreach(var bot in bots)
        {
            var persona = bot.TryGetProperty("system_prompt",out var prompt) ? prompt.GetString()! : bot.GetProperty("prompt_template").GetString()!;
            var npc = new GameNpc { Name=bot.GetProperty("name").GetString()!,Persona=persona,Role="secret",RelatedNumber=123 };
            var view = JsonSerializer.SerializeToElement(NpcAppearance.From(npc));
            var model = view.GetProperty("model"); Assert.Equal(JsonValueKind.Object,model.ValueKind);
            var hair = model.GetProperty("hair").GetString();if(hair=="bald")bald++;
            Assert.Contains(hair,model.GetProperty("gender").GetString()=="f" ? new[]{"straight","shoulder","waves","layered"} : new[]{"crop","part","fade","messy","bald"});
            var serialized=view.GetRawText();Assert.DoesNotContain("secret",serialized);Assert.DoesNotContain("Related",serialized);Assert.DoesNotContain("pair_",serialized);
            npc.Role="other";npc.RelatedNumber=456;Assert.Equal(serialized,JsonSerializer.SerializeToElement(NpcAppearance.From(npc)).GetRawText());
        }
        Assert.Equal(1,bald);
    }
}
