namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Коды ошибок генерации ответа LLM по контракту API v2 (<c>QuestionFailed</c>).
/// </summary>
public enum DialogueFailureCode
{
    /// <summary>
    /// Превышено время ожидания ответа от локальной модели (<c>LLM_TIMEOUT</c>).
    /// </summary>
    LlmTimeout = 1,

    /// <summary>
    /// Ошибка связи с Ollama или некорректный ответ модели (<c>LLM_ERROR</c>).
    /// </summary>
    LlmError = 2
}
