namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Полный серверный профиль участника шоу «Угадай кента» (Слоты 1–10) для формирования системного промпта.
/// </summary>
/// <param name="NpcId">Непрозрачный строковый идентификатор бота.</param>
/// <param name="SlotId">Номер слота на двухуровневой трибуне от 1 до 10 (<c>{{SLOT_ID}}</c>).</param>
/// <param name="BotName">Имя бота (<c>{{BOT_NAME}}</c>).</param>
/// <param name="Role">Секретная роль: <see cref="NpcRole.TrueFriend"/> («Настоящий кент») или <see cref="NpcRole.Actor"/> («Актёр-импостор»).</param>
/// <param name="BotVibeOrArchetype">Характер, архетип и стиль базара (<c>{{BOT_VIBE_OR_ARCHETYPE}}</c>).</param>
/// <param name="TargetNpcId">ID реального кента (для TrueFriend) или ID выбранной жертвы (для Actor).</param>
/// <param name="TargetSlotId">Номер слота (1–10) реального кента (<c>{{PARTNER_SLOT}}</c>) или жертвы импостора (<c>{{TARGET_SLOT}}</c>).</param>
/// <param name="TargetName">Имя реального кента (<c>{{PARTNER_NAME}}</c>) или жертвы импостора (<c>{{TARGET_NAME}}</c>).</param>
/// <param name="TrueFriendLore">Секретная база пары (заполнена для роли «Настоящий кент»).</param>
/// <param name="DefenseStrategy">Тактика защиты при проколах (<c>{{DEFENSE_STRATEGY}}</c>, заполнена для роли «Актёр-импостор»).</param>
public sealed record NpcPersona(
    string NpcId,
    int SlotId,
    string BotName,
    NpcRole Role,
    string BotVibeOrArchetype,
    string TargetNpcId,
    int TargetSlotId,
    string TargetName,
    SharedLore? TrueFriendLore,
    string? DefenseStrategy);
