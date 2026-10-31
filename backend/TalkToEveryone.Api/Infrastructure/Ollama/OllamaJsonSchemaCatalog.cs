using System.Text.Json;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Каталог строгих JSON Schema для параметра <c>format</c> в запросах к Ollama (<c>/api/chat</c>).
/// Гарантирует детерминированную структуру JSON-ответа без обёрток Markdown.
/// </summary>
public sealed class OllamaJsonSchemaCatalog
{
    private const string SpeakerReplySchemaJson = """
        {
          "type": "object",
          "properties": {
            "text": {
              "type": "string",
              "description": "Короткая живая реплика NPC на русском языке (1-3 предложения)."
            },
            "emotion": {
              "type": "string",
              "enum": ["neutral", "smirk", "laugh", "facepalm", "angry", "nervous", "surprised", "smile"]
            }
          },
          "required": ["text", "emotion"],
          "additionalProperties": false
        }
        """;

    private const string ReactionBatchSchemaJson = """
        {
          "type": "object",
          "properties": {
            "reactions": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "npcNumber": { "type": "integer" },
                  "reaction": { "type": "string" },
                  "emotion": {
                    "type": "string",
                    "enum": ["neutral", "smirk", "laugh", "facepalm", "angry", "nervous", "surprised", "smile"]
                  },
                  "reason": { "type": "string" }
                },
                "required": ["npcNumber", "reaction", "emotion", "reason"],
                "additionalProperties": false
              }
            }
          },
          "required": ["reactions"],
          "additionalProperties": false
        }
        """;

    private readonly JsonElement _speakerReplySchema = ParseSchema(SpeakerReplySchemaJson);
    private readonly JsonElement _reactionBatchSchema = ParseSchema(ReactionBatchSchemaJson);

    /// <summary>
    /// Возвращает JSON Schema для генерации одиночной реплики говорящего NPC.
    /// </summary>
    public JsonElement GetSpeakerReplySchema() => _speakerReplySchema;

    /// <summary>
    /// Возвращает JSON Schema для пакетной генерации реакций остальных 9 NPC.
    /// </summary>
    public JsonElement GetReactionBatchSchema() => _reactionBatchSchema;

    private static JsonElement ParseSchema(string rawJson)
    {
        using JsonDocument document = JsonDocument.Parse(rawJson);
        return document.RootElement.Clone();
    }
}
