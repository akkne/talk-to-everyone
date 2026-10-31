using Microsoft.Extensions.Options;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Фоновый сервис Фазы 0: проверка доступности модели и предзагрузка весов в видеопамять (VRAM) при старте сервера.
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
    private const string WarmupSystemPrompt = "Ты участник шоу Угадай кента. Ответь в JSON по схеме.";
    private const string WarmupUserPrompt = "Проверка готовности трибуны.";
    private const int WarmupMaxPredictTokens = 32;

    private readonly OllamaOptions _settings = options.Value;

    /// <summary>
    /// Выполняет проверку тега модели и холостой прогревочный запрос для закрепления модели в VRAM (<c>keep_alive: -1</c>).
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

    /// <summary>
    /// Проверяет наличие модели в локальном томе Ollama и при необходимости инициирует скачивание.
    /// </summary>
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

    /// <summary>
    /// Отправляет короткий прогревочный запрос со Схемой А для закрепления модели в VRAM.
    /// </summary>
    private async Task WarmupModelInVramAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("Warming up Ollama model {ModelName} in VRAM", _settings.Model);
        OllamaInferenceProfile warmupProfile = new(
            NumCtx: _settings.SpeakerContextTokens,
            NumPredict: WarmupMaxPredictTokens,
            Temperature: _settings.SpeakerTemperature);

        await transport.CompleteChatJsonAsync(
            WarmupSystemPrompt,
            WarmupUserPrompt,
            schemaCatalog.GetSpeakerReplySchema(),
            warmupProfile,
            cancellationToken);

        logger.LogInformation("Ollama model {ModelName} is pinned in VRAM and ready", _settings.Model);
    }
}
