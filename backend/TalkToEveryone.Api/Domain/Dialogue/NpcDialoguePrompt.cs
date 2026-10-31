namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Контекст генерации хода активного бота для раундов R1–R5 шоу «Угадай кента».
/// </summary>
/// <param name="SessionId">Идентификатор игровой сессии.</param>
/// <param name="RoundNumber">Номер текущего раунда (1–5).</param>
/// <param name="Phase">Фаза раунда (<see cref="RoundPhase"/>).</param>
/// <param name="Speaker">Серверный профиль активного бота.</param>
/// <param name="RecentHistory">Краткая сводка прошлых реплик в комнате (<c>{{SHORT_ROOM_SUMMARY}}</c>).</param>
/// <param name="TargetRound1Speech">Реплика цели из Раунда 1 (<c>{{TARGET_R1_SPEECH}}</c>) для генерации истории импостора в Раунде 2.</param>
/// <param name="ActiveSlotId">Номер слота только что выступившего бота (<c>{{ACTIVE_SLOT}}</c>) для встречного вброса в Раунде 2.</param>
/// <param name="ActiveName">Имя только что выступившего бота (<c>{{ACTIVE_NAME}}</c>) для встречного вброса в Раунде 2.</param>
/// <param name="ActiveRound2Speech">Текст истории из Раунда 2 (<c>{{ACTIVE_R2_SPEECH}}</c>) для встречного вброса соседа.</param>
/// <param name="JuryQuestionText">Текст вопроса от живого судьи (<c>{{JURY_QUESTION_TEXT}}</c>) в Раунде 4.</param>
/// <param name="QuestionId">Идентификатор вопроса (<c>requestId</c>) в Раунде 4.</param>
/// <param name="PreviousSlotId">Номер слота предыдущего говорящего (<c>{{PREV_SLOT}}</c>) в эстафете Раунда 5.</param>
/// <param name="PreviousName">Имя предыдущего говорящего (<c>{{PREV_NAME}}</c>) в эстафете Раунда 5.</param>
/// <param name="PreviousSpeech">Текст предъявы предыдущего слота (<c>{{PREV_SPEECH}}</c>) в эстафете Раунда 5.</param>
/// <param name="AvailableSlotsList">Список номеров слотов, которые ещё не говорили в Раунде 5 (<c>{{AVAILABLE_SLOTS_LIST}}</c>).</param>
public sealed record NpcDialoguePrompt(
    string SessionId,
    int RoundNumber,
    RoundPhase Phase,
    NpcPersona Speaker,
    IReadOnlyList<ChatHistoryEntry> RecentHistory,
    string? TargetRound1Speech = null,
    int? ActiveSlotId = null,
    string? ActiveName = null,
    string? ActiveRound2Speech = null,
    string? JuryQuestionText = null,
    string? QuestionId = null,
    int? PreviousSlotId = null,
    string? PreviousName = null,
    string? PreviousSpeech = null,
    IReadOnlyList<int>? AvailableSlotsList = null);
