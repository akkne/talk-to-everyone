namespace Backend;

/// <summary>Builds a bounded, chronological view of the public conversation.</summary>
public sealed class NpcContextBuilder
{
    private const int RecentEvents = 16;
    private const int PersonalEvents = 3;
    private const int RelatedEvents = 3;
    private const int MaxEventChars = 170;

    /// <summary>Selects recent room speech and older statements relevant to this NPC.</summary>
    public string Build(GameNpc speaker, IReadOnlyList<GameNpc> roster, IReadOnlyList<NpcConversationEvent> events)
    {
        if (events.Count == 0) return "Публичных реплик пока нет.";
        var relatedId = roster.FirstOrDefault(n => n.Number == speaker.RelatedNumber)?.Id;
        var ordered = events.Where(e => !e.IsQuestion || !NpcSpeechPolicy.IsRomanceTopic(e.Text))
            .OrderBy(e => e.Sequence).ToArray();
        if (ordered.Length == 0) return "Публичных реплик по теме дружбы пока нет.";
        var selected = ordered.TakeLast(RecentEvents)
            .Concat(ordered.Where(e => e.SpeakerNpcId == speaker.Id).TakeLast(PersonalEvents))
            .Concat(ordered.Where(e => e.SpeakerNpcId == relatedId).TakeLast(RelatedEvents))
            .Concat(ordered.Where(e => !e.IsQuestion && e.SpeakerNpcId is not null)
                .GroupBy(e => e.SpeakerNpcId).Select(group => group.Last()))
            .DistinctBy(e => e.Sequence)
            .OrderBy(e => e.Sequence);
        return string.Join("\n", selected.Select(e => Format(e, roster)));
    }

    private static string Format(NpcConversationEvent entry, IReadOnlyList<GameNpc> roster)
    {
        var speaker = entry.IsQuestion ? "Вопрос жюри" :
            roster.FirstOrDefault(n => n.Id == entry.SpeakerNpcId) is { } npc
                ? $"Слот №{npc.Number} ({npc.Name})" : "Участник";
        var value = entry.Text.Replace('\n', ' ').Replace('\r', ' ').Trim();
        if (value.Length > MaxEventChars) value = value[..MaxEventChars].TrimEnd() + "…";
        return $"[{entry.Sequence}, раунд {entry.Round}] {speaker} сказал: «{value}»";
    }
}
