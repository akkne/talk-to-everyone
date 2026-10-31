using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public static class GameSeed
{
    public static async Task EnsureAsync(GameDb db)
    {
        if (await db.Sessions.AnyAsync())
        {
            var session = await db.Sessions.SingleAsync();
            if (session.Phase == "playing" && session.RoundPhase == "choice" && JsonData.Read<VotingData>(session.VotingJson).Stage == 0)
            {
                session.RoundPhase = session.Round switch { 2 => "gossip", 3 => "blindspots", 4 => "interrogation", 5 => "debate", _ => "presentation" };
                session.EndsAt = JsonData.Now;
            }
            foreach (var player in await db.Players.ToListAsync())
            {
                player.Connected = false; player.ConnectionId = null;
                var questions = JsonData.Read<QuestionData>(player.QuestionsJson);
                if (!questions.Pending) continue;
                questions.Pending = false;
                questions.Remaining = Math.Min(2, questions.Remaining + 1);
                if (questions.AskedTo.Count > 0) questions.AskedTo.RemoveAt(questions.AskedTo.Count - 1);
                player.QuestionsJson = JsonData.Write(questions);
                var last = await db.Messages.Where(m => m.PlayerId == player.Id && m.IsQuestion)
                    .OrderByDescending(m => m.At).FirstOrDefaultAsync();
                if (last?.InReplyTo != null)
                {
                    var processed = JsonData.Read<List<string>>(player.ProcessedJson);
                    processed.Remove($"AskQuestion:{last.InReplyTo}");
                    player.ProcessedJson = JsonData.Write(processed);
                }
            }
            await db.SaveChangesAsync();
            return;
        }
        db.Sessions.Add(new GameSession());
        db.Npcs.AddRange(NpcDatabase.CreateRoster());
        await db.SaveChangesAsync();
    }
}
