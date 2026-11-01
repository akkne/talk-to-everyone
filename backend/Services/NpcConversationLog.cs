namespace Backend;

/// <summary>Appends accepted public utterances in game order into Redis.</summary>
public static class NpcConversationLog
{
    /// <summary>Stages an event into Redis while the game lock is held.</summary>
    public static NpcConversationEvent Append(IGameRedisStore redisStore, GameSession session, string text, string? speakerNpcId,
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
        _ = redisStore.AddConversationEventAsync(session.Id, entry);
        return entry;
    }
}
