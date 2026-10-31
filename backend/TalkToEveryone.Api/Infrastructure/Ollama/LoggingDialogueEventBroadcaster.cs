using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Базовая реализация <see cref="IDialogueEventBroadcaster"/> со структурированным логированием событий диалога.
/// При подключении SignalR-хаба заменяется или декорируется рассылкой в группу сессии (без утечки <c>HiddenThought</c> до финала).
/// </summary>
/// <param name="logger">Структурированный логгер.</param>
public sealed class LoggingDialogueEventBroadcaster(
    ILogger<LoggingDialogueEventBroadcaster> logger) : IDialogueEventBroadcaster
{
    private const string NoQuestionIdPlaceholder = "none";

    /// <summary>
    /// Уведомляет всех игроков сессии о том, что выбранный слот обдумывает ход (<c>NpcThinking</c>).
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
    /// Сохраняет ход NPC и рассылает событие <c>NpcSay</c> всем участникам сессии (без раскрытия <c>HiddenThought</c>).
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="npcId">Идентификатор говорящего NPC.</param>
    /// <param name="reply">Сгенерированный ответ по Схеме А.</param>
    /// <param name="inReplyToQuestionId">ID вопроса из 4-го раунда или <c>null</c> для авто-ходов.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    public Task PublishNpcSayAsync(
        string sessionId,
        string npcId,
        NpcReply reply,
        string? inReplyToQuestionId,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Event NpcSay dispatched for session {SessionId}, NPC {NpcId}, emotion {EmotionEnum}, addressingSlot {AddressingSlot}, inReplyTo {QuestionId}",
            sessionId,
            npcId,
            reply.EmotionEnum,
            reply.AddressingSlot,
            inReplyToQuestionId ?? NoQuestionIdPlaceholder);

        return Task.CompletedTask;
    }

    /// <summary>
    /// Рассылает 3 самые острые реакции трибуны (<c>NpcReaction</c>), не раскрывая поле <c>InternalThought</c>.
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="reactions">Коллекция сгенерированных реакций трибуны.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    public Task PublishNpcReactionsAsync(
        string sessionId,
        IReadOnlyList<NpcReactionResult> reactions,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Event NpcReaction batch dispatched for session {SessionId} with {ReactionCount} acute reactions",
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
