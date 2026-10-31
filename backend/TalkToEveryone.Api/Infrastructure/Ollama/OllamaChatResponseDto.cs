using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Ответ от эндпоинта <c>POST /api/chat</c> сервера Ollama.
/// </summary>
/// <param name="Model">Имя модели, выполнившей генерацию.</param>
/// <param name="Message">Сгенерированное ассистентом сообщение.</param>
/// <param name="Done">Признак завершения генерации.</param>
public sealed record OllamaChatResponseDto(
    [property: JsonPropertyName("model")] string? Model,
    [property: JsonPropertyName("message")] OllamaChatMessageDto? Message,
    [property: JsonPropertyName("done")] bool Done);
