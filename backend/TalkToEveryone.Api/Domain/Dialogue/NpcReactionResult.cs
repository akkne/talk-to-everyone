namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Сгенерированная реакция одного слушающего NPC на выступление другого участника.
/// </summary>
/// <param name="NpcId">Идентификатор реагирующего NPC.</param>
/// <param name="NpcNumber">Номер реагирующего NPC (1–10).</param>
/// <param name="Reaction">Публичный короткий текст реакции (например, «фейспалм», «кивает, делая вид, что помнит»).</param>
/// <param name="Emotion">Нормализованный код эмоции из <see cref="NpcEmotionCatalog"/>.</param>
/// <param name="HiddenReason">Внутренняя причина реакции (хранится только на сервере, клиенту никогда не отправляется).</param>
public sealed record NpcReactionResult(
    string NpcId,
    int NpcNumber,
    string Reaction,
    string Emotion,
    string HiddenReason);
