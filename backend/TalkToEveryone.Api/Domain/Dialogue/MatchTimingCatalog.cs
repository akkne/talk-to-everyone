namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Сводный каталог таймингов матча (~34 минуты) и символьных лимитов реплик по раундам (R1–R5).
/// </summary>
public sealed class MatchTimingCatalog
{
    /// <summary>
    /// Фаза 0: Интро + прогрев Ollama и префетч Слотов 1–10 для Р1 (90 сек).
    /// </summary>
    public const int Phase0IntroAndWarmupSeconds = 90;

    /// <summary>
    /// Раунд 1: Длительность хода одного слота (24 сек) и совещания жюри (90 сек).
    /// </summary>
    public const int Round1SlotSeconds = 24;

    /// <summary>
    /// Совещание жюри после Раунда 1 (90 сек, в фоне префетч Р2).
    /// </summary>
    public const int Round1JuryDeliberationSeconds = 90;

    /// <summary>
    /// Раунд 2: Длительность хода одного слота с учётом истории и встречного вброса (33 сек).
    /// </summary>
    public const int Round2SlotSeconds = 33;

    /// <summary>
    /// Раунд 2: Тайминг встречного вброса соседа с места (8 сек).
    /// </summary>
    public const int Round2CounterThrowSeconds = 8;

    /// <summary>
    /// Совещание жюри после Раунда 2 (120 сек, в фоне префетч Р3).
    /// </summary>
    public const int Round2JuryDeliberationSeconds = 120;

    /// <summary>
    /// Раунд 3 (Блиц): Длительность хода одного слота (21 сек).
    /// </summary>
    public const int Round3SlotSeconds = 21;

    /// <summary>
    /// Совещание жюри после Раунда 3 перед допросом (120 сек).
    /// </summary>
    public const int Round3JuryDeliberationSeconds = 120;

    /// <summary>
    /// Раунд 4 (Послотовый допрос): Общее время на один слот (45 сек, из них до 4–5 сек live-инференс).
    /// </summary>
    public const int Round4SlotInterrogationSeconds = 45;

    /// <summary>
    /// Пауза после Раунда 4 для префетча старта Р5 (60 сек).
    /// </summary>
    public const int Round4PostPauseSeconds = 60;

    /// <summary>
    /// Раунд 5 (Цепная перепалка ИИ): Время одного хода эстафеты (18 сек).
    /// </summary>
    public const int Round5CrossfireTurnSeconds = 18;

    /// <summary>
    /// Финальное голосование жюри после Раунда 5 (90 сек).
    /// </summary>
    public const int Round5FinalVoteSeconds = 90;

    /// <summary>
    /// Финал: Вскрытие пар, показ <c>shared_lore</c> и <c>hidden_thought</c> (120 сек).
    /// </summary>
    public const int FinalRevealSeconds = 120;

    /// <summary>
    /// Минимальная рекомендуемая длина обычной реплики <c>public_speech</c> (80 символов).
    /// </summary>
    public const int MinPublicSpeechChars = 80;

    /// <summary>
    /// Базовый верхний предел реплики <c>public_speech</c> (220 символов).
    /// </summary>
    public const int DefaultMaxPublicSpeechChars = 220;

    /// <summary>
    /// Лимит символов для Раунда 1 (Визитка и ред флаг: 200 символов).
    /// </summary>
    public const int Round1MaxSpeechChars = 200;

    /// <summary>
    /// Лимит символов для Раунда 2 (История косяка: 260 символов).
    /// </summary>
    public const int Round2MaxSpeechChars = 260;

    /// <summary>
    /// Лимит символов для встречного вброса соседа в Раунде 2 (110 символов).
    /// </summary>
    public const int Round2CounterThrowMaxChars = 110;

    /// <summary>
    /// Лимит символов для Раунда 3 (Блиц — долги и мем: 180 символов).
    /// </summary>
    public const int Round3MaxSpeechChars = 180;

    /// <summary>
    /// Лимит символов для ответа на допросе в Раунде 4 (200 символов).
    /// </summary>
    public const int Round4MaxSpeechChars = 200;

    /// <summary>
    /// Количество самых острых реакций трибуны, выбираемых режиссёром реакций за 1 батч-запрос.
    /// </summary>
    public const int AcuteReactionsBatchSize = 3;
}
