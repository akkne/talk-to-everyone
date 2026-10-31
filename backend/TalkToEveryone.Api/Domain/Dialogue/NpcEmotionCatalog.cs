namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Каталог допустимых эмоций (<c>emotion_enum</c>) по спецификации «Угадай кента» и нормализация значений от модели.
/// </summary>
public sealed class NpcEmotionCatalog
{
    /// <summary>
    /// Спокойствие / базовое состояние (используется по умолчанию при неизвестной эмоции).
    /// </summary>
    public const string Chill = "CHILL";

    /// <summary>
    /// Открытый смех / рофл.
    /// </summary>
    public const string Rofl = "ROFL";

    /// <summary>
    /// Нервозность / испарина при проколе или опасном вопросе.
    /// </summary>
    public const string Sweat = "SWEAT";

    /// <summary>
    /// Гнев / жесткий наезд или защита кента.
    /// </summary>
    public const string Rage = "RAGE";

    /// <summary>
    /// Испанский стыд / фейспалм от кринжовой истории.
    /// </summary>
    public const string Facepalm = "FACEPALM";

    /// <summary>
    /// Ухмылка / самодовольная ирония.
    /// </summary>
    public const string Smirk = "SMIRK";

    /// <summary>
    /// Шок / искреннее удивление от наглого вброса.
    /// </summary>
    public const string Shock = "SHOCK";

    private static readonly IReadOnlySet<string> AllowedEmotions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        Chill,
        Rofl,
        Sweat,
        Rage,
        Facepalm,
        Smirk,
        Shock
    };

    /// <summary>
    /// Возвращает список всех поддерживаемых кодов <c>emotion_enum</c>.
    /// </summary>
    public IReadOnlyCollection<string> GetAllowedEmotions() => AllowedEmotions;

    /// <summary>
    /// Приводит строку эмоции от модели к верхнему регистру из допустимого перечня или возвращает <see cref="Chill"/>.
    /// </summary>
    /// <param name="rawEmotion">Сырая строка эмоции из ответа LLM.</param>
    /// <returns>Валидный код <c>emotion_enum</c> в верхнем регистре.</returns>
    public string Normalize(string? rawEmotion)
    {
        if (string.IsNullOrWhiteSpace(rawEmotion))
        {
            return Chill;
        }

        string candidate = rawEmotion.Trim().ToUpperInvariant();
        return AllowedEmotions.Contains(candidate) ? candidate : Chill;
    }
}
