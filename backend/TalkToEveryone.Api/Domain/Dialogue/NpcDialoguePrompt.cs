namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Входные данные для генерации одной реплики говорящего NPC.
/// </summary>
/// <param name="SessionId">Идентификатор игровой сессии.</param>
/// <param name="RoundNumber">Номер текущего раунда (1–4).</param>
/// <param name="Phase">Текущая фаза раунда.</param>
/// <param name="Speaker">Серверный профиль говорящего NPC.</param>
/// <param name="RecentHistory">Последние реплики в студии для сохранения контекста.</param>
/// <param name="JudgeQuestionText">Текст вопроса от игрока-судьи (только для раунда 4 <see cref="RoundPhase.Interrogation"/>).</param>
/// <param name="QuestionId">Идентификатор вопроса игрока (<c>requestId</c>), если это ответ на допрос.</param>
public sealed record NpcDialoguePrompt(
    string SessionId,
    int RoundNumber,
    RoundPhase Phase,
    NpcPersona Speaker,
    IReadOnlyList<ChatHistoryEntry> RecentHistory,
    string? JudgeQuestionText = null,
    string? QuestionId = null);
