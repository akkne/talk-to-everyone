using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Application.Dialogue;

/// <summary>
/// Координирует постановку задач генерации реплик и реакций NPC в очередь для раундов 1–3 и допроса в раунде 4.
/// </summary>
public interface IRoundDialogueCoordinator
{
    /// <summary>
    /// Ставит в очередь генерации выступления всех 10 NPC для автоматических раундов (1 — визитки, 2 — истории, 3 — факты).
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="roundNumber">Номер раунда (1, 2 или 3).</param>
    /// <param name="phase">Фаза раунда (<see cref="RoundPhase.Presentation"/>, <see cref="RoundPhase.Gossip"/> или <see cref="RoundPhase.Blindspots"/>).</param>
    /// <param name="roster">Полный состав из 10 NPC текущей партии.</param>
    /// <param name="recentHistory">Последние реплики в студии.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    Task EnqueueRoundSpeechesAsync(
        string sessionId,
        int roundNumber,
        RoundPhase phase,
        IReadOnlyList<NpcPersona> roster,
        IReadOnlyList<ChatHistoryEntry> recentHistory,
        CancellationToken cancellationToken);

    /// <summary>
    /// Ставит в очередь генерации ответ выбранного NPC на прямой вопрос судьи в раунде 4 (<see cref="RoundPhase.Interrogation"/>).
    /// </summary>
    /// <param name="sessionId">Идентификатор игровой сессии.</param>
    /// <param name="askingPlayerId">Идентификатор игрока, задавшего вопрос.</param>
    /// <param name="questionId">Уникальный идентификатор запроса (<c>requestId</c>).</param>
    /// <param name="questionText">Текст вопроса от судьи.</param>
    /// <param name="targetSpeaker">Профиль выбранного NPC, которому адресован вопрос.</param>
    /// <param name="roster">Полный состав из 10 NPC для формирования списка слушателей.</param>
    /// <param name="recentHistory">Последние реплики в студии.</param>
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
}
