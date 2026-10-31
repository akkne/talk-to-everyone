namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Определяет секретную роль NPC в рамках игровой партии.
/// </summary>
public enum NpcRole
{
    /// <summary>
    /// Настоящий друг, обладающий общей базой фактов (Shared Lore) со своим напарником.
    /// </summary>
    TrueFriend = 1,

    /// <summary>
    /// Актёр-самозванец, пытающийся убедить жюри в дружбе с выбранной целью без знания реального лора.
    /// </summary>
    Actor = 2
}
