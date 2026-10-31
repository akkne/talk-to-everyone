namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Каталог допустимых эмоций NPC и нормализация значений, полученных от модели.
/// </summary>
public sealed class NpcEmotionCatalog
{
    /// <summary>
    /// Эмоция по умолчанию при неизвестном или пустом значении от LLM.
    /// </summary>
    public const string Neutral = "neutral";

    /// <summary>
    /// Ухмылка или ироничный подкол.
    /// </summary>
    public const string Smirk = "smirk";

    /// <summary>
    /// Смех или весёлая реакция.
    /// </summary>
    public const string Laugh = "laugh";

    /// <summary>
    /// Испанский стыд или фейспалм от истории друга.
    /// </summary>
    public const string Facepalm = "facepalm";

    /// <summary>
    /// Возмущение или защитная агрессия.
    /// </summary>
    public const string Angry = "angry";

    /// <summary>
    /// Нервозность или неуверенность при блефе.
    /// </summary>
    public const string Nervous = "nervous";

    /// <summary>
    /// Удивление или шок от заявления другого участника.
    /// </summary>
    public const string Surprised = "surprised";

    /// <summary>
    /// Уверенное согласие или одобрительная улыбка.
    /// </summary>
    public const string Smile = "smile";

    private static readonly IReadOnlySet<string> AllowedEmotions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        Neutral,
        Smirk,
        Laugh,
        Facepalm,
        Angry,
        Nervous,
        Surprised,
        Smile
    };

    /// <summary>
    /// Возвращает список всех поддерживаемых кодов эмоций для инструкций промпта.
    /// </summary>
    public IReadOnlyCollection<string> GetAllowedEmotions() => AllowedEmotions;

    /// <summary>
    /// Приводит строку эмоции от модели к допустимому значению контракта или возвращает <see cref="Neutral"/>.
    /// </summary>
    /// <param name="rawEmotion">Сырая строка эмоции из ответа LLM.</param>
    /// <returns>Нормализованный код эмоции в нижнем регистре.</returns>
    public string Normalize(string? rawEmotion)
    {
        if (string.IsNullOrWhiteSpace(rawEmotion))
        {
            return Neutral;
        }

        string candidate = rawEmotion.Trim().ToLowerInvariant();
        return AllowedEmotions.Contains(candidate) ? candidate : Neutral;
    }
}
