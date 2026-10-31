using System.Text.Json;
using Microsoft.Extensions.Options;
using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Реализация <see cref="INpcReactionModel"/> для «Режиссёра реакций» по Схеме Б (<c>BACKGROUND REACTIONS BATCH</c>).
/// Использует профиль инференса батча реакций (<c>temperature: 0.6, num_ctx: 2048, num_predict: 180</c>)
/// и возвращает ровно 3 самые острые реакции трибуны.
/// </summary>
/// <param name="transport">Низкоуровневый HTTP-транспорт Ollama.</param>
/// <param name="promptComposer">Сборщик промптов «Режиссёра реакций».</param>
/// <param name="schemaCatalog">Каталог JSON Schema для параметра <c>format</c>.</param>
/// <param name="emotionCatalog">Каталог и нормализатор <c>emotion_enum</c>.</param>
/// <param name="options">Настройки параметров инференса Ollama.</param>
/// <param name="logger">Структурированный логгер.</param>
public sealed class OllamaNpcReactionModel(
    IOllamaTransport transport,
    INpcPromptComposer promptComposer,
    OllamaJsonSchemaCatalog schemaCatalog,
    NpcEmotionCatalog emotionCatalog,
    IOptions<OllamaOptions> options,
    ILogger<OllamaNpcReactionModel> logger) : INpcReactionModel
{
    private const int MaxReactionLabelLength = 80;
    private const string DefaultReactionLabel = "напряженно переглядывается";
    private const string DefaultInternalThought = "Пытаюсь понять, кто сейчас блефует.";

    private readonly OllamaOptions _settings = options.Value;

    /// <summary>
    /// Асинхронно генерирует батч из 3 самых острых реакций трибуны за 1 быстрый запрос к локальной модели.
    /// </summary>
    /// <param name="prompt">Контекст произнесённой фразы и скрытых связей остальных 9 участников.</param>
    /// <param name="cancellationToken">Токен отмены операции.</param>
    /// <returns>Коллекция из 3 реакций наиболее задетых ботов трибуны.</returns>
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
        OllamaInferenceProfile profile = new(
            NumCtx: _settings.ReactionContextTokens,
            NumPredict: _settings.ReactionPredictTokens,
            Temperature: _settings.ReactionTemperature);

        logger.LogInformation(
            "Generating top-3 tribune reactions via Ollama for session {SessionId}, active Slot #{ActiveSlotId}",
            prompt.SessionId,
            prompt.ActiveSlotId);

        string rawJson = await transport.CompleteChatJsonAsync(
            systemPrompt,
            userPrompt,
            schemaCatalog.GetReactionBatchSchema(),
            profile,
            cancellationToken);

        return MapAcuteReactions(rawJson, prompt.Listeners);
    }

    /// <summary>
    /// Сопоставляет выбранные моделью слоты (<c>slot_id</c>) со списком слушателей и ограничивает выборку 3 реакциями.
    /// </summary>
    private IReadOnlyList<NpcReactionResult> MapAcuteReactions(
        string rawJson,
        IReadOnlyList<NpcListenerProfile> listeners)
    {
        OllamaReactionBatchPayload? payload = JsonSerializer.Deserialize<OllamaReactionBatchPayload>(rawJson);
        Dictionary<int, NpcListenerProfile> listenersBySlot = listeners.ToDictionary(item => item.SlotId);
        List<NpcReactionResult> results = new(MatchTimingCatalog.AcuteReactionsBatchSize);

        if (payload?.Reactions is not null)
        {
            foreach (OllamaReactionItemPayload item in payload.Reactions)
            {
                if (listenersBySlot.TryGetValue(item.SlotId, out NpcListenerProfile? listener))
                {
                    results.Add(BuildSingleReactionResult(listener, item));
                }

                if (results.Count == MatchTimingCatalog.AcuteReactionsBatchSize)
                {
                    break;
                }
            }
        }

        return results;
    }

    /// <summary>
    /// Создаёт нормализованный объект реакции для одного выбранного слота трибуны.
    /// </summary>
    private NpcReactionResult BuildSingleReactionResult(
        NpcListenerProfile listener,
        OllamaReactionItemPayload item)
    {
        string reactionLabel = string.IsNullOrWhiteSpace(item.ReactionLabel)
            ? DefaultReactionLabel
            : Truncate(item.ReactionLabel.Trim(), MaxReactionLabelLength);

        string emotionEnum = emotionCatalog.Normalize(item.EmotionEnum);
        string internalThought = string.IsNullOrWhiteSpace(item.InternalThought)
            ? DefaultInternalThought
            : item.InternalThought.Trim();

        return new NpcReactionResult(
            NpcId: listener.NpcId,
            SlotId: listener.SlotId,
            EmotionEnum: emotionEnum,
            ReactionLabel: reactionLabel,
            InternalThought: internalThought);
    }

    /// <summary>
    /// Обрезает строку до максимально допустимой длины.
    /// </summary>
    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength].TrimEnd();
}
