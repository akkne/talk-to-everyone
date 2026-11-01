using Microsoft.EntityFrameworkCore;

namespace Backend;

public static class GameSeed
{
    public static async Task EnsureAsync(GameDb db)
    {
        // A server restart drops every live connection; abandoned rooms must not reappear.
        foreach (var sessionId in await db.Sessions.Select(s => s.Id).ToListAsync())
            await LobbyDirectory.Delete(db, sessionId);
    }
}
