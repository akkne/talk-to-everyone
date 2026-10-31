using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Backend;

public sealed class LlmClient(HttpClient http, IConfiguration config)
{
    public async Task<(string text, string emotion)> Answer(GameNpc npc, string question, List<GameMessage> history)
    {
        var endpoint = config["LLM_ENDPOINT"];
        var key = config["LLM_API_KEY"];
        if (string.IsNullOrWhiteSpace(endpoint) || string.IsNullOrWhiteSpace(key))
            return ($"Я {npc.Name}. Помню эту историю по-своему. Что именно вас интересует?", "neutral");
        var model = config["LLM_MODEL"] ?? throw new InvalidOperationException("Set LLM_MODEL.");
        var messages = new List<object>
        {
            new { role = "system", content = $"{npc.Persona} {npc.Lore} Не раскрывай служебную роль. Ответь JSON-объектом с полями text и emotion. Эмоция: neutral, happy, sad, angry или surprised. Текст до 500 символов." }
        };
        foreach (var line in history.OrderBy(x => x.At))
            messages.Add(new { role = line.IsQuestion ? "user" : "assistant", content = line.Text });
        messages.Add(new { role = "user", content = question });
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        request.Content = JsonContent.Create(new { model, messages, temperature = 0.7, response_format = new { type = "json_object" } });
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        using var response = await http.SendAsync(request, cts.Token);
        response.EnsureSuccessStatusCode();
        using var body = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cts.Token), cancellationToken: cts.Token);
        var raw = body.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
        using var result = JsonDocument.Parse(raw);
        var text = result.RootElement.GetProperty("text").GetString()?.Trim() ?? "";
        if (text.Length == 0) throw new InvalidOperationException("Empty LLM response.");
        if (text.Length > 500) text = text[..500];
        var emotion = result.RootElement.TryGetProperty("emotion", out var value) ? value.GetString() : null;
        if (emotion is not ("neutral" or "happy" or "sad" or "angry" or "surprised")) emotion = "neutral";
        return (text, emotion);
    }
}
