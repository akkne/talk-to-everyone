namespace Backend;

public sealed class UserAccount
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Login { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Name { get; set; } = "";
    public long CreatedAt { get; set; }
}

public sealed class GameSession
{
    public string Id { get; set; } = "main";
    public string Phase { get; set; } = "lobby";
    public int Round { get; set; }
    public string RoundPhase { get; set; } = "";
    public string VotingJson { get; set; } = "{}";
    public long EndsAt { get; set; }
}

public sealed class GamePlayer
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string SessionId { get; set; } = "main";
    public string TokenHash { get; set; } = "";
    public string Name { get; set; } = "";
    public string Role { get; set; } = "judge";
    public bool Connected { get; set; }
    public string? ConnectionId { get; set; }
    public string BoardJson { get; set; } = "{}";
    public string QuestionsJson { get; set; } = "{}";
    public string PoseJson { get; set; } = "{}";
    public string ProcessedJson { get; set; } = "[]";
    public int Score { get; set; }
}

public sealed class GameNpc
{
    public string Id { get; set; } = "";
    public string SessionId { get; set; } = "main";
    public int Number { get; set; }
    public string Name { get; set; } = "";
    public string Color { get; set; } = "";
    public string Role { get; set; } = "";
    public int RelatedNumber { get; set; }
    public string Persona { get; set; } = "";
    public string Lore { get; set; } = "";
}

public sealed class GameMessage
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string SessionId { get; set; } = "main";
    public string PlayerId { get; set; } = "";
    public string NpcId { get; set; } = "";
    public string Text { get; set; } = "";
    public string? Emotion { get; set; }
    public string? InReplyTo { get; set; }
    public bool IsQuestion { get; set; }
    public long At { get; set; }
}

public sealed class PairChoice
{
    public int Id { get; set; }
    public string SessionId { get; set; } = "main";
    public string PlayerId { get; set; } = "";
    public int Round { get; set; }
    public string? A { get; set; }
    public string? B { get; set; }
}

public sealed class BoardData
{
    public List<string[]> Pairs { get; set; } = [];
    public List<string> Liars { get; set; } = [];
    public Dictionary<string, int> Locks { get; set; } = [];
    public Dictionary<string, string> Notes { get; set; } = [];
    public Dictionary<int, string[]?> Submitted { get; set; } = [];
}

public sealed class QuestionData
{
    public int Remaining { get; set; } = 2;
    public List<string> AskedTo { get; set; } = [];
    public bool Pending { get; set; }
}

public sealed class PoseData
{
    public Vec3 Position { get; set; } = new(0, 0, 5);
    public double Yaw { get; set; }
    public double Pitch { get; set; }
    public double JumpOffset { get; set; }
    public string Mode { get; set; } = "walking";
    public string? SeatId { get; set; }
    public long Seq { get; set; }
    public long UpdatedAt { get; set; }
}

public record Vec3(double X, double Y, double Z);
