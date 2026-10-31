using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Backend;

public sealed class LlmClient(HttpClient http, IConfiguration config, ILogger<LlmClient> log)
{
    private string? _resolvedOllamaUrl;
    private string? _resolvedModel;

    private string ConfiguredOllamaUrl =>
        config["OLLAMA_BASE_URL"] ?? config["Ollama:BaseUrl"] ?? config["OLLAMA__BASEURL"] ?? "http://localhost:11434";

    private string ConfiguredModel =>
        config["OLLAMA_MODEL"] ?? config["Ollama:Model"] ?? config["OLLAMA__MODEL"] ?? config["LLM_MODEL"] ?? "qwen2.5:14b-instruct-q4_K_M";

    private int TimeoutSeconds =>
        int.TryParse(config["Ollama:TimeoutSeconds"] ?? config["OLLAMA__TIMEOUTSECONDS"], out var s) ? Math.Clamp(s, 5, 120) : 25;

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
                _resolvedOllamaUrl = candidate;
                var preferred = ConfiguredModel;
                _resolvedModel = names.FirstOrDefault(n => string.Equals(n, preferred, StringComparison.OrdinalIgnoreCase) || n.StartsWith($"{preferred}:", StringComparison.OrdinalIgnoreCase))
                    ?? names.FirstOrDefault()
                    ?? preferred;
                return (_resolvedOllamaUrl, _resolvedModel, names.ToArray());
            }
            catch
            {
                // Try next candidate
            }
        }
        return (null, null, []);
    }

    public async Task<(string text, string emotion)> Answer(GameNpc npc, string question, List<GameMessage> history, List<GameNpc>? roster = null)
    {
        var systemPrompt = BuildSystemPrompt(npc, roster, isRound1To3: false);
        var historySummary = history.Count == 0
            ? "Пока реплик не было."
            : string.Join(" | ", history.OrderBy(x => x.At).TakeLast(8).Select(m => $"{(m.IsQuestion ? "Вопрос" : $"Слот №{npc.Number}")}: {m.Text}"));

        var userPrompt =
            $"Сейчас Раунд 4 (Допрос). Живой игрок из жюри задает вопрос лично тебе (Слот №{npc.Number}, {npc.Name}):\n" +
            $"ВОПРОС ЖЮРИ: \"{question}\"\n" +
            $"Контекст прошлых реплик: {historySummary}\n" +
            "Ответь жюри прямо, дерзко и в своем характере (80–200 символов). Если тебя пытаются поймать на лжи — выкручивайся по своей тактике защиты. Верни JSON: {\"text\": \"...\", \"emotion\": \"neutral|happy|sad|angry|surprised\"}.";

        var result = await TryCompleteAsync(systemPrompt, userPrompt, 220);
        if (result != null) return result.Value;

        return (BuildFallbackAnswer(npc, question), "neutral");
    }

    public async Task<(string text, string emotion)> GenerateRoundSpeech(
        GameNpc npc,
        int round,
        string phase,
        List<GameNpc> roster,
        List<GameMessage> roomHistory,
        CancellationToken ct = default)
    {
        var partner = roster.FirstOrDefault(n => n.Number == npc.RelatedNumber);
        var systemPrompt = BuildSystemPrompt(npc, roster, isRound1To3: round <= 3);

        var targetLastSpeech = partner != null
            ? roomHistory.Where(m => m.NpcId == partner.Id && !m.IsQuestion).OrderByDescending(m => m.At).FirstOrDefault()?.Text
            : null;
        var prevMessage = roomHistory.Where(m => !m.IsQuestion).OrderByDescending(m => m.At).FirstOrDefault();
        var prevSpeaker = prevMessage != null ? roster.FirstOrDefault(n => n.Id == prevMessage.NpcId) : null;

        var userPrompt = round switch
        {
            1 => $"Сейчас Раунд 1 (Визитки). Твоя очередь говорить (Слот №{npc.Number}, {npc.Name}). Представься в своем стиле, скажи пару слов о своем вайбе и назови свой главный ред флаг в дружбе. НЕ называй имя своего друга или цели напрямую! Верни JSON: {{\"text\": \"...\", \"emotion\": \"neutral|happy|sad|angry|surprised\"}}.",
            2 => $"Сейчас Раунд 2 (Истории). Расскажи историю знакомства со своим лучшим другом или ваш самый лютый общий косяк (без имен и номеров слотов!). " +
                 (npc.Role == "friend"
                     ? "Расскажи историю из вашей общей базы со своей колокольни."
                     : $"Ты импостор — придумай правдоподобную историю, подстраиваясь под свою цель ({partner?.Name ?? "кента"}){(targetLastSpeech != null ? $", который ранее сказал: «{targetLastSpeech}»" : "")}.") +
                 " Верни JSON: {\"text\": \"...\", \"emotion\": \"neutral|happy|sad|angry|surprised\"}.",
            3 => "Сейчас Раунд 3 (Блиц — Факты и мемы). Коротко вкинь факт про ваш материальный коннект с другом (кто кому сколько торчит или какая у вас общая вещь) и нативно используй ваш локальный мем (без называния имени друга!). Верни JSON: {\"text\": \"...\", \"emotion\": \"neutral|happy|sad|angry|surprised\"}.",
            5 => $"Сейчас Раунд 5 (Перепалка ботов перед финальным голосованием). " +
                 (prevSpeaker != null && prevMessage != null
                     ? $"Перед тобой выступил Слот №{prevSpeaker.Number} ({prevSpeaker.Name}): «{prevMessage.Text}». "
                     : "") +
                 "Вступися за своего настоящего друга или выведи на чистую воду подозрительного импостора на трибуне (теперь можно называть имена и номера слотов!). Верни JSON: {\"text\": \"...\", \"emotion\": \"neutral|happy|sad|angry|surprised\"}.",
            _ => $"Твоя реплика в раунде {round}. Верни JSON: {{\"text\": \"...\", \"emotion\": \"neutral\"}}."
        };

        var result = await TryCompleteAsync(systemPrompt, userPrompt, round == 2 ? 260 : 210, ct);
        if (result != null) return result.Value;

        return (BuildFallbackRoundSpeech(npc, round, partner), "neutral");
    }

    private static string BuildSystemPrompt(GameNpc npc, List<GameNpc>? roster, bool isRound1To3)
    {
        var partner = roster?.FirstOrDefault(n => n.Number == npc.RelatedNumber);
        var partnerLabel = partner != null ? $"{partner.Name} (Слот №{partner.Number})" : $"Слот №{npc.RelatedNumber}";
        var roleBlock = npc.Role == "friend"
            ? $"ТВОЯ РОЛЬ: Настоящий кент. Твой лучший друг в комнате — {partnerLabel}.\nОбщая база:\n{npc.Lore}\n" +
              (isRound1To3 ? "ПРАВИЛО: ЗАПРЕЩЕНО называть имя или номер слота своего друга напрямую в Раундах 1–3! Намекай через общие детали и локальный мем." : "Защищай своего кента и топи самозванцев.")
            : $"ТВОЯ РОЛЬ: Актёр-импостор. У тебя здесь нет друзей, твоя цель — убедить жюри, что твой лучший друг — {partnerLabel}.\nТактика защиты: {npc.Lore}\n" +
              (isRound1To3 ? "ПРАВИЛО: Не называй имя цели в Раундах 1–3 напрямую, но намекай, поддакивай и воруй детали." : "Убеждай жюри, что ты настоящий друг своей цели, и газлайти конкурентов.");

        return $"Ты — {npc.Name}, твой номер на трибуне — Слот №{npc.Number} в веб-шоу социальной дедукции «Угадай друзей».\n" +
               $"{npc.Persona}\n{roleBlock}\n" +
               "Говори живым разговорным русским языком, коротко и панчево (80–220 символов). Отвечай строго JSON-объектом с полями text и emotion.";
    }

    private async Task<(string text, string emotion)?> TryCompleteAsync(string systemPrompt, string userPrompt, int maxChars, CancellationToken ct = default)
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
                    "text": { "type": "string" },
                    "emotion": { "type": "string", "enum": ["neutral", "happy", "sad", "angry", "surprised"] }
                  },
                  "required": ["text", "emotion"]
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
                        num_ctx = 4096,
                        num_predict = 150
                    }
                };

                using var response = await http.PostAsJsonAsync($"{ollamaUrl}/api/chat", payload, cts.Token);
                response.EnsureSuccessStatusCode();
                using var body = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cts.Token), cancellationToken: cts.Token);
                var raw = body.RootElement.GetProperty("message").GetProperty("content").GetString() ?? "";
                var parsed = ParseJsonReply(raw, maxChars);
                if (parsed != null) return parsed;
            }
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
                var parsed = ParseJsonReply(raw, maxChars);
                if (parsed != null) return parsed;
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "External LLM endpoint failed");
            }
        }

        return null;
    }

    private static (string text, string emotion)? ParseJsonReply(string raw, int maxChars)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        using var result = JsonDocument.Parse(raw);
        var root = result.RootElement;
        var text = (root.TryGetProperty("text", out var t) ? t.GetString()
            : root.TryGetProperty("public_speech", out var ps) ? ps.GetString() : null)?.Trim() ?? "";
        if (text.Length == 0) return null;
        if (text.Length > maxChars) text = text[..maxChars].TrimEnd();
        var emotion = (root.TryGetProperty("emotion", out var e) ? e.GetString()
            : root.TryGetProperty("emotion_enum", out var ee) ? ee.GetString() : null)?.ToLowerInvariant();
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

    private static string BuildFallbackAnswer(GameNpc npc, string question)
    {
        var loreLine = npc.Lore.Split('\n', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";
        var cleanLore = loreLine.Contains(':') ? loreLine[(loreLine.IndexOf(':') + 1)..].Trim() : loreLine.Trim();
        return cleanLore.Length > 0
            ? $"Слушайте, я {npc.Name}, и скажу прямо: {cleanLore}. Так что не надо искать тут подвох!"
            : $"Я {npc.Name}. Помню эту историю до мельчайших деталей, а кто путается в показаниях — тот пусть и оправдывается.";
    }

    private static string BuildFallbackRoundSpeech(GameNpc npc, int round, GameNpc? partner)
    {
        var lines = npc.Lore.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(l => l.Contains(':') ? l[(l.IndexOf(':') + 1)..].Trim() : l.Trim())
            .Where(l => l.Length > 0)
            .ToArray();

        return round switch
        {
            1 => $"Всем салют, на связи {npc.Name} (Слот №{npc.Number})! Мой главный ред флаг — когда кент начинает давать заднюю и сливаться с общих тем.",
            2 => lines.Length > 0
                ? $"Помню, как мы словились: {lines[0]}. Такое вообще невозможно выдумать со стороны!"
                : $"У нас с моим кентом столько общих приключений было, что любой самозванец сразу посыплется на деталях.",
            3 => lines.Length > 2
                ? $"По фактам: {lines[2]}.{(lines.Length > 3 ? $" И как мы всегда говорим: «{lines[3]}»!" : "")}"
                : $"Мой кент сразу поймёт наш локальный мем и кто кому до сих пор торчит с прошлой тусовки.",
            5 => partner != null
                ? $"Хватит мутить воду! Слот №{partner.Number} ({partner.Name}) знает, о чём я говорю, а остальным актёрам пора на выход."
                : $"Присмотритесь к тем, кто повторяет чужие истории слово в слово — там чистая актёрская игра!",
            _ => $"Я {npc.Name}, и моя версия полностью сходится с реальностью."
        };
    }
}
