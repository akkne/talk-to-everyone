using System.Text.Json;

namespace Backend;

/// <summary>Public visual cues derived from the stored character description, never from the secret role or partner.</summary>
public static class NpcAppearance
{
    private sealed record VisualEntry(string Name, string Cue, JsonElement Model, string? AlternateCue = null);
    private static readonly Lazy<VisualEntry[]> Catalog = new(() =>
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Data", "character_appearances.json");
        if (!File.Exists(path)) return [];
        return JsonSerializer.Deserialize<VisualEntry[]>(File.ReadAllText(path), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];
    });

    public static object From(GameNpc npc)
    {
        var text = npc.Persona.ToLowerInvariant();
        var style = Has(text, "спорт", "качал", "фитнес", "протеин", "дрифт", "питбайк") ? "sport"
            : Has(text, "гик", "код", "технар", "желез", "геймер", "дота", "стример") ? "tech"
            : Has(text, "альт", "тату", "творч", "худож", "музык", "битмейкер", "фотограф") ? "creative"
            : Has(text, "менеджер", "продюсер", "отличниц", "фактолог", "скептик", "медик") ? "smart"
            : Has(text, "мажор", "богач", "стиля", "шмот", "модн") ? "polished"
            : "casual";
        var accessory = Has(text, "наушник", "звукореж", "битмейкер", "геймер", "стример") ? "headphones"
            : Has(text, "очк", "гик", "технар", "фактолог", "отличниц") ? "glasses"
            : Has(text, "шапк", "битмейкер") ? "beanie"
            : Has(text, "кепк", "курьер", "дрифт", "питбайк") ? "cap"
            : "none";
        var hash = 0;
        foreach (var letter in npc.Name) hash = (hash * 31 + letter) & 0x7fffffff;
        // Match the public persona description, never Role, RelatedNumber or shared lore.
        // Same-name characters remain distinct without exposing database IDs or the roster.
        var visual = Catalog.Value.FirstOrDefault(v => v.Name == npc.Name && (npc.Persona.Contains(v.Cue, StringComparison.Ordinal) || (v.AlternateCue != null && npc.Persona.Contains(v.AlternateCue, StringComparison.Ordinal))));
        return new { style, accessory, hair = hash % 4, skin = hash % 5, model = visual?.Model };
    }

    private static bool Has(string text, params string[] words) => words.Any(text.Contains);
}
