namespace Backend;

/// <summary>
/// Host command payload for pausing or resuming the active game session and NPC bots.
/// </summary>
/// <param name="RequestId">Unique client request identifier for idempotency.</param>
/// <param name="Paused">True to pause the game timer and bots; false to resume.</param>
public sealed record PauseRequest(string RequestId, bool Paused);
