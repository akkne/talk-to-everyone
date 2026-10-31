namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Результат генерации хода активного бота по Схеме А (<c>SINGLE BOT TURN</c>).
/// </summary>
/// <param name="PublicSpeech">Реплика бота вслух для вывода в облачке текста над головой (<c>public_speech</c>, 80–220 символов).</param>
/// <param name="EmotionEnum">Код эмоции из перечня <see cref="NpcEmotionCatalog"/> (<c>emotion_enum</c>).</param>
/// <param name="ReactionLabel">Короткий статус действия из 2–3 слов (<c>reaction_label</c>, например: «нервно потеет»).</param>
/// <param name="HiddenThought">Внутренняя скрытая мысль бота для финального экрана разоблачения (<c>hidden_thought</c>).</param>
/// <param name="AddressingSlot">Номер слота (1–10), к которому обращается бот, либо 0 при обращении ко всему жюри (<c>addressing_slot</c>).</param>
public sealed record NpcReply(
    string PublicSpeech,
    string EmotionEnum,
    string ReactionLabel,
    string HiddenThought,
    int AddressingSlot);
