using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Типизированный HTTP-клиент для взаимодействия с локальным сервером Ollama.
/// Создаётся через <see cref="IHttpClientFactory"/>.
/// </summary>
/// <param name="httpClient">Экземпляр <see cref="HttpClient"/>, сконфигурированный фабрикой.</param>
/// <param name="options">Настройки подключения и лимитов Ollama.</param>
/// <param name="logger">Структурированный логгер.</param>
public sealed class OllamaHttpClient(
    HttpClient httpClient,
    IOptions<OllamaOptions> options,
    ILogger<OllamaHttpClient> logger) : IOllamaTransport
{
    private const string ChatEndpoint = "/api/chat";
    private const string TagsEndpoint = "/api/tags";
    private const string PullEndpoint = "/api/pull";
    private const string SystemRole = "system";
    private const string UserRole = "user";

    private readonly OllamaOptions _settings = options.Value;

    /// <summary>
    /// Выполняет запрос генерации к эндпоинту <c>POST /api/chat</c> со строгой JSON-схемой ответа.
    /// </summary>
    /// <param name="systemPrompt">Системная инструкция модели.</param>
    /// <param name="userPrompt">Пользовательский запрос с контекстом раунда.</param>
    /// <param name="formatSchema">JSON Schema ожидаемого объекта ответа.</param>
    /// <param name="maxPredictTokens">Лимит генерируемых токенов (<c>num_predict</c>).</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns>Сырая JSON-строка, возвращённая моделью в поле <c>message.content</c>.</returns>
    public async Task<string> CompleteChatJsonAsync(
        string systemPrompt,
        string userPrompt,
        JsonElement formatSchema,
        int maxPredictTokens,
        CancellationToken cancellationToken)
    {
        OllamaChatRequestDto request = BuildChatRequest(systemPrompt, userPrompt, formatSchema, maxPredictTokens);
        using HttpResponseMessage response = await httpClient.PostAsJsonAsync(ChatEndpoint, request, cancellationToken);
        response.EnsureSuccessStatusCode();

        OllamaChatResponseDto? payload = await response.Content.ReadFromJsonAsync<OllamaChatResponseDto>(cancellationToken);
        string? content = payload?.Message?.Content;
        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("Ollama returned an empty message content.");
        }

        return content;
    }

    /// <summary>
    /// Проверяет, загружена ли целевая модель в локальное хранилище Ollama (<c>GET /api/tags</c>).
    /// </summary>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns><c>true</c>, если модель присутствует в списке доступных тегов; иначе <c>false</c>.</returns>
    public async Task<bool> IsConfiguredModelInstalledAsync(CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await httpClient.GetAsync(TagsEndpoint, cancellationToken);
        response.EnsureSuccessStatusCode();

        OllamaTagsResponseDto? tags = await response.Content.ReadFromJsonAsync<OllamaTagsResponseDto>(cancellationToken);
        if (tags?.Models is null)
        {
            return false;
        }

        return tags.Models.Any(item => MatchesModelName(item.Name, _settings.Model));
    }

    /// <summary>
    /// Запрашивает скачивание целевой модели через <c>POST /api/pull</c>.
    /// </summary>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    public async Task PullConfiguredModelAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("Requesting Ollama to pull model {ModelName}", _settings.Model);
        OllamaPullRequestDto request = new(Model: _settings.Model, Stream: false);
        using HttpResponseMessage response = await httpClient.PostAsJsonAsync(PullEndpoint, request, cancellationToken);
        response.EnsureSuccessStatusCode();
        logger.LogInformation("Model {ModelName} successfully pulled by Ollama", _settings.Model);
    }

    /// <summary>
    /// Собирает DTO запроса к <c>/api/chat</c> с настройками контекста, лимита токенов и удержания в VRAM.
    /// </summary>
    private OllamaChatRequestDto BuildChatRequest(
        string systemPrompt,
        string userPrompt,
        JsonElement formatSchema,
        int maxPredictTokens)
    {
        IReadOnlyList<OllamaChatMessageDto> messages =
        [
            new OllamaChatMessageDto(SystemRole, systemPrompt),
            new OllamaChatMessageDto(UserRole, userPrompt)
        ];

        OllamaModelParametersDto modelParams = new(
            NumCtx: _settings.MaxContextTokens,
            NumPredict: maxPredictTokens,
            Temperature: _settings.Temperature);

        return new OllamaChatRequestDto(
            Model: _settings.Model,
            Messages: messages,
            Stream: false,
            Format: formatSchema,
            KeepAlive: _settings.KeepAlive,
            Options: modelParams);
    }

    /// <summary>
    /// Сравнивает имя установленной модели в Ollama с именем из конфигурации.
    /// </summary>
    private static bool MatchesModelName(string installedName, string configuredName) =>
        string.Equals(installedName, configuredName, StringComparison.OrdinalIgnoreCase) ||
        installedName.StartsWith($"{configuredName}:", StringComparison.OrdinalIgnoreCase);
}
