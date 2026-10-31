namespace Backend;

/// <summary>Persistent team ballot, retired participants and shared score.</summary>
public sealed class VotingData
{
    public int Stage { get; set; }
    public List<string> Electorate { get; set; } = [];
    public Dictionary<string, string[]> Ballots { get; set; } = [];
    public List<string[]> Candidates { get; set; } = [];
    public List<string> Eliminated { get; set; } = [];
    public int TeamScore { get; set; }
}

