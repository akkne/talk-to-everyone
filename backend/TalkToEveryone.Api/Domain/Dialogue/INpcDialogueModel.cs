namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Абстракция языковой модели для генерации реплики одного говорящего NPC.
/// </summary>
public interface INpcDialogueModel
{
    /// <summary>
    /// Асинхронно генерирует ответ выбранного NPC с учётом его роли, секретного лора и истории разговора.
    /// </summary>
    /// <param name="prompt">Контекст выступления или допроса NPC.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns>Текст реплики и нормализованный код эмоции.</returns>
    Task<NpcReply> GenerateReplyAsync(NpcDialoguePrompt prompt, CancellationToken cancellationToken);
}
