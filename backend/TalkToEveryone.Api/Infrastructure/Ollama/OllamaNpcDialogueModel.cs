using System.Text.Json;
using Microsoft.Extensions.Options;
using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Реализация <see cref="INpcDialogueModel"/> поверх локального сервера Ollama.
/// Генерирует реплику одного говорящего NPC со строгой валидацией JSON и нормализацией эмоции.
/// </summary>
/// <param name="transport">Низкоуровневый HTTP-транспорт Ollama.</param>
/// <param name="promptComposer">Сборщик системного и пользовательского промптов.</param>
/// <param name="schemaCatalog">Каталог JSON Schema для параметра <c>format</c>.</param>
/// <param name="emotionCatalog">Каталог и нормализатор эмоций.</param>
/// <param name="options">Настройки лимитов генерации.</param>
/// <param name="logger">Структурированный логгер.</param>
public sealed class OllamaNpcDialogueModel(
    IOllamaTransport transport,
    INpcPromptComposer promptComposer,
    OllamaJsonSchemaCatalog schemaCatalog,
    NpcEmotionCatalog emotionCatalog,
    IOptions<OllamaOptions> options,
    ILogger<OllamaNpcDialogueModel> logger) : INpcDialogueModel
{
    private const int MaxReplyCharacters = 500;
    private readonly OllamaOptions _settings = options.Value;

    /// <inheritdoc />
    public async Task<NpcReply> GenerateReplyAsync(
        NpcDialoguePrompt prompt,
        CancellationToken cancellationToken)
    {
        string systemPrompt = promptComposer.ComposeSpeakerSystemPrompt(prompt);
        string userPrompt = promptComposer.ComposeSpeakerUserPrompt(prompt);

        logger.LogInformation(
            "Generating speech via Ollama for session {SessionId}, round {RoundNumber}, NPC #{NpcNumber}",
            prompt.SessionId,
            prompt.RoundNumber,
            prompt.Speaker.Number);

        string rawJson = await transport.CompleteChatJsonAsync(
            systemPrompt,
            userPrompt,
            schemaCatalog.GetSpeakerReplySchema(),
            _settings.MaxPredictTokens,
            cancellationToken);

        return ParseAndValidateReply(rawJson);
    }

    private NpcReply ParseAndValidateReply(string rawJson)
    {
        OllamaSpeakerReplyPayload? payload = JsonSerializer.Deserialize<OllamaSpeakerReplyPayload>(rawJson);
        string cleanedText = SanitizeReplyText(payload?.Text);
        string normalizedEmotion = emotionCatalog.Normalize(payload?.Emotion);

        return new NpcReply(cleanedText, normalizedEmotion);
    }

    private static string SanitizeReplyText(string? rawText)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            throw new InvalidOperationException("Ollama model returned an empty NPC reply text.");
        }

        string trimmed = rawText.Trim();
        return trimmed.Length <= MaxReplyCharacters
            ? trimmed
            : trimmed[..MaxReplyCharacters].TrimEnd();
    }
}
