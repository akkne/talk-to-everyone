namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Абстракция языковой модели для пакетной генерации реакций остальных участников студии.
/// </summary>
public interface INpcReactionModel
{
    /// <summary>
    /// Асинхронно генерирует реакции всех слушающих NPC одним батч-запросом к локальной модели.
    /// </summary>
    /// <param name="prompt">Контекст произнесённой реплики и список слушающих NPC.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns>Коллекция реакций слушающих NPC.</returns>
    Task<IReadOnlyList<NpcReactionResult>> GenerateReactionsAsync(
        NpcReactionBatchPrompt prompt,
        CancellationToken cancellationToken);
}
