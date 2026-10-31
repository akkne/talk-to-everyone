using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public static class GameSeed
{
    private static readonly string[] Names = ["Лёша", "Мира", "Тимур", "Вика", "Соня", "Даня", "Рома", "Ника", "Кирилл", "Ася"];
    private static readonly string[] Colors = ["#d98b75", "#7db9bd", "#c39bd3", "#e2bd72", "#8fb78a", "#b0a4d4", "#d690aa", "#83a9d1", "#cfaa81", "#a9be7f"];
    private static readonly string[] Lore = [
        "Вы познакомились в пятом классе из-за сломанного геймпада; до сих пор спорите, кто его уронил.",
        "Вы вместе провалили школьный концерт и придумали шутку про микрофон без батареек.",
        "Вы однажды потерялись в походе и скрыли от родителей, что ориентировались по вывеске магазина."
    ];

    public static async Task EnsureAsync(GameDb db)
    {
        if (await db.Sessions.AnyAsync())
        {
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
        var order = Enumerable.Range(1, 10).OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).ToArray();
        var relations = new Dictionary<int, (string role, int other, string lore)>();
        for (var i = 0; i < 3; i++)
        {
            var a = order[i * 2]; var b = order[i * 2 + 1];
            relations[a] = ("friend", b, Lore[i]); relations[b] = ("friend", a, Lore[i]);
        }
        for (var i = 6; i < 10; i++)
        {
            var target = order[(i - 6) % 6];
            relations[order[i]] = ("actor", target, $"Ты изображаешь дружбу с NPC {target}. Ты знаешь только публичные сведения; придумай правдоподобную историю.");
        }
        for (var n = 1; n <= 10; n++)
        {
            var relation = relations[n];
            db.Npcs.Add(new GameNpc { Id = $"npc-{n}", Number = n, Name = Names[n - 1], Color = Colors[n - 1], Role = relation.role,
                RelatedNumber = relation.other, Persona = $"Ты {Names[n - 1]}, остроумный участник студии. Отвечай кратко по-русски.", Lore = relation.lore });
        }
        await db.SaveChangesAsync();
    }
}
