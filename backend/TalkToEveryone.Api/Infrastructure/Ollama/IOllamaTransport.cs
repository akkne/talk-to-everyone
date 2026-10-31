using System.Text.Json;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Абстракция низкоуровневого HTTP-транспорта для взаимодействия с API сервера Ollama.
/// </summary>
public interface IOllamaTransport
{
    /// <summary>
    /// Выполняет запрос генерации к эндпоинту <c>POST /api/chat</c> со строгой JSON-схемой и заданным профилем инференса.
    /// </summary>
    /// <param name="systemPrompt">Системная инструкция модели (<c>role: "system"</c>).</param>
    /// <param name="userPrompt">Пользовательский запрос раунда (<c>role: "user"</c>).</param>
    /// <param name="formatSchema">JSON Schema ожидаемого объекта ответа (<c>format</c>).</param>
    /// <param name="inferenceProfile">Параметры <c>num_ctx</c>, <c>num_predict</c> и <c>temperature</c>.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns>Сырая JSON-строка из поля <c>message.content</c>.</returns>
    Task<string> CompleteChatJsonAsync(
        string systemPrompt,
        string userPrompt,
        JsonElement formatSchema,
        OllamaInferenceProfile inferenceProfile,
        CancellationToken cancellationToken);

    /// <summary>
    /// Проверяет, загружена ли целевая модель в локальное хранилище Ollama (<c>GET /api/tags</c>).
    /// </summary>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns><c>true</c>, если модель присутствует в списке тегов; иначе <c>false</c>.</returns>
    Task<bool> IsConfiguredModelInstalledAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Запрашивает скачивание целевой модели через <c>POST /api/pull</c>.
    /// </summary>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    Task PullConfiguredModelAsync(CancellationToken cancellationToken);
}
