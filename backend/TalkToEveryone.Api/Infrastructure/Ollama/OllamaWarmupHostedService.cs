using Microsoft.Extensions.Options;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Фоновый сервис проверки доступности модели и предзагрузки весов в видеопамять (VRAM) при старте сервера.
/// </summary>
/// <param name="transport">Низкоуровневый транспорт Ollama.</param>
/// <param name="schemaCatalog">Каталог JSON Schema.</param>
/// <param name="options">Настройки подключения к Ollama.</param>
/// <param name="logger">Структурированный логгер.</param>
public sealed class OllamaWarmupHostedService(
    IOllamaTransport transport,
    OllamaJsonSchemaCatalog schemaCatalog,
    IOptions<OllamaOptions> options,
    ILogger<OllamaWarmupHostedService> logger) : BackgroundService
{
    private const string WarmupSystemPrompt = "Ты участник игры. Ответь одним словом в JSON.";
    private const string WarmupUserPrompt = "Проверка готовности студии.";
    private const int WarmupMaxPredictTokens = 16;

    private readonly OllamaOptions _settings = options.Value;

    /// <summary>
    /// Выполняет проверку тега модели и холостой прогревочный запрос для закрепления модели в VRAM.
    /// </summary>
    /// <param name="stoppingToken">Токен остановки хоста.</param>
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await EnsureModelInstalledAsync(stoppingToken);
            await WarmupModelInVramAsync(stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            logger.LogInformation("Ollama warmup cancelled due to application shutdown");
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                exception,
                "Ollama warmup did not complete at startup for model {ModelName}; requests will retry on demand",
                _settings.Model);
        }
    }

    private async Task EnsureModelInstalledAsync(CancellationToken cancellationToken)
    {
        bool installed = await transport.IsConfiguredModelInstalledAsync(cancellationToken);
        if (installed)
        {
            logger.LogInformation("Ollama model {ModelName} is already installed", _settings.Model);
            return;
        }

        if (!_settings.AutoPullModel)
        {
            logger.LogWarning("Ollama model {ModelName} is missing and AutoPullModel is disabled", _settings.Model);
            return;
        }

        await transport.PullConfiguredModelAsync(cancellationToken);
    }

    private async Task WarmupModelInVramAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("Warming up Ollama model {ModelName} in VRAM", _settings.Model);
        await transport.CompleteChatJsonAsync(
            WarmupSystemPrompt,
            WarmupUserPrompt,
            schemaCatalog.GetSpeakerReplySchema(),
            WarmupMaxPredictTokens,
            cancellationToken);

        logger.LogInformation("Ollama model {ModelName} is pinned in VRAM and ready", _settings.Model);
    }
}
