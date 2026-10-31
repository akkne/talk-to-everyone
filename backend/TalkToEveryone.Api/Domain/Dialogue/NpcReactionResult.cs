namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Сгенерированная реакция одного из 3 наиболее задетых ботов трибуны по Схеме Б (<c>BACKGROUND REACTIONS BATCH</c>).
/// </summary>
/// <param name="NpcId">Непрозрачный идентификатор реагирующего NPC.</param>
/// <param name="SlotId">Номер слота на трибуне (<c>slot_id</c>, 1–10).</param>
/// <param name="EmotionEnum">Код эмоции из <see cref="NpcEmotionCatalog"/> (<c>emotion_enum</c>).</param>
/// <param name="ReactionLabel">Короткое описание действия/реакции (<c>reaction_label</c>).</param>
/// <param name="InternalThought">Скрытая внутренняя мысль бота (<c>internal_thought</c>, хранится на сервере до вскрытия).</param>
public sealed record NpcReactionResult(
    string NpcId,
    int SlotId,
    string EmotionEnum,
    string ReactionLabel,
    string InternalThought);
