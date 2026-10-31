using TalkToEveryone.Api.Infrastructure.Ollama;

namespace TalkToEveryone.Api;

/// <summary>
/// Точка входа серверного приложения игры «Угадай друзей».
/// </summary>
public static class Program
{
    private const string HealthEndpointPath = "/health";

    /// <summary>
    /// Конфигурирует сервисы, подключает модуль локальной модели Ollama и запускает веб-хост.
    /// </summary>
    /// <param name="args">Аргументы командной строки.</param>
    public static async Task Main(string[] args)
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

        builder.Services.AddOllama(builder.Configuration);
        builder.Services.AddHealthChecks();

        WebApplication app = builder.Build();
        app.MapHealthChecks(HealthEndpointPath);

        await app.RunAsync();
    }
}
