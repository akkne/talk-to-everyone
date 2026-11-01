namespace Backend;

/// <summary>A public utterance heard by NPCs during one game.</summary>
public sealed class NpcConversationEvent
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string SessionId { get; set; } = "";
    public string GameId { get; set; } = "";
    public long Sequence { get; set; }
    public int Round { get; set; }
    public string Phase { get; set; } = "";
    public bool IsQuestion { get; set; }
    public string? SpeakerNpcId { get; set; }
    public string? TargetNpcId { get; set; }
    public string? PlayerId { get; set; }
    public string Text { get; set; } = "";
    public long CreatedAt { get; set; }
}
