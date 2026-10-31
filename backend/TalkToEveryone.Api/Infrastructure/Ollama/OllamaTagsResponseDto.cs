using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Ответ эндпоинта <c>GET /api/tags</c> со списком локально доступных моделей Ollama.
/// </summary>
/// <param name="Models">Коллекция загруженных моделей.</param>
public sealed record OllamaTagsResponseDto(
    [property: JsonPropertyName("models")] IReadOnlyList<OllamaTagItemDto>? Models);
