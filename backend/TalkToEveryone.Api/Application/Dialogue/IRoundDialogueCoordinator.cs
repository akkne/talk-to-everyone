using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Application.Dialogue;

/// <summary>
/// Координирует постановку задач генерации ходов и реакций NPC в очередь для всех раундов R1–R5 шоу «Угадай кента».
/// </summary>
public interface IRoundDialogueCoordinator
{
    /// <summary>
    /// Ставит в очередь генерации выступления всех 10 слотов для линейных раундов (R1 — визитки, R2 — истории, R3 — блиц).
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="roundNumber">Номер раунда (1, 2 или 3).</param>
    /// <param name="phase">Фаза раунда.</param>
    /// <param name="roster">Полный состав из 10 слотов текущей партии.</param>
    /// <param name="recentHistory">Краткая сводка прошлых реплик в комнате.</param>
    /// <param name="round1SpeechesBySlot">Реплики слотов из Раунда 1 (для генерации историй импосторов в Раунде 2).</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    Task EnqueueRoundSpeechesAsync(
        string sessionId,
        int roundNumber,
        RoundPhase phase,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory,
        IReadOnlyDictionary<int, string>? round1SpeechesBySlot,
        CancellationToken cancellationToken);

    /// <summary>
    /// Ставит в очередь дополнительный запрос Раунда 2: встречный вброс соседа с места (до 110 символов).
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="counterSpeaker">Профиль соседа, кидающего встречную реплику.</param>
    /// <param name="activeSlotId">Номер слота, только что рассказавшего историю (<c>{{ACTIVE_SLOT}}</c>).</param>
    /// <param name="activeName">Имя бота, только что рассказавшего историю (<c>{{ACTIVE_NAME}}</c>).</param>
    /// <param name="activeRound2Speech">Текст истории из Раунда 2 (<c>{{ACTIVE_R2_SPEECH}}</c>).</param>
    /// <param name="roster">Полный состав из 10 слотов.</param>
    /// <param name="recentHistory">Сводка прошлых реплик.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    Task EnqueueRound2CounterThrowAsync(
        string sessionId,
        NpcPersona counterSpeaker,
        int activeSlotId,
        string activeName,
        string activeRound2Speech,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory,
        CancellationToken cancellationToken);

    /// <summary>
    /// Ставит в очередь ответ выбранного слота на прямой вопрос судьи в Раунде 4 (<see cref="RoundPhase.Interrogation"/>).
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="askingPlayerId">Идентификатор игрока-судьи.</param>
    /// <param name="questionId">Уникальный идентификатор запроса (<c>requestId</c>).</param>
    /// <param name="questionText">Текст вопроса жюри (<c>{{JURY_QUESTION_TEXT}}</c>).</param>
    /// <param name="targetSpeaker">Профиль допрашиваемого слота.</param>
    /// <param name="roster">Полный состав из 10 слотов.</param>
    /// <param name="recentHistory">Краткая сводка прошлых реплик.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    Task EnqueueInterrogationQuestionAsync(
        string sessionId,
        string askingPlayerId,
        string questionId,
        string questionText,
        NpcPersona targetSpeaker,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory,
        CancellationToken cancellationToken);

    /// <summary>
    /// Ставит в очередь один ход эстафеты Раунда 5 (Цепная перепалка ИИ без участия жюри).
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="turnIndex">Порядковый номер хода эстафеты (1–10).</param>
    /// <param name="currentSpeaker">Слот, которому передали слово по <c>addressing_slot</c>.</param>
    /// <param name="previousSlotId">Номер предыдущего слота (<c>{{PREV_SLOT}}</c>).</param>
    /// <param name="previousName">Имя предыдущего слота (<c>{{PREV_NAME}}</c>).</param>
    /// <param name="previousSpeech">Реплика-предъява предыдущего слота (<c>{{PREV_SPEECH}}</c>).</param>
    /// <param name="availableSlotsList">Список слотов, которые ещё не говорили в Раунде 5 (<c>{{AVAILABLE_SLOTS_LIST}}</c>).</param>
    /// <param name="roster">Полный состав из 10 слотов.</param>
    /// <param name="recentHistory">Краткая сводка реплик.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    Task EnqueueRound5CrossfireTurnAsync(
        string sessionId,
        int turnIndex,
        NpcPersona currentSpeaker,
        int previousSlotId,
        string previousName,
        string previousSpeech,
        IReadOnlyList<int> availableSlotsList,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory,
        CancellationToken cancellationToken);
}
