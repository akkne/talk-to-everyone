using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Diagnostics;
using System.Text.Json;

namespace Backend;

public sealed class LlmClient(HttpClient http, IConfiguration config, ILogger<LlmClient> log)
{
    private string? _resolvedOllamaUrl;
    private string? _resolvedModel;
    private readonly NpcContextBuilder contextBuilder = new();
    private readonly NpcPromptComposer promptComposer = new();
    private readonly NpcSpeechPolicy speechPolicy = new();

    private string ConfiguredOllamaUrl =>
        config["OLLAMA_BASE_URL"] ?? config["Ollama:BaseUrl"] ?? config["OLLAMA__BASEURL"] ?? "http://localhost:11434";

    private string ConfiguredModel =>
        config["OLLAMA_MODEL"] ?? config["Ollama:Model"] ?? config["OLLAMA__MODEL"] ?? "qwen2.5:3b-instruct";

    private int TimeoutSeconds =>
        int.TryParse(config["Ollama:TimeoutSeconds"] ?? config["OLLAMA__TIMEOUTSECONDS"], out var s) ? Math.Clamp(s, 5, 120) : 90;

    private int ContextTokens =>
        int.TryParse(config["OLLAMA_CONTEXT_TOKENS"] ?? config["Ollama:ContextTokens"], out var value)
            ? Math.Clamp(value, 2048, 16384) : 8192;

    public async Task<object> GetOllamaStatusAsync(CancellationToken ct = default)
    {
        var (baseUrl, model, models) = await ProbeOllamaAsync(ct);
        return new
        {
            connected = baseUrl != null,
            baseUrl = baseUrl ?? ConfiguredOllamaUrl,
            model = model ?? ConfiguredModel,
            availableModels = models
        };
    }

    private async Task<(string? baseUrl, string? model, string[] models)> ProbeOllamaAsync(CancellationToken ct)
    {
        var candidates = new[] { _resolvedOllamaUrl, ConfiguredOllamaUrl, "http://localhost:11434", "http://127.0.0.1:11434", "http://host.docker.internal:11434", "http://ollama:11434" }
            .Where(u => !string.IsNullOrWhiteSpace(u))
            .Select(u => u!.TrimEnd('/'))
            .Distinct(StringComparer.OrdinalIgnoreCase);

        foreach (var candidate in candidates)
        {
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromSeconds(2));
                using var response = await http.GetAsync($"{candidate}/api/tags", cts.Token);
                if (!response.IsSuccessStatusCode) continue;
                using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cts.Token), cancellationToken: cts.Token);
                var names = new List<string>();
                if (doc.RootElement.TryGetProperty("models", out var arr) && arr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in arr.EnumerateArray())
                    {
                        if (item.TryGetProperty("name", out var n) && n.GetString() is { Length: > 0 } name)
                            names.Add(name);
                    }
                }
                var preferred = ConfiguredModel;
                var installedModel = names.FirstOrDefault(n => string.Equals(n, preferred, StringComparison.OrdinalIgnoreCase) || n.StartsWith($"{preferred}:", StringComparison.OrdinalIgnoreCase));
                if (installedModel == null) continue;
                _resolvedOllamaUrl = candidate;
                _resolvedModel = installedModel;
                return (_resolvedOllamaUrl, _resolvedModel, names.ToArray());
            }
            catch
            {
                // Try next candidate
            }
        }
        return (null, null, []);
    }

    public async Task<(string text, string emotion)> Answer(GameNpc npc, string question, List<GameMessage> history,
        List<GameNpc>? roster = null, IReadOnlyList<NpcConversationEvent>? events = null, CancellationToken ct = default)
    {
        roster ??= [npc];
        events ??= FromMessages(history);
        var systemPrompt = promptComposer.System(npc, roster);
        var safeQuestion = NpcSpeechPolicy.IsRomanceTopic(question)
            ? "Игрок спросил о теме вне правил игры. Кратко верни разговор к дружбе и общим событиям, не повторяя формулировку вопроса."
            : question;
        var userPrompt = promptComposer.Turn(npc, 4, "interrogation", contextBuilder.Build(npc, roster, events), safeQuestion);
        try { return await CompleteMeasuredAsync("question", npc, roster, events, systemPrompt, userPrompt, ct); }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            log.LogWarning(ex, "Using fallback answer for {NpcId}", npc.Id);
            return NpcFallbackSpeech.For(npc, 4);
        }
    }

    public async Task<(string text, string emotion)> GenerateRoundSpeech(
        GameNpc npc,
        int round,
        string phase,
        List<GameNpc> roster,
        List<GameMessage> roomHistory,
        CancellationToken ct = default,
        IReadOnlyList<NpcConversationEvent>? events = null)
    {
        events ??= FromMessages(roomHistory);
        var systemPrompt = promptComposer.System(npc, roster);
        var userPrompt = promptComposer.Turn(npc, round, phase, contextBuilder.Build(npc, roster, events));
        try { return await CompleteMeasuredAsync("round_speech", npc, roster, events, systemPrompt, userPrompt, ct); }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            log.LogWarning(ex, "Using fallback round speech for {NpcId} in round {Round}", npc.Id, round);
            return NpcFallbackSpeech.For(npc, round);
        }
    }

    private static IReadOnlyList<NpcConversationEvent> FromMessages(List<GameMessage> messages) =>
        messages.OrderBy(m => m.At).ThenBy(m => m.Id).Select((m, i) => new NpcConversationEvent
        {
            Sequence = i + 1, Round = 0, IsQuestion = m.IsQuestion,
            SpeakerNpcId = m.IsQuestion ? null : m.NpcId, Text = m.Text
        }).ToArray();

    private async Task<(string text, string emotion)> CompleteMeasuredAsync(string purpose, GameNpc npc,
        IReadOnlyList<GameNpc> roster, IReadOnlyList<NpcConversationEvent> events, string systemPrompt, string userPrompt,
        CancellationToken ct = default)
    {
        var timer = Stopwatch.StartNew();
        try
        {
            var previous = events.Where(e => !e.IsQuestion && e.SpeakerNpcId == npc.Id)
                .OrderByDescending(e => e.Sequence).Take(3).Select(e => e.Text).ToArray();
            Exception? lastError = null;
            for (var attempt = 0; attempt < 3; attempt++)
            {
                (string text, string emotion) result;
                try { result = await CompleteAsync(systemPrompt, userPrompt, ct); }
                catch (Exception ex) when (!ct.IsCancellationRequested)
                {
                    lastError = ex;
                    log.LogWarning(ex, "NPC generation attempt {Attempt} failed for {NpcId}", attempt + 1, npc.Id);
                    continue;
                }
                var reason = speechPolicy.Reject(npc, roster, result.text, previous);
                if (reason is null)
                {
                    GameMetrics.LlmRequests.WithLabels(purpose, "success").Inc();
                    return result;
                }
                GameMetrics.NpcSpeechRejections.WithLabels(purpose, reason.Value.Code).Inc();
                log.LogWarning("NPC speech rejected for {NpcId}: {Reason}", npc.Id, reason.Value.Code);
                userPrompt += $"\nПредыдущий вариант отклонён: {reason.Value.Message} Напиши новую реплику без нарушения.";
            }
            throw new InvalidOperationException("NPC speech generation failed after retries.", lastError);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            GameMetrics.LlmRequests.WithLabels(purpose, "cancelled").Inc();
            throw;
        }
        catch
        {
            GameMetrics.LlmRequests.WithLabels(purpose, "failure").Inc();
            throw;
        }
        finally
        {
            GameMetrics.LlmDuration.WithLabels(purpose).Observe(timer.Elapsed.TotalSeconds);
        }
    }

    private async Task<(string text, string emotion)> CompleteAsync(string systemPrompt, string userPrompt, CancellationToken ct = default)
    {
        // 1. Try local/host Ollama first
        var (ollamaUrl, ollamaModel, _) = await ProbeOllamaAsync(ct);
        if (ollamaUrl != null && ollamaModel != null)
        {
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromSeconds(TimeoutSeconds));
                var schema = JsonDocument.Parse("""
                {
                  "type": "object",
                  "properties": {
                    "text": { "type": "string", "minLength": 1, "maxLength": 220 },
                    "emotion": { "type": "string", "enum": ["neutral", "happy", "sad", "angry", "surprised"] }
                  },
                  "required": ["text", "emotion"],
                  "additionalProperties": false
                }
                """).RootElement;

                var payload = new
                {
                    model = ollamaModel,
                    messages = new[]
                    {
                        new { role = "system", content = systemPrompt },
                        new { role = "user", content = userPrompt }
                    },
                    stream = false,
                    keep_alive = -1,
                    format = schema,
                    options = new
                    {
                        temperature = 0.75,
                        num_ctx = ContextTokens,
                        num_predict = 256
                    }
                };

                using var response = await http.PostAsJsonAsync($"{ollamaUrl}/api/chat", payload, cts.Token);
                response.EnsureSuccessStatusCode();
                using var body = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cts.Token), cancellationToken: cts.Token);
                var raw = body.RootElement.GetProperty("message").GetProperty("content").GetString() ?? "";
                var parsed = ParseJsonReply(raw);
                if (parsed != null) return parsed.Value;
                log.LogWarning("Ollama returned an empty or invalid reply at {OllamaUrl} (model {Model})", ollamaUrl, ollamaModel);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Ollama request failed at {OllamaUrl} (model {Model})", ollamaUrl, ollamaModel);
            }
        }

        // 2. Try OpenAI-compatible LLM_ENDPOINT if configured
        var endpoint = config["LLM_ENDPOINT"];
        var key = config["LLM_API_KEY"];
        if (!string.IsNullOrWhiteSpace(endpoint) && !string.IsNullOrWhiteSpace(key))
        {
            try
            {
                var model = config["LLM_MODEL"] ?? "gpt-4o-mini";
                using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
                request.Content = JsonContent.Create(new
                {
                    model,
                    messages = new[]
                    {
                        new { role = "system", content = systemPrompt },
                        new { role = "user", content = userPrompt }
                    },
                    temperature = 0.7,
                    response_format = new { type = "json_object" }
                });
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromSeconds(12));
                using var response = await http.SendAsync(request, cts.Token);
                response.EnsureSuccessStatusCode();
                using var body = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cts.Token), cancellationToken: cts.Token);
                var raw = body.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
                var parsed = ParseJsonReply(raw);
                if (parsed != null) return parsed.Value;
                log.LogWarning("External LLM endpoint returned an empty or invalid reply");
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                log.LogWarning(ex, "External LLM endpoint failed");
            }
        }

        throw new InvalidOperationException("No language model returned a valid answer. Check Ollama or LLM_ENDPOINT configuration.");
    }

    private static (string text, string emotion)? ParseJsonReply(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        using var result = JsonDocument.Parse(raw);
        var root = result.RootElement;
        var text = (root.TryGetProperty("text", out var t) ? t.GetString()
            : root.TryGetProperty("public_speech", out var ps) ? ps.GetString() : null)?.Trim() ?? "";
        if (text.Length == 0) return null;
        var emotionValue = root.TryGetProperty("emotion", out var e) ? e
            : root.TryGetProperty("emotion_enum", out var ee) ? ee : default;
        var emotion = emotionValue.ValueKind == JsonValueKind.String ? emotionValue.GetString()?.Trim().ToLowerInvariant() : null;
        emotion = emotion switch
        {
            "happy" or "rofl" or "smirk" => "happy",
            "sad" or "facepalm" or "sweat" => "sad",
            "angry" or "rage" => "angry",
            "surprised" or "shock" => "surprised",
            _ => "neutral"
        };
        return (text, emotion);
    }
}
