namespace Backend;

/// <summary>
/// Resolves normalized activity codes and human-readable Russian descriptions for participant actions.
/// </summary>
public interface IPlayerActivityCatalog
{
    /// <summary>
    /// Normalizes a raw client activity code or derives a fallback code from server-side player state.
    /// </summary>
    /// <param name="rawActivity">Raw activity code reported by the client.</param>
    /// <param name="player">Current persistent player entity.</param>
    /// <param name="session">Current game session state.</param>
    /// <returns>Normalized activity code.</returns>
    string NormalizeActivityCode(string? rawActivity, GamePlayer player, GameSession session);

    /// <summary>
    /// Converts a normalized activity code and player context into a localized action description.
    /// </summary>
    /// <param name="activityCode">Normalized activity code.</param>
    /// <param name="player">Current persistent player entity.</param>
    /// <param name="session">Current game session state.</param>
    /// <returns>Human-readable Russian action text.</returns>
    string DescribeAction(string activityCode, GamePlayer player, GameSession session);
}
