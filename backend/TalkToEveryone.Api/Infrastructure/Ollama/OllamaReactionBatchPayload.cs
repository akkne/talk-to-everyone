using System.Text.Json.Serialization;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Десериализуемая корневая JSON-структура пакетного ответа с реакциями остальных 9 NPC.
/// </summary>
/// <param name="Reactions">Список реакций слушающих участников студии.</param>
public sealed record OllamaReactionBatchPayload(
    [property: JsonPropertyName("reactions")] IReadOnlyList<OllamaReactionItemPayload>? Reactions);
