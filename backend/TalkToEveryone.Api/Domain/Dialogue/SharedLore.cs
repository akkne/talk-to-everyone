namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Синхронизированная секретная база знаний (Shared Lore) для пары «Настоящих кентов».
/// Раскрывается игрокам только на финальном экране разоблачения.
/// </summary>
/// <param name="MeetingStory">Как словились (<c>{{MEETING_STORY}}</c>).</param>
/// <param name="SecretFact">Общий жёсткий косяк пары (<c>{{SECRET_FACT}}</c>).</param>
/// <param name="MaterialLink">Материальный коннект или долг (<c>{{MATERIAL_LINK}}</c>).</param>
/// <param name="InsideMeme">Локальный мем или кодовая фраза (<c>{{INSIDE_MEME}}</c>).</param>
public sealed record SharedLore(
    string MeetingStory,
    string SecretFact,
    string MaterialLink,
    string InsideMeme);
