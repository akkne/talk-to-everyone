namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Сжатое серверное описание бота на трибуне для «Режиссёра реакций» (<c>{{COMPACT_ROSTER_RELATIONS}}</c>).
/// </summary>
/// <param name="NpcId">Непрозрачный строковый идентификатор бота.</param>
/// <param name="SlotId">Номер слота на трибуне (1–10).</param>
/// <param name="BotName">Имя бота.</param>
/// <param name="Role">Секретная роль бота.</param>
/// <param name="TargetSlotId">Номер слота реального друга или жертвы обмана.</param>
/// <param name="CompactRelationLine">Готовая строка формата «Слот 7 (Влад) — реальный друг Слота 1».</param>
public sealed record NpcListenerProfile(
    string NpcId,
    int SlotId,
    string BotName,
    NpcRole Role,
    int TargetSlotId,
    string CompactRelationLine);
