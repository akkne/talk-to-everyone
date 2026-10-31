using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Описание одной установленной модели в списке <c>GET /api/tags</c> Ollama.
/// </summary>
/// <param name="Name">Полное имя и тег модели (например, <c>qwen2.5:7b-instruct</c>).</param>
public sealed record OllamaTagItemDto(
    [property: JsonPropertyName("name")] string Name);
