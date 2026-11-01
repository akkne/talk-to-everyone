namespace Backend;

/// <summary>
/// Dependency injection registration extensions for session telemetry, host pause controls, and voice chat.
/// </summary>
public static class SessionControlServiceCollectionExtensions
{
    /// <summary>
    /// Registers participant activity catalog, telemetry registry, session pause gate, and voice room coordinator services.
    /// </summary>
    /// <param name="services">Service collection to configure.</param>
    /// <returns>The configured service collection.</returns>
    public static IServiceCollection AddSessionControls(this IServiceCollection services)
    {
        services.AddSingleton<IPlayerActivityCatalog, PlayerActivityCatalog>();
        services.AddSingleton<IParticipantTelemetryRegistry, ParticipantTelemetryRegistry>();
        services.AddSingleton<ISessionPauseGate, SessionPauseGate>();
        services.AddSingleton<IVoiceRoomCoordinator, VoiceRoomCoordinator>();
        return services;
    }
}
