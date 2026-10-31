namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Синхронизированная секретная база знаний (Shared Lore) для пары настоящих друзей.
/// Никогда не передаётся клиенту до завершения игры.
/// </summary>
/// <param name="MeetingStory">Точка знакомства (как и при каких обстоятельствах познакомились).</param>
/// <param name="SharedBlunder">Общий секретный факт или постыдный косяк.</param>
/// <param name="MaterialBond">Материальная связь, старый долг или локальный мем пары.</param>
/// <param name="FriendAbsurdFacts">Два известных абсурдных факта о напарнике для 3-го раунда.</param>
public sealed record SharedLore(
    string MeetingStory,
    string SharedBlunder,
    string MaterialBond,
    IReadOnlyList<string> FriendAbsurdFacts);
