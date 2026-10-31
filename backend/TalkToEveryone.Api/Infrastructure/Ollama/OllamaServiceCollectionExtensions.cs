using TalkToEveryone.Api.Application.Dialogue;
using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Методы расширения для регистрации модуля локальной LLM Ollama в контейнере зависимостей.
/// </summary>
public static class OllamaServiceCollectionExtensions
{
    private const int HttpTimeoutBufferSeconds = 5;
    private const int MinimumHttpTimeoutSeconds = 5;

    /// <summary>
    /// Регистрирует конфигурацию <see cref="OllamaOptions"/>, типизированный <see cref="HttpClient"/>,
    /// генераторы реплик и реакций NPC, очередь задач на <see cref="System.Threading.Channels"/> и фоновые воркеры.
    /// </summary>
    /// <param name="services">Коллекция сервисов DI.</param>
    /// <param name="configuration">Конфигурация приложения.</param>
    /// <returns>Модифицированная коллекция сервисов.</returns>
    public static IServiceCollection AddOllama(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        IConfigurationSection section = configuration.GetSection(OllamaOptions.SectionName);
        services.Configure<OllamaOptions>(section);

        OllamaOptions configuredOptions = section.Get<OllamaOptions>() ?? new OllamaOptions();
        RegisterDomainAndInfrastructureServices(services);
        RegisterTypedOllamaHttpClient(services, configuredOptions);

        services.AddHostedService<OllamaWarmupHostedService>();
        services.AddHostedService<DialogueGenerationWorker>();
        return services;
    }

    /// <summary>
    /// Регистрирует синглтон-сервисы генерации диалогов, промптов и очередей.
    /// </summary>
    private static void RegisterDomainAndInfrastructureServices(IServiceCollection services)
    {
        services.AddSingleton<NpcEmotionCatalog>();
        services.AddSingleton<OllamaJsonSchemaCatalog>();
        services.AddSingleton<INpcPromptComposer, NpcPromptComposer>();
        services.AddSingleton<IGameGenerationQueue, ChannelGameGenerationQueue>();
        services.AddSingleton<IRoundDialogueCoordinator, RoundDialogueCoordinator>();
        services.AddSingleton<IDialogueEventBroadcaster, LoggingDialogueEventBroadcaster>();
        services.AddSingleton<INpcDialogueModel, OllamaNpcDialogueModel>();
        services.AddSingleton<INpcReactionModel, OllamaNpcReactionModel>();
    }

    /// <summary>
    /// Регистрирует типизированный <see cref="OllamaHttpClient"/> через <see cref="IHttpClientFactory"/>.
    /// </summary>
    private static void RegisterTypedOllamaHttpClient(
        IServiceCollection services,
        OllamaOptions configuredOptions)
    {
        services.AddHttpClient<IOllamaTransport, OllamaHttpClient>(client =>
        {
            client.BaseAddress = new Uri(configuredOptions.BaseUrl);
            int timeoutSeconds = Math.Max(
                MinimumHttpTimeoutSeconds,
                configuredOptions.TimeoutSeconds + HttpTimeoutBufferSeconds);
            client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
        });
    }
}
