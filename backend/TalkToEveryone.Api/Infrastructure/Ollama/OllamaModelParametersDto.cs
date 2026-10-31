using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Низкоуровневые параметры инференса модели Ollama (<c>options</c>).
/// </summary>
/// <param name="NumCtx">Размер контекстного окна в токенах (<c>num_ctx</c>).</param>
/// <param name="NumPredict">Максимальное количество генерируемых токенов (<c>num_predict</c>).</param>
/// <param name="Temperature">Температура сэмплирования (<c>temperature</c>).</param>
public sealed record OllamaModelParametersDto(
    [property: JsonPropertyName("num_ctx")] int NumCtx,
    [property: JsonPropertyName("num_predict")] int NumPredict,
    [property: JsonPropertyName("temperature")] double Temperature);
