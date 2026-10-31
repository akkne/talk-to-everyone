namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Профиль параметров инференса для конкретного типа запроса к Ollama (ход активного бота или батч реакций).
/// </summary>
/// <param name="NumCtx">Размер контекстного окна (<c>num_ctx</c>).</param>
/// <param name="NumPredict">Лимит генерируемых токенов (<c>num_predict</c>).</param>
/// <param name="Temperature">Температура сэмплирования (<c>temperature</c>).</param>
public sealed record OllamaInferenceProfile(
    int NumCtx,
    int NumPredict,
    double Temperature);
