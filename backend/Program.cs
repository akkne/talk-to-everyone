using Backend;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration["DATABASE_URL"] ?? builder.Configuration.GetConnectionString("Game")
    ?? throw new InvalidOperationException("Set DATABASE_URL or ConnectionStrings__Game.");
var origins = (builder.Configuration["GAME_ORIGINS"] ?? "http://localhost:5173")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddDbContext<GameDb>(options => options.UseNpgsql(connection));
builder.Services.AddSignalR().AddJsonProtocol(options => options.PayloadSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddSingleton<GameGate>();
builder.Services.AddSingleton<GameSettings>();
builder.Services.AddHttpClient<LlmClient>();
builder.Services.AddHostedService<RoundClock>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(origins)
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
var app = builder.Build();
app.Use(async (context, next) =>
{
    var origin = context.Request.Headers.Origin.ToString();
    if (context.Request.Path.StartsWithSegments("/hubs/game") && origin.Length > 0 && !origins.Contains(origin, StringComparer.OrdinalIgnoreCase))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }
    await next();
});
app.UseCors();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/health/db", async (GameDb db, CancellationToken ct) =>
    await db.Database.CanConnectAsync(ct) ? Results.Ok(new { status = "ok" }) : Results.StatusCode(503));
app.MapHub<GameHub>("/hubs/game");
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GameDb>();
    await db.Database.MigrateAsync();
    await GameSeed.EnsureAsync(db);
}
app.Run();
