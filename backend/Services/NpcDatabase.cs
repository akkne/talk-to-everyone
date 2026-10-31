using System.Security.Cryptography;
using System.Text.Json;

namespace Backend;

public static class NpcDatabase
{
    private static readonly string[] Colors = ["#d98b75", "#7db9bd", "#c39bd3", "#e2bd72", "#8fb78a", "#b0a4d4", "#d690aa", "#83a9d1", "#cfaa81", "#a9be7f"];
    private static string Required(JsonElement item, string name)
    {
        if (!item.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()))
            throw new InvalidDataException($"NPC database: missing text field '{name}'.");
        return value.GetString()!;
    }

    public static List<GameNpc> CreateRoster(string? path = null)
    {
        path ??= Environment.GetEnvironmentVariable("GAME_NPC_DATABASE") ?? Path.Combine(AppContext.BaseDirectory, "Data", "bots_database_v2.json");
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        var pairs = root.GetProperty("pairs").EnumerateArray().ToArray();
        var actors = root.GetProperty("actors").EnumerateArray().ToArray();
        if (pairs.Length < 3 || actors.Length < 4) throw new InvalidDataException("NPC database requires at least 3 pairs and 4 actors.");
        var ids = new HashSet<string>(); var pairIds = new HashSet<string>(); var actorIds = new HashSet<string>();
        foreach (var pair in pairs)
        {
            if (!pairIds.Add(Required(pair, "pair_id"))) throw new InvalidDataException("Duplicate pair_id.");
            foreach (var field in new[] { "meeting", "secret_fact", "material_link", "inside_meme" }) Required(pair.GetProperty("shared_lore"), field);
            foreach (var key in new[] { "bot_1", "bot_2" })
            {
                var bot = pair.GetProperty(key);
                if (!ids.Add(Required(bot, "id"))) throw new InvalidDataException("Duplicate bot id.");
                foreach (var field in new[] { "name", "role", "vibe", "system_prompt" }) Required(bot, field);
            }
        }
        foreach (var actor in actors)
        {
            if (!actorIds.Add(Required(actor, "actor_id"))) throw new InvalidDataException("Duplicate actor_id.");
            var bot = actor.GetProperty("bot");
            if (!ids.Add(Required(bot, "id"))) throw new InvalidDataException("Duplicate bot id.");
            foreach (var field in new[] { "name", "role", "archetype", "defense_strategy", "prompt_template" }) Required(bot, field);
        }
        // Shuffle whole pairs before sampling, then shuffle seats independently.
        RandomNumberGenerator.Shuffle(pairs.AsSpan()); RandomNumberGenerator.Shuffle(actors.AsSpan());
        var slots = Enumerable.Range(1, 10).ToArray(); RandomNumberGenerator.Shuffle(slots.AsSpan());
        var result = new List<GameNpc>();
        for (var i = 0; i < 3; i++)
        {
            var pair = pairs[i]; var lore = pair.GetProperty("shared_lore");
            var loreText = string.Join("\n", lore.EnumerateObject().Select(p => $"{p.Name}: {p.Value.GetString()}"));
            for (var j = 0; j < 2; j++)
            {
                var bot = pair.GetProperty(j == 0 ? "bot_1" : "bot_2"); var slot = slots[i * 2 + j];
                result.Add(new GameNpc { Id = $"npc-{slot}", Number = slot, Name = Required(bot, "name"), Color = Colors[slot - 1], Role = "friend",
                    RelatedNumber = slots[i * 2 + 1 - j], Persona = Required(bot, "system_prompt"), Lore = loreText });
            }
        }
        for (var i = 0; i < 4; i++)
        {
            var bot = actors[i].GetProperty("bot"); var slot = slots[6 + i];
            var target = result[RandomNumberGenerator.GetInt32(6)];
            result.Add(new GameNpc { Id = $"npc-{slot}", Number = slot, Name = Required(bot, "name"), Color = Colors[slot - 1], Role = "actor",
                RelatedNumber = target.Number, Persona = Required(bot, "prompt_template").Replace("[ИМЯ_ЦЕЛИ]", $"{target.Name} (Слот №{target.Number})"),
                Lore = Required(bot, "defense_strategy") });
        }
        return result.OrderBy(n => n.Number).ToList();
    }
}
