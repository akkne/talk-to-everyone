using System.Text.Json;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Абстракция низкоуровневого HTTP-транспорта для взаимодействия с API сервера Ollama.
/// </summary>
public interface IOllamaTransport
{
    /// <summary>
    /// Выполняет запрос генерации к эндпоинту <c>POST /api/chat</c> со строгой JSON-схемой ответа.
    /// </summary>
    /// <param name="systemPrompt">Системная инструкция модели.</param>
    /// <param name="userPrompt">Пользовательский запрос с контекстом раунда.</param>
    /// <param name="formatSchema">JSON Schema ожидаемого объекта ответа.</param>
    /// <param name="maxPredictTokens">Лимит генерируемых токенов (<c>num_predict</c>).</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns>Сырая JSON-строка, возвращённая моделью в поле <c>message.content</c>.</returns>
    Task<string> CompleteChatJsonAsync(
        string systemPrompt,
        string userPrompt,
        JsonElement formatSchema,
        int maxPredictTokens,
        CancellationToken cancellationToken);

    /// <summary>
    /// Проверяет, загружена ли целевая модель в локальное хранилище Ollama (<c>GET /api/tags</c>).
    /// </summary>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns><c>true</c>, если модель присутствует в списке доступных тегов; иначе <c>false</c>.</returns>
    Task<bool> IsConfiguredModelInstalledAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Запрашивает скачивание целевой модели через <c>POST /api/pull</c>.
    /// </summary>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    Task PullConfiguredModelAsync(CancellationToken cancellationToken);
}
