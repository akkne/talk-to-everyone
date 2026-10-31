namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Фаза игрового раунда согласно контракту API v2.
/// </summary>
public enum RoundPhase
{
    /// <summary>
    /// Раунд 1: Визитка и «красные флаги» в дружбе.
    /// </summary>
    Presentation = 1,

    /// <summary>
    /// Раунд 2: История одного общего косяка (компромат).
    /// </summary>
    Gossip = 2,

    /// <summary>
    /// Раунд 3: Слепые пятна (два абсурдных факта о друге).
    /// </summary>
    Blindspots = 3,

    /// <summary>
    /// Раунд 4: Допрос с пристрастием (ответы на прямые вопросы жюри).
    /// </summary>
    Interrogation = 4,

    /// <summary>
    /// Окно выбора и подтверждения пары после раунда.
    /// </summary>
    Choice = 5,

    /// <summary>
    /// Раунд 5: Финальное вскрытие ролей.
    /// </summary>
    Reveal = 6
}
