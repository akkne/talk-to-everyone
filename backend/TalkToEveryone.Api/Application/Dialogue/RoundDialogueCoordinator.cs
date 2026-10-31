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

    /// <inheritdoc />
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
            string taskId = $"{sessionId}:r{roundNumber}:npc{speaker.Number}";
            NpcDialoguePrompt prompt = new(
                SessionId: sessionId,
                RoundNumber: roundNumber,
                Phase: phase,
                Speaker: speaker,
                RecentHistory: recentHistory);

            IReadOnlyList<NpcListenerProfile> listeners = BuildListenersForSpeaker(speaker, roster);
            DialogueTask task = new(
                TaskId: taskId,
                DialoguePrompt: prompt,
                Listeners: listeners,
                GenerateEnsembleReactions: true);

            await generationQueue.EnqueueAsync(task, cancellationToken);
        }
    }

    /// <inheritdoc />
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
            SessionId: sessionId,
            RoundNumber: InterrogationRoundNumber,
            Phase: RoundPhase.Interrogation,
            Speaker: targetSpeaker,
            RecentHistory: recentHistory,
            JudgeQuestionText: questionText,
            QuestionId: questionId);

        IReadOnlyList<NpcListenerProfile> listeners = BuildListenersForSpeaker(targetSpeaker, roster);
        DialogueTask task = new(
            TaskId: questionId,
            DialoguePrompt: prompt,
            Listeners: listeners,
            GenerateEnsembleReactions: true,
            AskingPlayerId: askingPlayerId);

        await generationQueue.EnqueueAsync(task, cancellationToken);
    }

    private static IReadOnlyList<NpcListenerProfile> BuildListenersForSpeaker(
        NpcPersona speaker,
        IReadOnlyList<NpcPersona> roster)
    {
        List<NpcListenerProfile> listeners = new(Math.Max(0, roster.Count - 1));
        foreach (NpcPersona candidate in roster)
        {
            if (candidate.NpcId == speaker.NpcId)
            {
                continue;
            }

            string relation = DescribeRelationToSpeaker(speaker, candidate);
            listeners.Add(new NpcListenerProfile(
                NpcId: candidate.NpcId,
                Number: candidate.Number,
                DisplayName: candidate.DisplayName,
                Role: candidate.Role,
                TargetNpcNumber: candidate.TargetNpcNumber,
                RelationSummary: relation));
        }

        return listeners;
    }

    private static string DescribeRelationToSpeaker(NpcPersona speaker, NpcPersona listener)
    {
        if (listener.Role == NpcRole.TrueFriend && listener.TargetNpcId == speaker.NpcId)
        {
            return "настоящий лучший друг говорящего, знает всю правду и общие косяки";
        }

        if (listener.Role == NpcRole.Actor && listener.TargetNpcId == speaker.NpcId)
        {
            return "актёр-самозванец, который притворяется лучшим другом говорящего и подыгрывает ему";
        }

        if (speaker.Role == NpcRole.Actor && speaker.TargetNpcId == listener.NpcId)
        {
            return "говорящий самозванец пытается примазаться к этому участнику, хотя тот его не знает";
        }

        return "сторонний участник шоу, наблюдает со стороны и ищет несостыковки";
    }
}
