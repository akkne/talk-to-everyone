using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Десериализуемая JSON-структура одиночного ответа говорящего NPC, возвращаемая моделью по строгой схеме.
/// </summary>
/// <param name="Text">Текст реплики NPC.</param>
/// <param name="Emotion">Код эмоции NPC.</param>
public sealed record OllamaSpeakerReplyPayload(
    [property: JsonPropertyName("text")] string? Text,
    [property: JsonPropertyName("emotion")] string? Emotion);
