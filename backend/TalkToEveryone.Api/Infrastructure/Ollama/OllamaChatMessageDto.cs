using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Сообщение диалога во внутреннем формате запроса и ответа Ollama (<c>/api/chat</c>).
/// </summary>
/// <param name="Role">Роль отправителя сообщения (<c>system</c>, <c>user</c> или <c>assistant</c>).</param>
/// <param name="Content">Текстовое содержимое сообщения.</param>
public sealed record OllamaChatMessageDto(
    [property: JsonPropertyName("role")] string Role,
    [property: JsonPropertyName("content")] string Content);
