using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Десериализуемый элемент массива реакций одного слушающего NPC из ответа модели.
/// </summary>
/// <param name="NpcNumber">Публичный номер NPC (1–10).</param>
/// <param name="Reaction">Публичный короткий текст реакции.</param>
/// <param name="Emotion">Код эмоции NPC.</param>
/// <param name="Reason">Внутреннее объяснение реакции (не уходит клиенту).</param>
public sealed record OllamaReactionItemPayload(
    [property: JsonPropertyName("npcNumber")] int NpcNumber,
    [property: JsonPropertyName("reaction")] string? Reaction,
    [property: JsonPropertyName("emotion")] string? Emotion,
    [property: JsonPropertyName("reason")] string? Reason);
