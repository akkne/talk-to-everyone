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

    /// <inheritdoc />
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

    /// <inheritdoc />
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

    /// <inheritdoc />
    public async Task PullConfiguredModelAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("Requesting Ollama to pull model {ModelName}", _settings.Model);
        OllamaPullRequestDto request = new(Model: _settings.Model, Stream: false);
        using HttpResponseMessage response = await httpClient.PostAsJsonAsync(PullEndpoint, request, cancellationToken);
        response.EnsureSuccessStatusCode();
        logger.LogInformation("Model {ModelName} successfully pulled by Ollama", _settings.Model);
    }

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

    private static bool MatchesModelName(string installedName, string configuredName) =>
        string.Equals(installedName, configuredName, StringComparison.OrdinalIgnoreCase) ||
        installedName.StartsWith($"{configuredName}:", StringComparison.OrdinalIgnoreCase);
}
