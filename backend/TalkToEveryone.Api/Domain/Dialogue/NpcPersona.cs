namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Полный серверный профиль личности и секретной роли NPC для формирования промпта LLM.
/// </summary>
/// <param name="NpcId">Непрозрачный строковый идентификатор NPC.</param>
/// <param name="Number">Публичный номер участника от 1 до 10.</param>
/// <param name="DisplayName">Имя персонажа.</param>
/// <param name="Age">Возраст персонажа.</param>
/// <param name="CharacterTrait">Описание характера, манеры речи и «красного флага» в дружбе.</param>
/// <param name="Role">Секретная роль: настоящий друг или актёр.</param>
/// <param name="TargetNpcId">ID настоящего друга (для TrueFriend) или ID выбранной жертвы (для Actor).</param>
/// <param name="TargetNpcNumber">Публичный номер (1–10) настоящего друга или жертвы актёра.</param>
/// <param name="TargetNpcName">Имя настоящего друга или жертвы актёра.</param>
/// <param name="TrueFriendLore">Секретная общая база фактов (заполнена только для <see cref="NpcRole.TrueFriend"/>).</param>
/// <param name="ActorLegend">Вымышленная легенда прикрытия (заполнена только для <see cref="NpcRole.Actor"/>).</param>
public sealed record NpcPersona(
    string NpcId,
    int Number,
    string DisplayName,
    int Age,
    string CharacterTrait,
    NpcRole Role,
    string TargetNpcId,
    int TargetNpcNumber,
    string TargetNpcName,
    SharedLore? TrueFriendLore,
    string? ActorLegend);
