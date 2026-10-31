namespace Backend;

public sealed class GameGate
{
    public SemaphoreSlim Lock { get; } = new(1, 1);
    public SemaphoreSlim LlmLock { get; } = new(1, 1);
}

public sealed class GameSettings
{
    public string HostCode { get; } = Environment.GetEnvironmentVariable("GAME_HOST_CODE") ?? "host";
    public string RoomCode { get; } = Environment.GetEnvironmentVariable("GAME_ROOM_CODE") ?? "1234";
    public Dictionary<string, string> Tokens { get; }
    public int RoundSeconds { get; } = Math.Clamp(int.TryParse(Environment.GetEnvironmentVariable("GAME_ROUND_SECONDS"), out var n) ? n : 120, 5, 3600);
    public int ChoiceSeconds { get; } = Math.Clamp(int.TryParse(Environment.GetEnvironmentVariable("GAME_CHOICE_SECONDS"), out var n) ? n : 30, 5, 600);

    public GameSettings()
    {
        Tokens = Parse(Environment.GetEnvironmentVariable("GAME_TOKENS"), HostCode, RoomCode);
    }

    private static Dictionary<string, string> Parse(string? raw, string hostCode, string roomCode)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var entry in (raw ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var parts = entry.Split(':', 2);
            if (parts.Length == 2 && parts[1].Length >= 1 && (parts[0] == "leader" || parts[0] == "judge"))
                result[parts[1]] = parts[0];
        }
        result.TryAdd(hostCode, "leader");
        result.TryAdd(roomCode, "judge");
        result.TryAdd("main", "judge");
        return result;
    }

    public string PublicRoomCode => Tokens.FirstOrDefault(kv => kv.Value == "judge").Key ?? RoomCode;
    public string PublicHostCode => Tokens.FirstOrDefault(kv => kv.Value == "leader").Key ?? HostCode;
}
