namespace Backend;

/// <summary>Public visual cues derived from the stored character description, never from the secret role or partner.</summary>
public static class NpcAppearance
{
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
        return new { style, accessory, hair = hash % 4, skin = hash % 5 };
    }

    private static bool Has(string text, params string[] words) => words.Any(text.Contains);
}
