using System.Text.Json;
using Microsoft.Extensions.Options;
using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Реализация <see cref="INpcDialogueModel"/> поверх локального сервера Ollama по Схеме А (<c>SINGLE BOT TURN</c>).
/// Использует профиль инференса хода бота (<c>temperature: 0.75, num_ctx: 4096, num_predict: 140</c>).
/// </summary>
/// <param name="transport">Низкоуровневый HTTP-транспорт Ollama.</param>
/// <param name="promptComposer">Сборщик системного и раундового промптов.</param>
/// <param name="schemaCatalog">Каталог JSON Schema для параметра <c>format</c>.</param>
/// <param name="emotionCatalog">Каталог и нормализатор <c>emotion_enum</c>.</param>
/// <param name="options">Настройки параметров инференса Ollama.</param>
/// <param name="logger">Структурированный логгер.</param>
public sealed class OllamaNpcDialogueModel(
    IOllamaTransport transport,
    INpcPromptComposer promptComposer,
    OllamaJsonSchemaCatalog schemaCatalog,
    NpcEmotionCatalog emotionCatalog,
    IOptions<OllamaOptions> options,
    ILogger<OllamaNpcDialogueModel> logger) : INpcDialogueModel
{
    private const string DefaultReactionLabel = "держит покерфейс";
    private const string DefaultHiddenThought = "Главное — не спалить контору перед жюри.";
    private const int MinSlotNumber = 0;
    private const int MaxSlotNumber = 10;

    private readonly OllamaOptions _settings = options.Value;

    /// <summary>
    /// Асинхронно генерирует ход активного бота по Схеме А с учётом лимитов символов текущей фазы раунда.
    /// </summary>
    /// <param name="prompt">Контекст хода или допроса NPC.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns>Десериализованный и провалидированный ответ активного бота.</returns>
    public async Task<NpcReply> GenerateReplyAsync(
        NpcDialoguePrompt prompt,
        CancellationToken cancellationToken)
    {
        string systemPrompt = promptComposer.ComposeSpeakerSystemPrompt(prompt);
        string userPrompt = promptComposer.ComposeSpeakerUserPrompt(prompt);
        OllamaInferenceProfile profile = new(
            NumCtx: _settings.SpeakerContextTokens,
            NumPredict: _settings.SpeakerPredictTokens,
            Temperature: _settings.SpeakerTemperature);

        logger.LogInformation(
            "Generating bot turn via Ollama for session {SessionId}, round {RoundNumber}, phase {Phase}, Slot #{SlotId}",
            prompt.SessionId,
            prompt.RoundNumber,
            prompt.Phase,
            prompt.Speaker.SlotId);

        string rawJson = await transport.CompleteChatJsonAsync(
            systemPrompt,
            userPrompt,
            schemaCatalog.GetSpeakerReplySchema(),
            profile,
            cancellationToken);

        return ParseAndValidateReply(rawJson, prompt.Phase);
    }

    /// <summary>
    /// Десериализует JSON по Схеме А и нормализует все поля ответа бота.
    /// </summary>
    private NpcReply ParseAndValidateReply(string rawJson, RoundPhase phase)
    {
        OllamaSpeakerReplyPayload? payload = JsonSerializer.Deserialize<OllamaSpeakerReplyPayload>(rawJson);
        int maxSpeechChars = ResolvePhaseMaxChars(phase);
        string publicSpeech = SanitizePublicSpeech(payload?.PublicSpeech, maxSpeechChars);
        string emotionEnum = emotionCatalog.Normalize(payload?.EmotionEnum);
        string reactionLabel = string.IsNullOrWhiteSpace(payload?.ReactionLabel)
            ? DefaultReactionLabel
            : payload.ReactionLabel.Trim();
        string hiddenThought = string.IsNullOrWhiteSpace(payload?.HiddenThought)
            ? DefaultHiddenThought
            : payload.HiddenThought.Trim();
        int addressingSlot = Math.Clamp(payload?.AddressingSlot ?? MinSlotNumber, MinSlotNumber, MaxSlotNumber);

        return new NpcReply(publicSpeech, emotionEnum, reactionLabel, hiddenThought, addressingSlot);
    }

    /// <summary>
    /// Определяет максимальный лимит символов <c>public_speech</c> для конкретной фазы раунда.
    /// </summary>
    private static int ResolvePhaseMaxChars(RoundPhase phase) =>
        phase switch
        {
            RoundPhase.Presentation => MatchTimingCatalog.Round1MaxSpeechChars,
            RoundPhase.Gossip => MatchTimingCatalog.Round2MaxSpeechChars,
            RoundPhase.GossipCounterThrow => MatchTimingCatalog.Round2CounterThrowMaxChars,
            RoundPhase.Blindspots => MatchTimingCatalog.Round3MaxSpeechChars,
            RoundPhase.Interrogation => MatchTimingCatalog.Round4MaxSpeechChars,
            _ => MatchTimingCatalog.DefaultMaxPublicSpeechChars
        };

    /// <summary>
    /// Проверяет непустоту и обрезает реплику <c>public_speech</c> по лимиту фазы.
    /// </summary>
    private static string SanitizePublicSpeech(string? rawSpeech, int maxChars)
    {
        if (string.IsNullOrWhiteSpace(rawSpeech))
        {
            throw new InvalidOperationException("Ollama model returned an empty public_speech field.");
        }

        string trimmed = rawSpeech.Trim();
        return trimmed.Length <= maxChars ? trimmed : trimmed[..maxChars].TrimEnd();
    }
}
