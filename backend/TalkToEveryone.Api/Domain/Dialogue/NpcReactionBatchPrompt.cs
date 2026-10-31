namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Входные данные для пакетной генерации реакций остальных 9 NPC на только что прозвучавшую реплику.
/// </summary>
/// <param name="SessionId">Идентификатор игровой сессии.</param>
/// <param name="RoundNumber">Номер текущего раунда.</param>
/// <param name="SpeakerNumber">Номер говорящего NPC (1–10).</param>
/// <param name="SpeakerName">Имя говорящего NPC.</param>
/// <param name="SpokenText">Текст только что произнесённой реплики.</param>
/// <param name="Listeners">Список остальных участников студии (до 9 NPC), которые должны отреагировать.</param>
public sealed record NpcReactionBatchPrompt(
    string SessionId,
    int RoundNumber,
    int SpeakerNumber,
    string SpeakerName,
    string SpokenText,
    IReadOnlyList<NpcListenerProfile> Listeners);
