using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Application.Dialogue;

/// <summary>
/// Реализация <see cref="IRoundDialogueCoordinator"/>, формирующая задачи <see cref="DialogueTask"/>
/// для раундов R1–R5 и список скрытых связей трибуны (<c>{{COMPACT_ROSTER_RELATIONS}}</c>).
/// </summary>
/// <param name="generationQueue">Очередь задач генерации к локальной модели Ollama.</param>
/// <param name="logger">Структурированный логгер.</param>
public sealed class RoundDialogueCoordinator(
    IGameGenerationQueue generationQueue,
    ILogger<RoundDialogueCoordinator> logger) : IRoundDialogueCoordinator
{
    private const int GossipRoundNumber = 2;
    private const int InterrogationRoundNumber = 4;
    private const int CrossfireRoundNumber = 5;

    /// <summary>
    /// Ставит в очередь генерации выступления всех 10 слотов для линейных раундов (R1, R2, R3).
    /// </summary>
    public async Task EnqueueRoundSpeechesAsync(
        string sessionId,
        int roundNumber,
        RoundPhase phase,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory,
        IReadOnlyDictionary<int, string>? round1SpeechesBySlot,
        CancellationToken cancellationToken)
    {
        logger.LogInformation("Enqueueing {NpcCount} slot turns for session {SessionId}, round {RoundNumber}", roster.Count, sessionId, roundNumber);
        foreach (NpcPersona speaker in roster.OrderBy(npc => npc.SlotId))
        {
            string? targetR1Speech = ResolveTargetRound1Speech(speaker, round1SpeechesBySlot);
            DialogueTask task = CreateStandardRoundTask(sessionId, roundNumber, phase, speaker, roster, recentHistory, targetR1Speech);
            await generationQueue.EnqueueAsync(task, cancellationToken);
        }
    }

    /// <summary>
    /// Ставит в очередь встречный вброс соседа с места в Раунде 2 (<see cref="RoundPhase.GossipCounterThrow"/>).
    /// </summary>
    public async Task EnqueueRound2CounterThrowAsync(
        string sessionId,
        NpcPersona counterSpeaker,
        int activeSlotId,
        string activeName,
        string activeRound2Speech,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory,
        CancellationToken cancellationToken)
    {
        string taskId = $"{sessionId}:r2:counter:from{counterSpeaker.SlotId}:to{activeSlotId}";
        NpcDialoguePrompt prompt = new(
            SessionId: sessionId,
            RoundNumber: GossipRoundNumber,
            Phase: RoundPhase.GossipCounterThrow,
            Speaker: counterSpeaker,
            RecentHistory: recentHistory,
            ActiveSlotId: activeSlotId,
            ActiveName: activeName,
            ActiveRound2Speech: activeRound2Speech);

        DialogueTask task = new(taskId, prompt, BuildListenersForSpeaker(counterSpeaker, roster), GenerateEnsembleReactions: false);
        await generationQueue.EnqueueAsync(task, cancellationToken);
    }

    /// <summary>
    /// Ставит в очередь ответ допрашиваемого слота в Раунде 4 (<see cref="RoundPhase.Interrogation"/>).
    /// </summary>
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
        logger.LogInformation("Enqueueing R4 interrogation {QuestionId} for Slot #{SlotId} in session {SessionId}", questionId, targetSpeaker.SlotId, sessionId);
        NpcDialoguePrompt prompt = new(
            SessionId: sessionId,
            RoundNumber: InterrogationRoundNumber,
            Phase: RoundPhase.Interrogation,
            Speaker: targetSpeaker,
            RecentHistory: recentHistory,
            JuryQuestionText: questionText,
            QuestionId: questionId);

        DialogueTask task = new(questionId, prompt, BuildListenersForSpeaker(targetSpeaker, roster), true, askingPlayerId);
        await generationQueue.EnqueueAsync(task, cancellationToken);
    }

    /// <summary>
    /// Ставит в очередь ход эстафеты Раунда 5 (<see cref="RoundPhase.BotCrossfire"/>).
    /// </summary>
    public async Task EnqueueRound5CrossfireTurnAsync(
        string sessionId,
        int turnIndex,
        NpcPersona currentSpeaker,
        int previousSlotId,
        string previousName,
        string previousSpeech,
        IReadOnlyList<int> availableSlotsList,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory,
        CancellationToken cancellationToken)
    {
        string taskId = $"{sessionId}:r5:turn{turnIndex}:slot{currentSpeaker.SlotId}";
        NpcDialoguePrompt prompt = new(
            SessionId: sessionId,
            RoundNumber: CrossfireRoundNumber,
            Phase: RoundPhase.BotCrossfire,
            Speaker: currentSpeaker,
            RecentHistory: recentHistory,
            PreviousSlotId: previousSlotId,
            PreviousName: previousName,
            PreviousSpeech: previousSpeech,
            AvailableSlotsList: availableSlotsList);

        DialogueTask task = new(taskId, prompt, BuildListenersForSpeaker(currentSpeaker, roster), GenerateEnsembleReactions: true);
        await generationQueue.EnqueueAsync(task, cancellationToken);
    }

    /// <summary>
    /// Создаёт стандартную задачу генерации хода и реакций для линейных раундов R1–R3.
    /// </summary>
    private static DialogueTask CreateStandardRoundTask(
        string sessionId,
        int roundNumber,
        RoundPhase phase,
        NpcPersona speaker,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory,
        string? targetR1Speech)
    {
        string taskId = $"{sessionId}:r{roundNumber}:slot{speaker.SlotId}";
        NpcDialoguePrompt prompt = new(sessionId, roundNumber, phase, speaker, recentHistory, TargetRound1Speech: targetR1Speech);
        return new DialogueTask(taskId, prompt, BuildListenersForSpeaker(speaker, roster), GenerateEnsembleReactions: true);
    }

    /// <summary>
    /// Находит реплику цели из Раунда 1 для подстановки в <c>{{TARGET_R1_SPEECH}}</c>.
    /// </summary>
    private static string? ResolveTargetRound1Speech(
        NpcPersona speaker,
        IReadOnlyDictionary<int, string>? round1SpeechesBySlot) =>
        round1SpeechesBySlot is not null && round1SpeechesBySlot.TryGetValue(speaker.TargetSlotId, out string? speech)
            ? speech
            : null;

    /// <summary>
    /// Формирует список остальных 9 слотов трибуны в формате <c>{{COMPACT_ROSTER_RELATIONS}}</c>.
    /// </summary>
    private static IReadOnlyList<NpcListenerProfile> BuildListenersForSpeaker(
        NpcPersona speaker,
        IReadOnlyList<NpcPersona> roster)
    {
        List<NpcListenerProfile> listeners = new(Math.Max(0, roster.Count - 1));
        foreach (NpcPersona candidate in roster.Where(npc => npc.NpcId != speaker.NpcId))
        {
            string line = FormatCompactRelationLine(candidate);
            listeners.Add(new NpcListenerProfile(candidate.NpcId, candidate.SlotId, candidate.BotName, candidate.Role, candidate.TargetSlotId, line));
        }

        return listeners;
    }

    /// <summary>
    /// Форматирует строку связи слота по шаблону «Слот 7 (Влад) — реальный друг Слота 1» или «импостор, охотится на Слот 1».
    /// </summary>
    private static string FormatCompactRelationLine(NpcPersona listener) =>
        listener.Role == NpcRole.TrueFriend
            ? $"Слот {listener.SlotId} ({listener.BotName}) — реальный друг Слота {listener.TargetSlotId}"
            : $"Слот {listener.SlotId} ({listener.BotName}) — импостор, охотится на Слот {listener.TargetSlotId}";
}
