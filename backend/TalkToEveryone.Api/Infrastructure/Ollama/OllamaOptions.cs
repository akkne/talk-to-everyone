namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Настройки подключения и параметров инференса локального сервера Ollama по спецификации «Угадай кента».
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
    /// Рекомендуемая модель по умолчанию из мастер-спецификации.
    /// </summary>
    public const string DefaultModel = "qwen2.5:14b-instruct-q4_K_M";

    /// <summary>
    /// Значение удержания модели в видеопамяти без выгрузки (<c>"keep_alive": -1</c>).
    /// </summary>
    public const int KeepLoadedForever = -1;

    /// <summary>
    /// Таймаут одного запроса генерации по умолчанию (в секундах).
    /// </summary>
    public const int DefaultTimeoutSeconds = 30;

    /// <summary>
    /// Температура генерации хода активного бота (<c>0.75</c>).
    /// </summary>
    public const double DefaultSpeakerTemperature = 0.75;

    /// <summary>
    /// Размер контекстного окна хода активного бота (<c>num_ctx: 4096</c>).
    /// </summary>
    public const int DefaultSpeakerContextTokens = 4096;

    /// <summary>
    /// Максимальное число генерируемых токенов для хода активного бота (<c>num_predict: 140</c>).
    /// </summary>
    public const int DefaultSpeakerPredictTokens = 140;

    /// <summary>
    /// Температура генерации батча реакций трибуны (<c>0.6</c>).
    /// </summary>
    public const double DefaultReactionTemperature = 0.6;

    /// <summary>
    /// Размер контекстного окна для батча реакций трибуны (<c>num_ctx: 2048</c>).
    /// </summary>
    public const int DefaultReactionContextTokens = 2048;

    /// <summary>
    /// Максимальное число генерируемых токенов для батча реакций (<c>num_predict: 180</c>).
    /// </summary>
    public const int DefaultReactionPredictTokens = 180;

    /// <summary>
    /// Вместимость очереди задач генерации диалогов по умолчанию.
    /// </summary>
    public const int DefaultQueueCapacity = 64;

    /// <summary>
    /// Максимальное количество последних сообщений чата в краткой сводке комнаты.
    /// </summary>
    public const int DefaultMaxHistoryEntries = 12;

    /// <summary>
    /// Базовый URL-адрес HTTP API сервиса Ollama.
    /// </summary>
    public string BaseUrl { get; init; } = DefaultBaseUrl;

    /// <summary>
    /// Название используемой модели (например, <c>qwen2.5:14b-instruct-q4_K_M</c> или <c>llama3.1:8b-instruct-q8_0</c>).
    /// </summary>
    public string Model { get; init; } = DefaultModel;

    /// <summary>
    /// Максимальное время ожидания ответа от Ollama в секундах.
    /// </summary>
    public int TimeoutSeconds { get; init; } = DefaultTimeoutSeconds;

    /// <summary>
    /// Время удержания весов модели в VRAM (<c>-1</c> — удерживать постоянно).
    /// </summary>
    public int KeepAlive { get; init; } = KeepLoadedForever;

    /// <summary>
    /// Температура генерации хода активного бота (<c>temperature: 0.75</c>).
    /// </summary>
    public double SpeakerTemperature { get; init; } = DefaultSpeakerTemperature;

    /// <summary>
    /// Размер контекстного окна хода активного бота (<c>num_ctx: 4096</c>).
    /// </summary>
    public int SpeakerContextTokens { get; init; } = DefaultSpeakerContextTokens;

    /// <summary>
    /// Лимит токенов на генерацию хода активного бота (<c>num_predict: 140</c>).
    /// </summary>
    public int SpeakerPredictTokens { get; init; } = DefaultSpeakerPredictTokens;

    /// <summary>
    /// Температура генерации батча реакций (<c>temperature: 0.6</c>).
    /// </summary>
    public double ReactionTemperature { get; init; } = DefaultReactionTemperature;

    /// <summary>
    /// Размер контекстного окна для батча реакций (<c>num_ctx: 2048</c>).
    /// </summary>
    public int ReactionContextTokens { get; init; } = DefaultReactionContextTokens;

    /// <summary>
    /// Лимит токенов на генерацию батча реакций (<c>num_predict: 180</c>).
    /// </summary>
    public int ReactionPredictTokens { get; init; } = DefaultReactionPredictTokens;

    /// <summary>
    /// Максимальный размер очереди задач генерации диалогов.
    /// </summary>
    public int QueueCapacity { get; init; } = DefaultQueueCapacity;

    /// <summary>
    /// Максимальное число реплик истории в краткой сводке комнаты.
    /// </summary>
    public int MaxHistoryEntries { get; init; } = DefaultMaxHistoryEntries;

    /// <summary>
    /// Разрешает ли сервер автоматическое скачивание модели (<c>/api/pull</c>) при старте.
    /// </summary>
    public bool AutoPullModel { get; init; } = true;
}
