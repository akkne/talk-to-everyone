using System.Threading.Channels;
using Microsoft.Extensions.Options;
using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Потокобезопасная ограниченная очередь задач генерации диалогов на базе <see cref="Channel{T}"/>.
/// Обеспечивает последовательную подачу запросов на одну локальную GPU.
/// </summary>
public sealed class ChannelGameGenerationQueue : IGameGenerationQueue
{
    private readonly Channel<DialogueTask> _channel;

    /// <summary>
    /// Инициализирует очередь с ограничением ёмкости из <see cref="OllamaOptions"/>.
    /// </summary>
    /// <param name="options">Настройки модуля Ollama.</param>
    public ChannelGameGenerationQueue(IOptions<OllamaOptions> options)
    {
        int capacity = Math.Max(1, options.Value.QueueCapacity);
        BoundedChannelOptions channelOptions = new(capacity)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.Wait
        };

        _channel = Channel.CreateBounded<DialogueTask>(channelOptions);
    }

    /// <inheritdoc />
    public ValueTask EnqueueAsync(DialogueTask task, CancellationToken cancellationToken) =>
        _channel.Writer.WriteAsync(task, cancellationToken);

    /// <inheritdoc />
    public ValueTask<DialogueTask> DequeueAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAsync(cancellationToken);
}
