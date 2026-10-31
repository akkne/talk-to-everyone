using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Запрос на скачивание весов модели через эндпоинт <c>POST /api/pull</c> в Ollama.
/// </summary>
/// <param name="Model">Имя скачиваемой модели.</param>
/// <param name="Stream">Флаг потокового ответа (передаётся <c>false</c> для ожидания полной загрузки).</param>
public sealed record OllamaPullRequestDto(
    [property: JsonPropertyName("model")] string Model,
    [property: JsonPropertyName("stream")] bool Stream);
