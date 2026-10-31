namespace Backend;

public sealed class GameGate
{
    public SemaphoreSlim Lock { get; } = new(1, 1);
    public SemaphoreSlim LlmLock { get; } = new(1, 1);
}

public sealed class GameSettings
{
    public Dictionary<string, string> Tokens { get; } = Parse(Environment.GetEnvironmentVariable("GAME_TOKENS"));
    public int RoundSeconds { get; } = Math.Clamp(int.TryParse(Environment.GetEnvironmentVariable("GAME_ROUND_SECONDS"), out var n) ? n : 120, 5, 3600);
    public int ChoiceSeconds { get; } = Math.Clamp(int.TryParse(Environment.GetEnvironmentVariable("GAME_CHOICE_SECONDS"), out var n) ? n : 30, 5, 600);

    private static Dictionary<string, string> Parse(string? raw)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var entry in (raw ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var parts = entry.Split(':', 2);
            if (parts.Length == 2 && parts[1].Length >= 16 && (parts[0] == "leader" || parts[0] == "judge"))
                result[parts[1]] = parts[0];
        }
        if (result.Count == 0 || !result.ContainsValue("leader"))
            throw new InvalidOperationException("Set GAME_TOKENS=leader:<16+ chars>,judge:<16+ chars>.");
        return result;
    }
}
