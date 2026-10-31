using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Десериализуемый элемент массива реакций трибуны по Схеме Б (<c>BACKGROUND REACTIONS BATCH</c>).
/// </summary>
/// <param name="SlotId">Номер слота реагирующего бота (<c>slot_id</c>, 1–10).</param>
/// <param name="EmotionEnum">Код эмоции (<c>emotion_enum</c>).</param>
/// <param name="ReactionLabel">Короткий статус действия (<c>reaction_label</c>).</param>
/// <param name="InternalThought">Скрытая внутренняя мысль бота (<c>internal_thought</c>).</param>
public sealed record OllamaReactionItemPayload(
    [property: JsonPropertyName("slot_id")] int SlotId,
    [property: JsonPropertyName("emotion_enum")] string? EmotionEnum,
    [property: JsonPropertyName("reaction_label")] string? ReactionLabel,
    [property: JsonPropertyName("internal_thought")] string? InternalThought);
