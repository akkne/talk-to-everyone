namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Результат генерации реплики одного NPC локальной моделью.
/// </summary>
/// <param name="Text">Сгенерированный текст реплики персонажа на русском языке.</param>
/// <param name="Emotion">Нормализованный код эмоции из <see cref="NpcEmotionCatalog"/>.</param>
public sealed record NpcReply(
    string Text,
    string Emotion);
