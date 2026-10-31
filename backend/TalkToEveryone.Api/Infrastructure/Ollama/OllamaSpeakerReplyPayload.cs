using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Десериализуемая JSON-структура ответа активного бота по Схеме А (<c>SINGLE BOT TURN</c>).
/// </summary>
/// <param name="PublicSpeech">Реплика бота вслух (<c>public_speech</c>, 80–220 символов).</param>
/// <param name="EmotionEnum">Код эмоции (<c>emotion_enum</c>).</param>
/// <param name="ReactionLabel">Короткий статус действия из 2–3 слов (<c>reaction_label</c>).</param>
/// <param name="HiddenThought">Внутренняя скрытая мысль бота (<c>hidden_thought</c>).</param>
/// <param name="AddressingSlot">Номер слота (1–10), к которому обращается бот, либо 0 (<c>addressing_slot</c>).</param>
public sealed record OllamaSpeakerReplyPayload(
    [property: JsonPropertyName("public_speech")] string? PublicSpeech,
    [property: JsonPropertyName("emotion_enum")] string? EmotionEnum,
    [property: JsonPropertyName("reaction_label")] string? ReactionLabel,
    [property: JsonPropertyName("hidden_thought")] string? HiddenThought,
    [property: JsonPropertyName("addressing_slot")] int AddressingSlot);
