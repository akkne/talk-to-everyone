using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Application.Dialogue;

/// <summary>
/// Реализация <see cref="IRoundDialogueCoordinator"/>, формирующая задачи <see cref="DialogueTask"/>
/// и матрицу слушателей для пакетной генерации реакций остальных 9 NPC.
/// </summary>
/// <param name="generationQueue">Очередь задач генерации к локальной модели Ollama.</param>
/// <param name="logger">Структурированный логгер.</param>
public sealed class RoundDialogueCoordinator(
    IGameGenerationQueue generationQueue,
    ILogger<RoundDialogueCoordinator> logger) : IRoundDialogueCoordinator
{
    private const int InterrogationRoundNumber = 4;
    private const string TrueFriendRelation = "настоящий лучший друг говорящего, знает всю правду и общие косяки";
    private const string ActorTargetingSpeakerRelation = "актёр-самозванец, который притворяется лучшим другом говорящего и подыгрывает ему";
    private const string SpeakerTargetingListenerRelation = "говорящий самозванец пытается примазаться к этому участнику, хотя тот его не знает";
    private const string UnrelatedObserverRelation = "сторонний участник шоу, наблюдает со стороны и ищет несостыковки";

    /// <summary>
    /// Ставит в очередь генерации выступления всех 10 NPC для автоматических раундов (1 — визитки, 2 — истории, 3 — факты).
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="roundNumber">Номер раунда (1, 2 или 3).</param>
    /// <param name="phase">Фаза раунда.</param>
    /// <param name="roster">Полный состав из 10 NPC текущей партии.</param>
    /// <param name="recentHistory">Последние реплики в студии.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    public async Task EnqueueRoundSpeechesAsync(
        string sessionId,
        int roundNumber,
        RoundPhase phase,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Enqueueing {NpcCount} speeches for session {SessionId}, round {RoundNumber}",
            roster.Count,
            sessionId,
            roundNumber);

        foreach (NpcPersona speaker in roster.OrderBy(npc => npc.Number))
        {
            DialogueTask task = CreateRoundSpeechTask(sessionId, roundNumber, phase, speaker, roster, recentHistory);
            await generationQueue.EnqueueAsync(task, cancellationToken);
        }
    }

    /// <summary>
    /// Ставит в очередь генерации ответ выбранного NPC на прямой вопрос судьи в раунде 4.
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="askingPlayerId">Идентификатор игрока, задавшего вопрос.</param>
    /// <param name="questionId">Уникальный идентификатор запроса (<c>requestId</c>).</param>
    /// <param name="questionText">Текст вопроса от судьи.</param>
    /// <param name="targetSpeaker">Профиль выбранного NPC.</param>
    /// <param name="roster">Полный состав из 10 NPC.</param>
    /// <param name="recentHistory">Последние реплики в студии.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    public async Task EnqueueInterrogationQuestionAsync(
        string sessionId,
        string askingPlayerId,
        string questionId,
        string questionText,
        NpcPersona targetSpeaker,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Enqueueing interrogation question {QuestionId} from player {PlayerId} to NPC #{NpcNumber} in session {SessionId}",
            questionId,
            askingPlayerId,
            targetSpeaker.Number,
            sessionId);

        NpcDialoguePrompt prompt = new(
            sessionId,
            InterrogationRoundNumber,
            RoundPhase.Interrogation,
            targetSpeaker,
            recentHistory,
            questionText,
            questionId);

        DialogueTask task = new(questionId, prompt, BuildListenersForSpeaker(targetSpeaker, roster), true, askingPlayerId);
        await generationQueue.EnqueueAsync(task, cancellationToken);
    }

    /// <summary>
    /// Создаёт задачу генерации реплики и реакций для одного выступающего NPC в раундах 1–3.
    /// </summary>
    private static DialogueTask CreateRoundSpeechTask(
        string sessionId,
        int roundNumber,
        RoundPhase phase,
        NpcPersona speaker,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory)
    {
        string taskId = $"{sessionId}:r{roundNumber}:npc{speaker.Number}";
        NpcDialoguePrompt prompt = new(sessionId, roundNumber, phase, speaker, recentHistory);
        IReadOnlyList<NpcListenerProfile> listeners = BuildListenersForSpeaker(speaker, roster);
        return new DialogueTask(taskId, prompt, listeners, GenerateEnsembleReactions: true);
    }

    /// <summary>
    /// Формирует список профилей остальных 9 NPC, слушающих выступление текущего спикера.
    /// </summary>
    private static IReadOnlyList<NpcListenerProfile> BuildListenersForSpeaker(
        NpcPersona speaker,
        IReadOnlyList<NpcPersona> roster)
    {
        List<NpcListenerProfile> listeners = new(Math.Max(0, roster.Count - 1));
        foreach (NpcPersona candidate in roster.Where(npc => npc.NpcId != speaker.NpcId))
        {
            string relation = DescribeRelationToSpeaker(speaker, candidate);
            listeners.Add(new NpcListenerProfile(
                candidate.NpcId,
                candidate.Number,
                candidate.DisplayName,
                candidate.Role,
                candidate.TargetNpcNumber,
                relation));
        }

        return listeners;
    }

    /// <summary>
    /// Определяет краткое описание скрытого отношения слушающего NPC к говорящему.
    /// </summary>
    private static string DescribeRelationToSpeaker(NpcPersona speaker, NpcPersona listener)
    {
        if (listener.Role == NpcRole.TrueFriend && listener.TargetNpcId == speaker.NpcId)
        {
            return TrueFriendRelation;
        }

        if (listener.Role == NpcRole.Actor && listener.TargetNpcId == speaker.NpcId)
        {
            return ActorTargetingSpeakerRelation;
        }

        if (speaker.Role == NpcRole.Actor && speaker.TargetNpcId == listener.NpcId)
        {
            return SpeakerTargetingListenerRelation;
        }

        return UnrelatedObserverRelation;
    }
}
