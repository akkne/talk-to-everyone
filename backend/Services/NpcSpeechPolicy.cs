using System.Text.RegularExpressions;

namespace Backend;

/// <summary>Blocks common identity leaks and disallowed topics before NPC speech is saved.</summary>
public sealed class NpcSpeechPolicy
{
    private static readonly Regex Romance = new(@"отношен|романтич|романтик|любов|влюб|свидан|поцелу|бывш|ревност|флирт|интим|секс|жених|невест|свадьб|встреча(?:емся|лись|лась|лся|ться|ешься)|мой\s+парень|моя\s+девушка|мы\s+пара|больше\s+чем\s+друзья", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex RomanceQuestion = new(@"\bпара\b|целу|спишь\s+с|нравится\s+как\s+(?:парень|девушка)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex NormalizeSpace = new(@"\s+", RegexOptions.Compiled);

    /// <summary>Detects questions that should be replaced with a neutral friendship prompt.</summary>
    public static bool IsRomanceTopic(string text) => Romance.IsMatch(text) || RomanceQuestion.IsMatch(text);

    /// <summary>Returns an actionable rejection reason, or null when the text can be published.</summary>
    public (string Code, string Message)? Reject(GameNpc npc, IReadOnlyList<GameNpc> roster, string text, IReadOnlyList<string> previous)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Length > 220) return ("length", "Сделай одну непустую реплику до 220 символов.");
        if (Romance.IsMatch(text)) return ("romance", "Не затрагивай романтические или сексуальные отношения; говори только о дружбе.");
        var related = roster.FirstOrDefault(n => n.Number == npc.RelatedNumber);
        if (related is not null && Regex.IsMatch(text, NameForms(related.Name), RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return ("friend_name", "Не называй своего друга или цель по имени; говори «мой друг».");
        foreach (var person in roster.Where(person => person.Id != npc.Id))
        {
            var namedConnection = $@"(?:дружу\s+с|общаюсь\s+с|мой\s+друг|моя\s+подруга|мой\s+приятель|моя\s+знакомая|мы\s+с)\s+{NameForms(person.Name)}";
            if (Regex.IsMatch(text, namedConnection, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
                return ("social_name", "Не называй по имени людей, с которыми дружишь или общаешься; говори о них косвенно.");
        }
        if (Regex.IsMatch(text, $@"\b(?:слот\s*№?\s*|номер\s+){npc.RelatedNumber}\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return ("friend_slot", "Не называй номер слота своего друга или цели.");
        var ownName = NameForms(npc.Name);
        var withoutIntroduction = Regex.Replace(text, $@"\b(?:я|меня\s+зовут)\s+{ownName}", "", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (Regex.IsMatch(withoutIntroduction, ownName, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return ("third_person", "О себе говори от первого лица: «я», а не своим именем.");
        var current = Normalize(text);
        if (previous.Any(p => Similar(current, Normalize(p)))) return ("repeat", "Не повторяй предыдущую реплику; выбери другую мысль и начало фразы.");
        return null;
    }

    private static string Normalize(string value) => NormalizeSpace.Replace(Regex.Replace(value.ToLowerInvariant(), @"[^\p{L}\p{N}\s]", " "), " ").Trim();

    private static string NameForms(string name)
    {
        if (string.Equals(name, "Лев", StringComparison.OrdinalIgnoreCase)) return @"\b(?:Лев|Льва|Льву|Львом|Льве)\b";
        var endsInVowel = name.EndsWith('а') || name.EndsWith('я');
        var stem = endsInVowel ? name[..^1] : name;
        var suffix = endsInVowel ? @"(?:а|я|ы|и|е|у|ю|ой|ей|ою|ею)" : @"(?:а|я|ы|и|е|у|ю|ом|ем)?";
        return $@"\b{Regex.Escape(stem)}{suffix}\b";
    }

    private static bool Similar(string a, string b)
    {
        if (a.Length < 30 || b.Length < 30) return a == b;
        var aWords = a.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToHashSet();
        var bWords = b.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToHashSet();
        return aWords.Intersect(bWords).Count() / (double)Math.Max(aWords.Count, bWords.Count) > 0.82;
    }
}
