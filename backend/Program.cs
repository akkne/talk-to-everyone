using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Claims;
using Backend;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Prometheus;

var builder = WebApplication.CreateBuilder(args);
if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")) &&
    string.IsNullOrWhiteSpace(builder.Configuration["urls"]))
{
    builder.WebHost.UseUrls("http://0.0.0.0:5000");
}

var connection = builder.Configuration["DATABASE_URL"]
    ?? builder.Configuration.GetConnectionString("Game")
    ?? builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Host=localhost;Port=5432;Database=talk_to_everyone;Username=postgres;Password=postgres";

builder.Services.AddDbContext<GameDb>(options => options.UseNpgsql(connection));
builder.Services.AddSignalR().AddJsonProtocol(options =>
    options.PayloadSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddSingleton<GameGate>();
builder.Services.AddSingleton<GameSettings>();
builder.Services.AddSingleton<MapCatalog>();
builder.Services.AddSingleton<SessionPauseRegistry>();
builder.Services.AddSingleton<JwtAuthService>();
builder.Services.AddSessionControls();
builder.Services.AddSingleton<RoundDirector>();
builder.Services.AddHttpClient<LlmClient>();
builder.Services.AddHostedService<RoundClock>();
builder.Services.AddHostedService<LobbyCleanup>();
builder.Services.AddHostedService<GameMetricsSnapshotService>();

var jwtService = new JwtAuthService(builder.Configuration);
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = JwtAuthService.Issuer,
            ValidateAudience = true,
            ValidAudience = JwtAuthService.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jwtService.SecurityKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2)
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/game"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build());

builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .SetIsOriginAllowed(_ => true)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

var app = builder.Build();
app.UseRouting();
app.UseCors();
app.UseHttpMetrics();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
app.MapMetrics().AllowAnonymous();
app.MapGet("/health/db", async (GameDb db, CancellationToken ct) =>
    await db.Database.CanConnectAsync(ct) ? Results.Ok(new { status = "ok" }) : Results.StatusCode(503)).AllowAnonymous();
app.MapGet("/api/game-info", GameRules.InfoAsync).AllowAnonymous();
app.MapGet("/api/maps", (MapCatalog maps) => Results.Ok(maps.List())).AllowAnonymous();
app.MapGet("/api/avatar/assets", async (GameDb db, CancellationToken ct) =>
{
    var assets = await db.AvatarAssets.AsNoTracking()
        .OrderBy(a => a.Category)
        .ThenBy(a => a.SortOrder)
        .ToListAsync(ct);
    return Results.Ok(assets);
}).AllowAnonymous();

app.MapGet("/api/lobbies", async (GameDb db) => Results.Ok(await db.Sessions.AsNoTracking()
    .Select(s => new { code = s.RoomCode, mapId = s.MapId, started = s.Phase == "playing", playerCount = db.Players.Count(p => p.SessionId == s.Id && p.Connected) })
    .Where(s => s.playerCount > 0).OrderBy(s => s.code).ToListAsync())).AllowAnonymous();
app.MapPost("/api/lobbies", async (ClaimsPrincipal principal, GameDb db, GameGate gate) =>
{
    var ownerId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? principal.FindFirst("sub")?.Value;
    if (string.IsNullOrWhiteSpace(ownerId)) return Results.Unauthorized();
    await gate.Lock.WaitAsync();
    try
    {
        var session = await LobbyDirectory.Create(db, ownerId);
        GameMetrics.LobbiesCreated.Inc();
        return Results.Ok(new { code = session.RoomCode });
    }
    finally { gate.Lock.Release(); }
}).RequireAuthorization();
app.MapGet("/health/ollama", async (LlmClient llm, CancellationToken ct) =>
    Results.Ok(await llm.GetOllamaStatusAsync(ct))).RequireAuthorization();

app.MapPost("/api/auth/register", async (RegisterRequest? req, GameDb db, JwtAuthService jwt, CancellationToken ct) =>
{
    var login = req?.Login?.Trim().ToLowerInvariant() ?? "";
    var password = req?.Password ?? "";
    var name = req?.Name?.Trim() ?? "";

    if (login.Length is < 3 or > 32)
    {
        return Results.BadRequest(new { code = "INVALID_LOGIN", message = "Логин должен содержать от 3 до 32 символов." });
    }
    if (password.Length is < 4 or > 128)
    {
        return Results.BadRequest(new { code = "INVALID_PASSWORD", message = "Пароль должен содержать минимум 4 символа." });
    }
    if (name.Length is < 1 or > 32)
    {
        return Results.BadRequest(new { code = "INVALID_NAME", message = "Имя должно содержать от 1 до 32 символов." });
    }

    var exists = await db.Users.AnyAsync(u => u.Login == login, ct);
    if (exists)
    {
        return Results.Conflict(new { code = "LOGIN_TAKEN", message = "Пользователь с таким логином уже существует." });
    }

    var user = new UserAccount
    {
        Login = login,
        PasswordHash = JwtAuthService.HashPassword(password),
        Name = name,
        AvatarJson = req?.Avatar != null ? JsonData.Write(req.Avatar) : JsonData.Write(new AvatarData()),
        CreatedAt = JsonData.Now
    };
    db.Users.Add(user);
    await db.SaveChangesAsync(ct);

    var token = jwt.CreateToken(user);
    return Results.Ok(new
    {
        token,
        user = new { id = user.Id, login = user.Login, name = user.Name, avatar = JsonData.Read<AvatarData>(user.AvatarJson) }
    });
}).AllowAnonymous();

app.MapPost("/api/auth/login", async (LoginRequest? req, GameDb db, JwtAuthService jwt, CancellationToken ct) =>
{
    var login = req?.Login?.Trim().ToLowerInvariant() ?? "";
    var password = req?.Password ?? "";

    if (string.IsNullOrWhiteSpace(login) || string.IsNullOrEmpty(password))
    {
        return Results.Json(new { code = "INVALID_CREDENTIALS", message = "Введите логин и пароль." }, statusCode: StatusCodes.Status401Unauthorized);
    }

    var user = await db.Users.SingleOrDefaultAsync(u => u.Login == login, ct);
    if (user == null || !JwtAuthService.VerifyPassword(password, user.PasswordHash))
    {
        return Results.Json(new { code = "INVALID_CREDENTIALS", message = "Неверный логин или пароль." }, statusCode: StatusCodes.Status401Unauthorized);
    }

    var token = jwt.CreateToken(user);
    return Results.Ok(new
    {
        token,
        user = new { id = user.Id, login = user.Login, name = user.Name, avatar = JsonData.Read<AvatarData>(user.AvatarJson) }
    });
}).AllowAnonymous();

app.MapGet("/api/auth/me", async (ClaimsPrincipal principal, GameDb db, CancellationToken ct) =>
{
    var userId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? principal.FindFirst("sub")?.Value;
    if (string.IsNullOrWhiteSpace(userId))
    {
        return Results.Unauthorized();
    }
    var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId, ct);
    if (user == null)
    {
        return Results.Unauthorized();
    }
    return Results.Ok(new { id = user.Id, login = user.Login, name = user.Name, avatar = JsonData.Read<AvatarData>(user.AvatarJson) });
}).RequireAuthorization();

app.MapPost("/api/user/avatar", async (AvatarData avatar, ClaimsPrincipal principal, GameDb db, IHubContext<GameHub> hub, GameGate gate, CancellationToken ct) =>
{
    var userId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? principal.FindFirst("sub")?.Value;
    if (string.IsNullOrWhiteSpace(userId)) return Results.Unauthorized();

    await gate.Lock.WaitAsync(ct);
    try
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user == null) return Results.Unauthorized();

        var json = JsonData.Write(avatar ?? new AvatarData());
        user.AvatarJson = json;

        var userHash = GameLogic.HashToken($"user:{user.Id}");
        var activePlayers = await db.Players.Where(p => p.TokenHash == userHash).ToListAsync(ct);
        foreach (var p in activePlayers)
        {
            p.AvatarJson = json;
        }
        await db.SaveChangesAsync(ct);

        var sessionIds = activePlayers.Select(p => p.SessionId).Distinct().ToList();
        foreach (var session in sessionIds)
        {
            var playersInSession = await db.Players.AsNoTracking().Where(p => p.SessionId == session).ToListAsync(ct);
            await hub.Clients.Group(session).SendAsync("PlayersTick", new { players = playersInSession.Select(GameLogic.PlayerView).ToArray(), serverTime = JsonData.Now }, ct);
            var s = await db.Sessions.SingleOrDefaultAsync(x => x.Id == session, ct);
            if (s != null)
            {
                await hub.Clients.Group(session).SendAsync("LobbyState", GameLogic.Lobby(playersInSession, s), ct);
            }
        }

        return Results.Ok(new { success = true, avatar = JsonData.Read<AvatarData>(json) });
    }
    finally { gate.Lock.Release(); }
}).RequireAuthorization();

app.MapGet("/api/host-info", async (HttpContext ctx, LlmClient llm, CancellationToken ct) =>
{
    var remoteIp = ctx.Connection.RemoteIpAddress;
    var isLoopback = remoteIp == null || IPAddress.IsLoopback(remoteIp);
    var forwardedHost = ctx.Request.Headers["X-Forwarded-Host"].FirstOrDefault() ?? ctx.Request.Host.Host;
    if (forwardedHost is "localhost" or "127.0.0.1" or "::1") isLoopback = true;

    var publicHost = Environment.GetEnvironmentVariable("CADDY_DOMAIN")?.Trim();
    var endpoints = !string.IsNullOrWhiteSpace(publicHost) && publicHost is not ("localhost" or "127.0.0.1")
        ? new object[] { new { ip = publicHost, label = "HTTPS", url = $"https://{publicHost}" } }
        : GetLanEndpoints();
    var ollama = await llm.GetOllamaStatusAsync(ct);

    return Results.Ok(new
    {
        isHostMachine = isLoopback,
        endpoints,
        ollama
    });
}).RequireAuthorization();

app.MapHub<GameHub>("/hubs/game").RequireAuthorization();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GameDb>();
    await db.Database.MigrateAsync();
    await GameSeed.EnsureAsync(db);
}

app.Run();

static object[] GetLanEndpoints()
{
    var list = new List<(int priority, string ip, string label, string url)>();
    try
    {
        foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback)
                continue;

            foreach (var ua in ni.GetIPProperties().UnicastAddresses)
            {
                if (ua.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                var ip = ua.Address.ToString();
                if (ip.StartsWith("127.") || ip.StartsWith("169.254.")) continue;

                var name = $"{ni.Name} {ni.Description}".ToLowerInvariant();
                string label;
                int priority;
                if (ip.StartsWith("26.") || name.Contains("radmin"))
                {
                    label = "Radmin VPN";
                    priority = 1;
                }
                else if (ip.StartsWith("25.") || name.Contains("hamachi"))
                {
                    label = "Hamachi";
                    priority = 2;
                }
                else
                {
                    label = "LAN";
                    priority = 3;
                }

                list.Add((priority, ip, label, $"http://{ip}:5173"));
            }
        }
    }
    catch
    {
        // Ignore network enumeration errors in restricted containers
    }

    return list
        .OrderBy(x => x.priority)
        .ThenBy(x => x.ip)
        .Select(x => (object)new { x.ip, x.label, x.url })
        .ToArray();
}
