using System.Text.Json;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Каталог строгих JSON Schema для поля <c>format</c> в Ollama (Схема А и Схема Б спецификации «Угадай кента»).
/// </summary>
public sealed class OllamaJsonSchemaCatalog
{
    private const string SpeakerReplySchemaJson = """
        {
          "type": "object",
          "properties": {
            "public_speech": {
              "type": "string",
              "description": "Реплика бота вслух для вывода в облачке текста над головой (80-220 символов)."
            },
            "emotion_enum": {
              "type": "string",
              "enum": ["CHILL", "ROFL", "SWEAT", "RAGE", "FACEPALM", "SMIRK", "SHOCK"]
            },
            "reaction_label": {
              "type": "string",
              "description": "Короткий статус действия (2-3 слова, например: 'нервно потеет', 'ухмыляется в кулак')."
            },
            "hidden_thought": {
              "type": "string",
              "description": "Внутренняя скрытая мысль бота для финального экрана разоблачения."
            },
            "addressing_slot": {
              "type": "integer",
              "description": "Номер слота (1-10), на который смотрит или к которому обращается бот (0, если обращается ко всему жюри)."
            }
          },
          "required": ["public_speech", "emotion_enum", "reaction_label", "hidden_thought", "addressing_slot"],
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
                  "slot_id": { "type": "integer" },
                  "emotion_enum": {
                    "type": "string",
                    "enum": ["CHILL", "ROFL", "SWEAT", "RAGE", "FACEPALM", "SMIRK", "SHOCK"]
                  },
                  "reaction_label": { "type": "string" },
                  "internal_thought": { "type": "string" }
                },
                "required": ["slot_id", "emotion_enum", "reaction_label", "internal_thought"],
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
    /// Возвращает Схему А (<c>SINGLE BOT TURN</c>) для генерации хода активного бота.
    /// </summary>
    public JsonElement GetSpeakerReplySchema() => _speakerReplySchema;

    /// <summary>
    /// Возвращает Схему Б (<c>BACKGROUND REACTIONS BATCH</c>) для «Режиссёра реакций».
    /// </summary>
    public JsonElement GetReactionBatchSchema() => _reactionBatchSchema;

    /// <summary>
    /// Парсит и клонирует корневой <see cref="JsonElement"/> из строкового представления схемы.
    /// </summary>
    private static JsonElement ParseSchema(string rawJson)
    {
        using JsonDocument document = JsonDocument.Parse(rawJson);
        return document.RootElement.Clone();
    }
}
