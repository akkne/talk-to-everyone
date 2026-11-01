namespace Backend;

/// <summary>
/// Coordinates soft pause of the game timer and NPC bots controlled by the session host.
/// </summary>
public interface ISessionPauseGate
{
    /// <summary>
    /// Gets a value indicating whether the game and bots are currently paused.
    /// </summary>
    bool IsPaused { get; }

    /// <summary>
    /// Gets the remaining round duration in milliseconds preserved when the game was paused.
    /// </summary>
    long PausedRemainingMs { get; }

    /// <summary>
    /// Gets the identifier of the host player who paused the game, if currently paused.
    /// </summary>
    string? PausedByPlayerId { get; }

    /// <summary>
    /// Applies a pause or resume transition to the active game session.
    /// </summary>
    /// <param name="session">Current persistent game session entity.</param>
    /// <param name="paused">True to pause the game and bots; false to resume.</param>
    /// <param name="actorPlayerId">Identifier of the host performing the action.</param>
    /// <param name="nowMs">Current server timestamp in Unix milliseconds UTC.</param>
    /// <returns>Updated pause state view.</returns>
    GamePauseView ApplyPause(GameSession session, bool paused, string actorPlayerId, long nowMs);

    /// <summary>
    /// Builds the current pause state view for snapshots and round broadcasts.
    /// </summary>
    /// <param name="session">Current game session entity.</param>
    /// <param name="nowMs">Current server timestamp in Unix milliseconds UTC.</param>
    /// <returns>Current pause state view.</returns>
    GamePauseView CurrentView(GameSession session, long nowMs);

    /// <summary>
    /// Resets the pause state when starting a new game or returning to the lobby.
    /// </summary>
    void Reset();

    /// <summary>
    /// Suspends execution asynchronously while the session remains paused.
    /// </summary>
    /// <param name="ct">Cancellation token to abort waiting.</param>
    /// <returns>A task that completes once the session is unpaused.</returns>
    Task WaitWhilePausedAsync(CancellationToken ct = default);
}
