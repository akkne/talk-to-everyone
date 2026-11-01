using Microsoft.EntityFrameworkCore;

namespace Backend;

public static class GameRules
{
    public static async Task<object> InfoAsync(GameDb db, GameSettings settings, CancellationToken ct = default)
    {
        var roster = NpcDatabase.CreateRoster();
        return new
        {
            npcCount = roster.Count,
            pairCount = roster.Count(n => n.Role == "friend") / 2,
            actorCount = roster.Count(n => n.Role == "actor"),
            rounds = GameLogic.RoundSpecs(settings.RoundSeconds),
            choiceRounds = new[] { 2, 4, 5 },
            questionLimit = 2,
            questionMaxLength = 300,
            noteMaxLength = 200,
            scoring = new
            {
                correct = new[] { new { round = 2, points = 300 }, new { round = 4, points = 200 }, new { round = 5, points = 100 } },
                mixed = -100,
                twoActors = -150
            }
        };
    }
}
