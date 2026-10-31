using System.Threading.Channels;
using Microsoft.Extensions.Options;
using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Потокобезопасная ограниченная очередь задач генерации диалогов на базе <see cref="Channel{T}"/>.
/// Обеспечивает последовательную подачу запросов на одну локальную GPU.
/// </summary>
/// <param name="options">Настройки модуля Ollama.</param>
public sealed class ChannelGameGenerationQueue(
    IOptions<OllamaOptions> options) : IGameGenerationQueue
{
    private const int MinimumChannelCapacity = 1;
    private readonly Channel<DialogueTask> _channel = CreateBoundedChannel(options.Value);

    /// <summary>
    /// Помещает задачу генерации реплики и реакций NPC в очередь.
    /// </summary>
    /// <param name="task">Задача генерации.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    public ValueTask EnqueueAsync(DialogueTask task, CancellationToken cancellationToken) =>
        _channel.Writer.WriteAsync(task, cancellationToken);

    /// <summary>
    /// Читает следующую задачу генерации из очереди по мере её поступления.
    /// </summary>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns>Следующая задача генерации из очереди.</returns>
    public ValueTask<DialogueTask> DequeueAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAsync(cancellationToken);

    /// <summary>
    /// Создаёт ограниченный канал с одним читателем для последовательного обращения к GPU.
    /// </summary>
    /// <param name="settings">Настройки очереди Ollama.</param>
    /// <returns>Экземпляр ограниченного канала задач.</returns>
    private static Channel<DialogueTask> CreateBoundedChannel(OllamaOptions settings)
    {
        int capacity = Math.Max(MinimumChannelCapacity, settings.QueueCapacity);
        BoundedChannelOptions channelOptions = new(capacity)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.Wait
        };

        return Channel.CreateBounded<DialogueTask>(channelOptions);
    }
}
