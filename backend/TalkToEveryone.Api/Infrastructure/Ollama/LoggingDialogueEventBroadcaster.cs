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
    /// <inheritdoc />
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

    /// <inheritdoc />
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
            inReplyToQuestionId ?? "none");

        return Task.CompletedTask;
    }

    /// <inheritdoc />
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

    /// <inheritdoc />
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
