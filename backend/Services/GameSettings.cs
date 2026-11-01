namespace Backend;

public sealed class GameGate
{
    public SemaphoreSlim Lock { get; } = new(1, 1);
    public SemaphoreSlim LlmLock { get; } = new(1, 1);
}

public sealed class GameSettings
{
    public int RoundSeconds { get; } = Math.Clamp(int.TryParse(Environment.GetEnvironmentVariable("GAME_ROUND_SECONDS"), out var n) ? n : 120, 5, 3600);
    public int ChoiceSeconds { get; } = Math.Clamp(int.TryParse(Environment.GetEnvironmentVariable("GAME_CHOICE_SECONDS"), out var n) ? n : 30, 5, 600);
}
