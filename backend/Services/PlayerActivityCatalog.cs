namespace Backend;

/// <summary>
/// Default catalog mapping participant activity codes and server poses into Russian descriptions.
/// </summary>
public sealed class PlayerActivityCatalog : IPlayerActivityCatalog
{
    /// <summary>Activity code when the participant is disconnected.</summary>
    public const string Offline = "offline";

    /// <summary>Activity code when the participant is waiting in the lobby.</summary>
    public const string Lobby = "lobby";

    /// <summary>Activity code when the participant has the Escape menu open.</summary>
    public const string EscapeMenu = "escape_menu";

    /// <summary>Activity code when the participant is choosing a pair during voting.</summary>
    public const string Voting = "voting";

    /// <summary>Activity code when the participant has the interrogation question dialog open or pending.</summary>
    public const string AskingQuestion = "asking_question";

    /// <summary>Activity code when the participant is inspecting the investigation board.</summary>
    public const string Board = "board";

    /// <summary>Activity code when the participant is listening to an NPC speaking.</summary>
    public const string Listening = "listening";

    /// <summary>Activity code when the participant is seated in a studio chair.</summary>
    public const string Seated = "seated";

    /// <summary>Activity code when the participant is walking around the studio.</summary>
    public const string Walking = "walking";

    /// <summary>Activity code when the participant is reviewing final results.</summary>
    public const string Reveal = "reveal";

    private static readonly HashSet<string> KnownCodes = new(StringComparer.Ordinal)
    {
        Offline,
        Lobby,
        EscapeMenu,
        Voting,
        AskingQuestion,
        Board,
        Listening,
        Seated,
        Walking,
        Reveal
    };

    /// <inheritdoc />
    public string NormalizeActivityCode(string? rawActivity, GamePlayer player, GameSession session)
    {
        if (!player.Connected)
        {
            return Offline;
        }

        if (session.Phase == "lobby")
        {
            return rawActivity == EscapeMenu ? EscapeMenu : Lobby;
        }

        if (session.Phase == "finished")
        {
            return rawActivity == EscapeMenu ? EscapeMenu : Reveal;
        }

        var trimmed = rawActivity?.Trim().ToLowerInvariant() ?? string.Empty;
        if (KnownCodes.Contains(trimmed) && trimmed is not (Offline or Lobby or Reveal))
        {
            return trimmed;
        }

        var questions = JsonData.Read<QuestionData>(player.QuestionsJson);
        if (questions.Pending)
        {
            return AskingQuestion;
        }

        if (session.RoundPhase == "choice")
        {
            return Voting;
        }

        var pose = JsonData.Read<PoseData>(player.PoseJson);
        return pose.Mode == "seated" ? Seated : Walking;
    }

    /// <inheritdoc />
    public string DescribeAction(string activityCode, GamePlayer player, GameSession session)
    {
        if (!player.Connected || activityCode == Offline)
        {
            return "Нет связи";
        }

        return activityCode switch
        {
            Lobby => "Ожидает в лобби",
            EscapeMenu => "Смотрит в меню",
            Voting => DescribeVoting(player, session),
            AskingQuestion => "Задает вопрос",
            Board => "Изучает доску",
            Listening => DescribeListening(player),
            Seated => "Сидит в кресле",
            Walking => "Ходит по студии",
            Reveal => "Смотрит итоги",
            _ => "В студии"
        };
    }

    private static string DescribeVoting(GamePlayer player, GameSession session)
    {
        var voting = JsonData.Read<VotingData>(session.VotingJson);
        return voting.Ballots.ContainsKey(player.Id)
            ? "Выбрал пару (ждет остальных)"
            : "Выбирает пару";
    }

    private static string DescribeListening(GamePlayer player)
    {
        var pose = JsonData.Read<PoseData>(player.PoseJson);
        return pose.Mode == "seated"
            ? "Сидит и слушает участника"
            : "Слушает участника";
    }
}
