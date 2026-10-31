namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Абстракция публикации событий генерации диалога в игровую сессию (SignalR + сохранение истории).
/// Изолирует воркер генерации от деталей транспорта и хранилища.
/// </summary>
public interface IDialogueEventBroadcaster
{
    /// <summary>
    /// Уведомляет всех игроков сессии о том, что выбранный NPC обдумывает ответ (<c>NpcThinking</c>).
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="npcId">Идентификатор NPC.</param>
    /// <param name="questionId">Идентификатор вопроса (<c>requestId</c>) или задачи раунда.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    Task PublishNpcThinkingAsync(
        string sessionId,
        string npcId,
        string questionId,
        CancellationToken cancellationToken);

    /// <summary>
    /// Сохраняет готовую реплику NPC и рассылает событие <c>NpcSay</c> всем участникам сессии.
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="npcId">Идентификатор говорящего NPC.</param>
    /// <param name="reply">Сгенерированный текст и эмоция.</param>
    /// <param name="inReplyToQuestionId">ID вопроса из 4-го раунда или <c>null</c> для авто-реплик раундов 1–3.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    Task PublishNpcSayAsync(
        string sessionId,
        string npcId,
        NpcReply reply,
        string? inReplyToQuestionId,
        CancellationToken cancellationToken);

    /// <summary>
    /// Рассылает публичные реакции остальных NPC (<c>NpcReaction</c>), не раскрывая скрытое поле <c>HiddenReason</c>.
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="reactions">Коллекция сгенерированных реакций слушателей.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    Task PublishNpcReactionsAsync(
        string sessionId,
        IReadOnlyList<NpcReactionResult> reactions,
        CancellationToken cancellationToken);

    /// <summary>
    /// Уведомляет об ошибке генерации ответа на вопрос игрока (<c>QuestionFailed</c>) и возвращает попытку вопроса.
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="askingPlayerId">Идентификатор игрока, задавшего вопрос.</param>
    /// <param name="questionId">Идентификатор вопроса (<c>requestId</c>).</param>
    /// <param name="failureCode">Код причины сбоя (<c>LLM_TIMEOUT</c> или <c>LLM_ERROR</c>).</param>
    /// <param name="userMessage">Понятное сообщение об ошибке на русском языке.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    Task PublishQuestionFailedAsync(
        string sessionId,
        string askingPlayerId,
        string questionId,
        DialogueFailureCode failureCode,
        string userMessage,
        CancellationToken cancellationToken);
}
