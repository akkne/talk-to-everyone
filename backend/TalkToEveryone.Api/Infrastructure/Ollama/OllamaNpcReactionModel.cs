using System.Text.Json;
using Microsoft.Extensions.Options;
using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Реализация <see cref="INpcReactionModel"/> для пакетной генерации реакций остальных 9 NPC одним запросом к Ollama.
/// </summary>
/// <param name="transport">Низкоуровневый HTTP-транспорт Ollama.</param>
/// <param name="promptComposer">Сборщик промптов для ансамбля слушателей.</param>
/// <param name="schemaCatalog">Каталог JSON Schema для параметра <c>format</c>.</param>
/// <param name="emotionCatalog">Каталог и нормализатор эмоций.</param>
/// <param name="options">Настройки лимитов генерации.</param>
/// <param name="logger">Структурированный логгер.</param>
public sealed class OllamaNpcReactionModel(
    IOllamaTransport transport,
    INpcPromptComposer promptComposer,
    OllamaJsonSchemaCatalog schemaCatalog,
    NpcEmotionCatalog emotionCatalog,
    IOptions<OllamaOptions> options,
    ILogger<OllamaNpcReactionModel> logger) : INpcReactionModel
{
    private const int MaxReactionLength = 120;
    private const string DefaultReactionText = "внимательно слушает";
    private const string DefaultHiddenReason = "Наблюдает за реакцией зала";

    private readonly OllamaOptions _settings = options.Value;

    /// <inheritdoc />
    public async Task<IReadOnlyList<NpcReactionResult>> GenerateReactionsAsync(
        NpcReactionBatchPrompt prompt,
        CancellationToken cancellationToken)
    {
        if (prompt.Listeners.Count == 0)
        {
            return [];
        }

        string systemPrompt = promptComposer.ComposeReactionsSystemPrompt();
        string userPrompt = promptComposer.ComposeReactionsUserPrompt(prompt);

        logger.LogInformation(
            "Generating ensemble reactions via Ollama for session {SessionId}, speaker NPC #{SpeakerNumber}",
            prompt.SessionId,
            prompt.SpeakerNumber);

        string rawJson = await transport.CompleteChatJsonAsync(
            systemPrompt,
            userPrompt,
            schemaCatalog.GetReactionBatchSchema(),
            _settings.ReactionBatchPredictTokens,
            cancellationToken);

        return MapReactionsToListeners(rawJson, prompt.Listeners);
    }

    private IReadOnlyList<NpcReactionResult> MapReactionsToListeners(
        string rawJson,
        IReadOnlyList<NpcListenerProfile> listeners)
    {
        OllamaReactionBatchPayload? payload = JsonSerializer.Deserialize<OllamaReactionBatchPayload>(rawJson);
        Dictionary<int, OllamaReactionItemPayload> byNumber = payload?.Reactions?
            .GroupBy(item => item.NpcNumber)
            .ToDictionary(group => group.Key, group => group.First())
            ?? [];

        List<NpcReactionResult> results = new(listeners.Count);
        foreach (NpcListenerProfile listener in listeners)
        {
            byNumber.TryGetValue(listener.Number, out OllamaReactionItemPayload? item);
            results.Add(BuildSingleReactionResult(listener, item));
        }

        return results;
    }

    private NpcReactionResult BuildSingleReactionResult(
        NpcListenerProfile listener,
        OllamaReactionItemPayload? item)
    {
        string reactionText = string.IsNullOrWhiteSpace(item?.Reaction)
            ? DefaultReactionText
            : Truncate(item.Reaction.Trim(), MaxReactionLength);

        string emotion = emotionCatalog.Normalize(item?.Emotion);
        string reason = string.IsNullOrWhiteSpace(item?.Reason)
            ? DefaultHiddenReason
            : item.Reason.Trim();

        return new NpcReactionResult(
            NpcId: listener.NpcId,
            NpcNumber: listener.Number,
            Reaction: reactionText,
            Emotion: emotion,
            HiddenReason: reason);
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength].TrimEnd();
}
