namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Настройки подключения и параметров генерации локального сервера Ollama.
/// Значения поступают из переменных окружения секции <see cref="SectionName"/>.
/// </summary>
public sealed class OllamaOptions
{
    /// <summary>
    /// Имя секции конфигурации в переменных окружения (<c>OLLAMA__*</c>).
    /// </summary>
    public const string SectionName = "Ollama";

    /// <summary>
    /// Значение по умолчанию для базового адреса Ollama внутри Docker-сети.
    /// </summary>
    public const string DefaultBaseUrl = "http://ollama:11434";

    /// <summary>
    /// Модель по умолчанию, оптимизированная под 8 ГБ VRAM и русский язык.
    /// </summary>
    public const string DefaultModel = "qwen2.5:7b-instruct";

    /// <summary>
    /// Значение удержания модели в видеопамяти без выгрузки.
    /// </summary>
    public const int KeepLoadedForever = -1;

    /// <summary>
    /// Таймаут одного запроса генерации по умолчанию (в секундах).
    /// </summary>
    public const int DefaultTimeoutSeconds = 30;

    /// <summary>
    /// Размер контекстного окна по умолчанию (в токенах), гарантирующий отсутствие выхода за 8 ГБ VRAM.
    /// </summary>
    public const int DefaultMaxContextTokens = 4096;

    /// <summary>
    /// Максимальное число генерируемых токенов для одной реплики NPC.
    /// </summary>
    public const int DefaultMaxPredictTokens = 120;

    /// <summary>
    /// Максимальное число генерируемых токенов для пакетного ответа реакций 9 NPC.
    /// </summary>
    public const int DefaultReactionBatchPredictTokens = 480;

    /// <summary>
    /// Температура сэмплирования по умолчанию.
    /// </summary>
    public const double DefaultTemperature = 0.75;

    /// <summary>
    /// Вместимость очереди задач генерации диалогов по умолчанию.
    /// </summary>
    public const int DefaultQueueCapacity = 64;

    /// <summary>
    /// Максимальное количество последних сообщений чата, включаемых в промпт.
    /// </summary>
    public const int DefaultMaxHistoryEntries = 12;

    /// <summary>
    /// Базовый URL-адрес HTTP API сервиса Ollama.
    /// </summary>
    public string BaseUrl { get; init; } = DefaultBaseUrl;

    /// <summary>
    /// Название используемой модели в формате Ollama (например, <c>qwen2.5:7b-instruct</c> или <c>gemma3:4b</c>).
    /// </summary>
    public string Model { get; init; } = DefaultModel;

    /// <summary>
    /// Максимальное время ожидания ответа от Ollama в секундах.
    /// </summary>
    public int TimeoutSeconds { get; init; } = DefaultTimeoutSeconds;

    /// <summary>
    /// Размер контекстного окна модели (<c>num_ctx</c>).
    /// </summary>
    public int MaxContextTokens { get; init; } = DefaultMaxContextTokens;

    /// <summary>
    /// Лимит токенов на генерацию одной реплики говорящего NPC (<c>num_predict</c>).
    /// </summary>
    public int MaxPredictTokens { get; init; } = DefaultMaxPredictTokens;

    /// <summary>
    /// Лимит токенов на пакетную генерацию реакций остальных 9 NPC.
    /// </summary>
    public int ReactionBatchPredictTokens { get; init; } = DefaultReactionBatchPredictTokens;

    /// <summary>
    /// Температура генерации (<c>temperature</c>).
    /// </summary>
    public double Temperature { get; init; } = DefaultTemperature;

    /// <summary>
    /// Время удержания весов модели в VRAM (<c>-1</c> — удерживать постоянно).
    /// </summary>
    public int KeepAlive { get; init; } = KeepLoadedForever;

    /// <summary>
    /// Максимальный размер очереди задач генерации диалогов.
    /// </summary>
    public int QueueCapacity { get; init; } = DefaultQueueCapacity;

    /// <summary>
    /// Максимальное число реплик истории чата, передаваемых в контекст одного запроса.
    /// </summary>
    public int MaxHistoryEntries { get; init; } = DefaultMaxHistoryEntries;

    /// <summary>
    /// Разрешает ли сервер автоматическое скачивание модели (<c>/api/pull</c>) при старте, если она ещё не загружена в том Ollama.
    /// </summary>
    public bool AutoPullModel { get; init; } = true;
}
