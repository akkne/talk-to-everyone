namespace Backend;

/// <summary>Appends accepted public utterances in game order.</summary>
public static class NpcConversationLog
{
    /// <summary>Stages an event together with its visible message while the game lock is held.</summary>
    public static NpcConversationEvent Append(GameDb db, GameSession session, string text, string? speakerNpcId,
        string? targetNpcId = null, string? playerId = null, bool isQuestion = false)
    {
        var entry = new NpcConversationEvent
        {
            SessionId = session.Id,
            GameId = session.GameId,
            Sequence = ++session.NextDialogueSequence,
            Round = session.Round,
            Phase = session.RoundPhase,
            IsQuestion = isQuestion,
            SpeakerNpcId = speakerNpcId,
            TargetNpcId = targetNpcId,
            PlayerId = playerId,
            Text = text,
            CreatedAt = JsonData.Now
        };
        db.ConversationEvents.Add(entry);
        return entry;
    }
}
