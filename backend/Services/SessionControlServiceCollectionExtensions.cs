namespace Backend;

/// <summary>
/// Dependency injection registration extensions for session telemetry and host pause controls.
/// </summary>
public static class SessionControlServiceCollectionExtensions
{
    /// <summary>
    /// Registers participant activity catalog, telemetry registry, and session pause gate services.
    /// </summary>
    /// <param name="services">Service collection to configure.</param>
    /// <returns>The configured service collection.</returns>
    public static IServiceCollection AddSessionControls(this IServiceCollection services)
    {
        services.AddSingleton<IPlayerActivityCatalog, PlayerActivityCatalog>();
        services.AddSingleton<IParticipantTelemetryRegistry, ParticipantTelemetryRegistry>();
        services.AddSingleton<ISessionPauseGate, SessionPauseGate>();
        return services;
    }
}
