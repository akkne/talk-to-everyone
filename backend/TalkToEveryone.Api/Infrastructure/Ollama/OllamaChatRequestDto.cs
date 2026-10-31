using System.Text.Json;
using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Запрос к эндпоинту генерации чата Ollama (<c>POST /api/chat</c>).
/// </summary>
/// <param name="Model">Имя целевой модели.</param>
/// <param name="Messages">Упорядоченный список сообщений (<c>system</c> и <c>user</c>).</param>
/// <param name="Stream">Флаг потоковой выдачи (всегда <c>false</c> по контракту v2).</param>
/// <param name="Format">Строгая JSON-схема ответа для гарантированной структуры вывода.</param>
/// <param name="KeepAlive">Политика удержания модели в VRAM (<c>-1</c> — без выгрузки).</param>
/// <param name="Options">Параметры контекста, длины ответа и температуры.</param>
public sealed record OllamaChatRequestDto(
    [property: JsonPropertyName("model")] string Model,
    [property: JsonPropertyName("messages")] IReadOnlyList<OllamaChatMessageDto> Messages,
    [property: JsonPropertyName("stream")] bool Stream,
    [property: JsonPropertyName("format")] JsonElement Format,
    [property: JsonPropertyName("keep_alive")] int KeepAlive,
    [property: JsonPropertyName("options")] OllamaModelParametersDto Options);
