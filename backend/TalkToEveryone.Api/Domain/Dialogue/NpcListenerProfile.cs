namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Сжатое серверное описание слушающего NPC для пакетной генерации реакций (паттерн «1 + 1»).
/// </summary>
/// <param name="NpcId">Непрозрачный идентификатор слушающего NPC.</param>
/// <param name="Number">Публичный номер слушающего NPC (1–10).</param>
/// <param name="DisplayName">Имя слушающего NPC.</param>
/// <param name="Role">Секретная роль слушающего NPC.</param>
/// <param name="TargetNpcNumber">Номер NPC, который является настоящим другом или целью этого участника.</param>
/// <param name="RelationSummary">Краткая подсказка отношения к говорящему (например, его настоящий бро, его самозванец или сторонний участник).</param>
public sealed record NpcListenerProfile(
    string NpcId,
    int Number,
    string DisplayName,
    NpcRole Role,
    int TargetNpcNumber,
    string RelationSummary);
