namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Задача в очереди генерации диалога для последовательного выполнения на локальной GPU.
/// </summary>
/// <param name="TaskId">Уникальный идентификатор задачи (для вопросов раунда 4 совпадает с <c>questionId</c> / <c>requestId</c>).</param>
/// <param name="DialoguePrompt">Данные для генерации основной реплики говорящего NPC.</param>
/// <param name="Listeners">Список остальных 9 NPC для последующей пакетной генерации фоновых реакций.</param>
/// <param name="GenerateEnsembleReactions">Флаг необходимости генерации реакций остальных участников после основной реплики.</param>
/// <param name="AskingPlayerId">Идентификатор игрока, задавшего вопрос в раунде 4 (или <c>null</c> для автоматических реплик раундов 1–3).</param>
public sealed record DialogueTask(
    string TaskId,
    NpcDialoguePrompt DialoguePrompt,
    IReadOnlyList<NpcListenerProfile> Listeners,
    bool GenerateEnsembleReactions = true,
    string? AskingPlayerId = null);
