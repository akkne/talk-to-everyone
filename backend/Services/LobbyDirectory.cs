using System.Security.Cryptography;
using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public static class LobbyDirectory
{
    private static readonly ConcurrentDictionary<string, long> pending = new();
    public static async Task<GameSession> Create(GameDb db, string ownerUserId)
    {
        var used = await db.Sessions.Select(s => s.RoomCode).ToListAsync();
        var free = Enumerable.Range(1111, 8889).Select(n => n.ToString()).Except(used).ToArray();
        if (free.Length == 0) throw new InvalidOperationException("Нет свободных кодов лобби.");
        var session = new GameSession { RoomCode = free[RandomNumberGenerator.GetInt32(free.Length)], OwnerUserId = ownerUserId };
        db.Sessions.Add(session);
        await db.SaveChangesAsync();
        pending[session.Id] = JsonData.Now;
        return session;
    }

    public static void Joined(string sessionId) => pending.TryRemove(sessionId, out _);

    public static async Task RemoveAbandoned(GameDb db)
    {
        foreach (var (sessionId, createdAt) in pending.ToArray())
        {
            if (JsonData.Now - createdAt < 30_000) continue;
            if (await db.Players.AnyAsync(p => p.SessionId == sessionId && p.Connected))
            {
                Joined(sessionId);
                continue;
            }
            await Delete(db, sessionId);
        }
    }

    public static async Task Delete(GameDb db, string sessionId)
    {
        pending.TryRemove(sessionId, out _);
        LocationScene.Drop(sessionId);
        await db.Messages.Where(x => x.SessionId == sessionId).ExecuteDeleteAsync();
        await db.ConversationEvents.Where(x => x.SessionId == sessionId).ExecuteDeleteAsync();
        await db.Choices.Where(x => x.SessionId == sessionId).ExecuteDeleteAsync();
        await db.Npcs.Where(x => x.SessionId == sessionId).ExecuteDeleteAsync();
        await db.Players.Where(x => x.SessionId == sessionId).ExecuteDeleteAsync();
        await db.Sessions.Where(x => x.Id == sessionId).ExecuteDeleteAsync();
    }
}

public sealed class LobbyCleanup(IServiceScopeFactory scopes, GameGate gate) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await gate.Lock.WaitAsync(stoppingToken);
            try
            {
                using var scope = scopes.CreateScope();
                await LobbyDirectory.RemoveAbandoned(scope.ServiceProvider.GetRequiredService<GameDb>());
            }
            finally { gate.Lock.Release(); }
        }
    }
}
