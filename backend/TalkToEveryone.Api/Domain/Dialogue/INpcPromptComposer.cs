namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Абстракция сборщика системных и пользовательских инструкций (промптов) для языковой модели.
/// </summary>
public interface INpcPromptComposer
{
    /// <summary>
    /// Формирует системный промпт говорящего NPC, включающий его личность, секретную роль и базу фактов.
    /// </summary>
    /// <param name="prompt">Входные данные реплики.</param>
    /// <returns>Текст системного промпта на русском языке.</returns>
    string ComposeSpeakerSystemPrompt(NpcDialoguePrompt prompt);

    /// <summary>
    /// Формирует пользовательский промпт для конкретного раунда, содержащий историю чата и задание фазы.
    /// </summary>
    /// <param name="prompt">Входные данные реплики.</param>
    /// <returns>Текст пользовательского промпта на русском языке.</returns>
    string ComposeSpeakerUserPrompt(NpcDialoguePrompt prompt);

    /// <summary>
    /// Формирует системный промпт для пакетной генерации реакций остальных 9 NPC.
    /// </summary>
    /// <returns>Текст системной инструкции для ансамбля слушателей.</returns>
    string ComposeReactionsSystemPrompt();

    /// <summary>
    /// Формирует пользовательский промпт со списком слушателей и только что прозвучавшей репликой.
    /// </summary>
    /// <param name="prompt">Данные о реплике говорящего и профилях слушателей.</param>
    /// <returns>Текст пользовательского запроса для батча реакций.</returns>
    string ComposeReactionsUserPrompt(NpcReactionBatchPrompt prompt);
}
