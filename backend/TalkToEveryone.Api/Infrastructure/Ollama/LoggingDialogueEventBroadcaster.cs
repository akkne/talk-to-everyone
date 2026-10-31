using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Базовая реализация <see cref="IDialogueEventBroadcaster"/> со структурированным логированием событий диалога.
/// При подключении SignalR-хаба заменяется или декорируется рассылкой в группу сессии.
/// </summary>
/// <param name="logger">Структурированный логгер.</param>
public sealed class LoggingDialogueEventBroadcaster(
    ILogger<LoggingDialogueEventBroadcaster> logger) : IDialogueEventBroadcaster
{
    private const string NoQuestionIdPlaceholder = "none";

    /// <summary>
    /// Уведомляет всех игроков сессии о том, что выбранный NPC обдумывает ответ (<c>NpcThinking</c>).
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="npcId">Идентификатор NPC.</param>
    /// <param name="questionId">Идентификатор вопроса (<c>requestId</c>) или задачи раунда.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    public Task PublishNpcThinkingAsync(
        string sessionId,
        string npcId,
        string questionId,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Event NpcThinking dispatched for session {SessionId}, NPC {NpcId}, question {QuestionId}",
            sessionId,
            npcId,
            questionId);

        return Task.CompletedTask;
    }

    /// <summary>
    /// Сохраняет готовую реплику NPC и рассылает событие <c>NpcSay</c> всем участникам сессии.
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="npcId">Идентификатор говорящего NPC.</param>
    /// <param name="reply">Сгенерированный текст и эмоция.</param>
    /// <param name="inReplyToQuestionId">ID вопроса из 4-го раунда или <c>null</c> для авто-реплик раундов 1–3.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    public Task PublishNpcSayAsync(
        string sessionId,
        string npcId,
        NpcReply reply,
        string? inReplyToQuestionId,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Event NpcSay dispatched for session {SessionId}, NPC {NpcId}, emotion {Emotion}, inReplyTo {QuestionId}",
            sessionId,
            npcId,
            reply.Emotion,
            inReplyToQuestionId ?? NoQuestionIdPlaceholder);

        return Task.CompletedTask;
    }

    /// <summary>
    /// Рассылает публичные реакции остальных NPC (<c>NpcReaction</c>), не раскрывая скрытое поле <c>HiddenReason</c>.
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="reactions">Коллекция сгенерированных реакций слушателей.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    public Task PublishNpcReactionsAsync(
        string sessionId,
        IReadOnlyList<NpcReactionResult> reactions,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Event NpcReaction batch dispatched for session {SessionId} with {ReactionCount} reactions",
            sessionId,
            reactions.Count);

        return Task.CompletedTask;
    }

    /// <summary>
    /// Уведомляет об ошибке генерации ответа на вопрос игрока (<c>QuestionFailed</c>) и возвращает попытку вопроса.
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="askingPlayerId">Идентификатор игрока, задавшего вопрос.</param>
    /// <param name="questionId">Идентификатор вопроса (<c>requestId</c>).</param>
    /// <param name="failureCode">Код причины сбоя (<c>LLM_TIMEOUT</c> или <c>LLM_ERROR</c>).</param>
    /// <param name="userMessage">Понятное сообщение об ошибке на русском языке.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    public Task PublishQuestionFailedAsync(
        string sessionId,
        string askingPlayerId,
        string questionId,
        DialogueFailureCode failureCode,
        string userMessage,
        CancellationToken cancellationToken)
    {
        logger.LogWarning(
            "Event QuestionFailed dispatched for session {SessionId}, player {PlayerId}, question {QuestionId}, code {FailureCode}",
            sessionId,
            askingPlayerId,
            questionId,
            failureCode);

        return Task.CompletedTask;
    }
}
