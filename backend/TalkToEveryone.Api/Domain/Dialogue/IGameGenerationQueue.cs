namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Абстракция асинхронной очереди задач генерации диалогов на базе <see cref="System.Threading.Channels"/>.
/// Гарантирует последовательную обработку запросов к локальной GPU.
/// </summary>
public interface IGameGenerationQueue
{
    /// <summary>
    /// Помещает задачу генерации реплики и реакций NPC в очередь.
    /// </summary>
    /// <param name="task">Задача генерации.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    ValueTask EnqueueAsync(DialogueTask task, CancellationToken cancellationToken);

    /// <summary>
    /// Читает следующую задачу генерации из очереди по мере её поступления.
    /// </summary>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns>Следующая задача генерации из очереди.</returns>
    ValueTask<DialogueTask> DequeueAsync(CancellationToken cancellationToken);
}
