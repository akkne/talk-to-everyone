namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Входные данные для «Режиссёра реакций» (Single-Call Batch для остальных 9 ботов на трибуне).
/// </summary>
/// <param name="SessionId">Идентификатор игровой сессии.</param>
/// <param name="RoundNumber">Номер текущего раунда.</param>
/// <param name="ActiveSlotId">Номер слота говорящего бота (<c>{{ACTIVE_SLOT}}</c>).</param>
/// <param name="ActiveName">Имя говорящего бота (<c>{{ACTIVE_NAME}}</c>).</param>
/// <param name="CurrentSpeech">Произнесённая фраза (<c>{{CURRENT_SPEECH}}</c>).</param>
/// <param name="Listeners">Список остальных 9 участников на трибуне и их скрытых связей.</param>
public sealed record NpcReactionBatchPrompt(
    string SessionId,
    int RoundNumber,
    int ActiveSlotId,
    string ActiveName,
    string CurrentSpeech,
    IReadOnlyList<NpcListenerProfile> Listeners);
