using System.Text;
using Microsoft.Extensions.Options;
using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Формирует системные и раундовые промпты (R1–R5), а также промпт «Режиссёра реакций»
/// в точном соответствии со спецификацией шоу «Угадай кента».
/// </summary>
/// <param name="options">Настройки лимитов сводки истории комнаты.</param>
public sealed class NpcPromptComposer(
    IOptions<OllamaOptions> options) : INpcPromptComposer
{
    private const string TrueFriendRoleLabel = "Настоящий кент";
    private const string ActorRoleLabel = "Актёр-импостор";
    private const string DefaultMeetingStory = "словились в катке и с тех пор неразлейвода";
    private const string DefaultSecretFact = "однажды крупно накосячили на вписке";
    private const string DefaultMaterialLink = "торчит косарь за доставку";
    private const string DefaultInsideMeme = "кодовая фраза про сырный соус";
    private const string DefaultDefenseStrategy = "переводить всё в рофл и обвинять оппонента в потере памяти";
    private const string EmptySummaryPlaceholder = "Пока реплик не было.";
    private const string DefaultAvailableSlots = "1, 2, 3";
    private const int DefaultPreviousSlotId = 1;
    private const int DefaultActiveSlotId = 0;
    private const string ReactionsSystemInstruction =
        "Ты — системный режиссер реакций трибуны в шоу \"Угадай кента\". " +
        "Выбери ровно 3 ботов из списка, у которых фраза спикера вызовет самую острую реакцию, и верни JSON. " +
        "В текстах реакций запрещены мат, завуалированный мат, грубые оскорбления, унижения по личным признакам, угрозы и непристойные выражения.";

    private readonly OllamaOptions _settings = options.Value;

    /// <summary>
    /// Формирует единый системный промпт активного бота (шаблон для R1–R5, <c>messages[0]</c>).
    /// </summary>
    public string ComposeSpeakerSystemPrompt(NpcDialoguePrompt prompt)
    {
        NpcPersona speaker = prompt.Speaker;
        string roleType = speaker.Role == NpcRole.TrueFriend ? TrueFriendRoleLabel : ActorRoleLabel;
        string roleBlock = speaker.Role == NpcRole.TrueFriend ? BuildTrueFriendBlock(speaker) : BuildActorBlock(speaker);
        return $"""
            Ты — {speaker.BotName}, твой номер на трибуне — Слот №{speaker.SlotId}.
            Ты участвуешь в молодежном веб-шоу социальной дедукции "Угадай кента". Перед тобой сидит живое жюри, а вокруг тебя на двух ярусах — еще 9 участников (Слоты 1–10).

            ТВОЯ РОЛЬ: {roleType} (Варианты: "Настоящий кент" ИЛИ "Актёр-импостор").
            ТВОЙ ХАРАКТЕР И СТИЛЬ БАЗАРА: {speaker.BotVibeOrArchetype}

            СЕКРЕТНАЯ ИНФОРМАЦИЯ ТВОЕЙ РОЛИ:
            {roleBlock}

            ЖЕСТКИЕ ПРАВИЛА ГЕНЕРАЦИИ:
            1. Никакого официоза и нейросетевых штампов. Базарь живым разговорным русским языком с актуальным молодежным сленгом (кринж, база, ред флаг, тильт, газлайтинг, соевый, темка, слэй, прайм, отмена) в рамках своего архетипа.
            2. В реплике запрещены мат, завуалированный мат, грубые оскорбления, унижения по личным признакам, угрозы и непристойные выражения. Даже если собеседник выражается грубо, отвечай без такой лексики. Подкалывай персонажей без брани и унижения.
            3. Длина реплики (public_speech) — строго от 80 до 220 символов. Коротко, панчево, в разговорном стиле.
            4. Отвечай СТРОГО в формате валидного JSON по заданной схеме без markdown-оберток.
            """;
    }

    /// <summary>
    /// Формирует пользовательский промпт (<c>role: "user"</c>) по шаблону конкретного раунда (R1–R5).
    /// </summary>
    public string ComposeSpeakerUserPrompt(NpcDialoguePrompt prompt) =>
        prompt.Phase switch
        {
            RoundPhase.Presentation => BuildRound1Prompt(prompt.Speaker.SlotId),
            RoundPhase.Gossip => BuildRound2Prompt(prompt),
            RoundPhase.GossipCounterThrow => BuildRound2CounterThrowPrompt(prompt),
            RoundPhase.Blindspots => BuildRound3Prompt(),
            RoundPhase.Interrogation => BuildRound4Prompt(prompt),
            RoundPhase.BotCrossfire => BuildRound5Prompt(prompt),
            _ => BuildRound1Prompt(prompt.Speaker.SlotId)
        };

    /// <summary>
    /// Формирует системный промпт для «Режиссёра реакций».
    /// </summary>
    public string ComposeReactionsSystemPrompt() => ReactionsSystemInstruction;

    /// <summary>
    /// Формирует пользовательский промпт «Режиссёра реакций» (выбор 3 самых острых реакций из 9 ботов).
    /// </summary>
    public string ComposeReactionsUserPrompt(NpcReactionBatchPrompt prompt)
    {
        string compactRelations = string.Join("; ", prompt.Listeners.Select(item => item.CompactRelationLine));
        return $"""
            Ты — системный режиссер реакций трибуны в шоу "Угадай кента".
            Только что Слот №{prompt.ActiveSlotId} ({prompt.ActiveName}) произнес фразу: "{prompt.CurrentSpeech}".

            Состав остальных ботов на трибуне и их скрытые связи:
            {compactRelations}

            Выбери ровно 3 ботов из списка, у которых эта фраза вызовет самую острую реакцию (реальный друг говорящего, импостор говорящего, либо жертва обмана). Верни массив их мгновенных реакций в формате JSON.
            """;
    }

    /// <summary>
    /// Формирует секретный блок роли «Настоящий кент».
    /// </summary>
    private static string BuildTrueFriendBlock(NpcPersona speaker)
    {
        SharedLore? lore = speaker.TrueFriendLore;
        return $"""
            - Твой настоящий лучший друг в этой комнате — {speaker.TargetName} (Слот №{speaker.TargetSlotId}).
            - Как вы словились: {lore?.MeetingStory ?? DefaultMeetingStory}
            - Ваш общий жесткий косяк: {lore?.SecretFact ?? DefaultSecretFact}
            - Материальный коннект / долг: {lore?.MaterialLink ?? DefaultMaterialLink}
            - Ваш локальный мем / кодовая фраза: {lore?.InsideMeme ?? DefaultInsideMeme}
            - Правило пары: ЗАПРЕЩЕНО называть имя или номер слота своего друга напрямую в Раундах 1–3. Намекай на ваши истории, рофли над ним, используй ваш локальный мем. Если жюри или импостор гонит на твоего кента — жестко впрягайся за него. Если левый бот примазывается к тебе или к {speaker.TargetName} — попускай его по фактам.
            """;
    }

    /// <summary>
    /// Формирует секретный блок роли «Актёр-импостор».
    /// </summary>
    private static string BuildActorBlock(NpcPersona speaker) =>
        $"""
        - У тебя здесь НЕТ настоящих друзей. Твоя цель — заскамить жюри и убедить всех, что твой лучший кент — это {speaker.TargetName} (Слот №{speaker.TargetSlotId}).
        - Твоя тактика защиты при проколах: {speaker.DefenseStrategy ?? DefaultDefenseStrategy}
        - Правило импостора: Ты не знаешь реального прошлого {speaker.TargetName}. Внимательно читай лог того, что {speaker.TargetName} говорил в прошлых раундах, воруй детали на лету, поддакивай и лепи поверх свою легенду. Если {speaker.TargetName} тебя сливает и говорит, что не знает тебя — не выходи из роли! Газлайти его, используй свою тактику защиты.
        """;

    /// <summary>
    /// Инструкция Раунда 1: Визитка и ред флаг.
    /// </summary>
    private static string BuildRound1Prompt(int slotId) =>
        $"""
        Сейчас Раунд 1. Твоя очередь говорить (Слот №{slotId}).
        Представься в своем стиле, скажи пару слов о своем вайбе и назови свой главный ред флаг в дружбе (что ты никогда не простишь кенту). Не пали имя своего друга/цели.
        """;

    /// <summary>
    /// Инструкция Раунда 2: История косяка.
    /// </summary>
    private static string BuildRound2Prompt(NpcDialoguePrompt prompt) =>
        $"""
        Сейчас Раунд 2. Расскажи историю знакомства со своим лучшим другом или ваш самый лютый общий косяк (без имен!).
        Если ты Настоящий кент — расскажи историю из вашей общей базы со своей колокольни.
        Если ты Импостор — придумай правдоподобную историю на основе того, что твоя цель ({prompt.Speaker.TargetName}) говорила в Раунде 1: "{prompt.TargetRound1Speech ?? string.Empty}".
        """;

    /// <summary>
    /// Инструкция Раунда 2 (Доп. запрос): Встречный вброс соседа.
    /// </summary>
    private static string BuildRound2CounterThrowPrompt(NpcDialoguePrompt prompt) =>
        $"""
        Только что Слот №{prompt.ActiveSlotId ?? DefaultActiveSlotId} ({prompt.ActiveName ?? string.Empty}) рассказал историю: "{prompt.ActiveRound2Speech ?? string.Empty}".
        Кинь короткую встречную реплику с места (до 110 символов)!
        Если это твой реальный кент — подколи его деталью из вашей базы.
        Если это твоя цель (ты импостор) — уверенно подтверди историю и нагло примажься к ней.
        Если это импостор, который клеится к тебе или твоему кенту — жестко осади лжеца.
        """;

    /// <summary>
    /// Инструкция Раунда 3: Блиц — Долги и локальный мем.
    /// </summary>
    private static string BuildRound3Prompt() =>
        "Сейчас Раунд 3 (Блиц). Коротко вкинь факт про ваш материальный коннект с другом (кто кому сколько торчит, какая у вас общая вещь) и нативно используй ваш локальный мем.";

    /// <summary>
    /// Инструкция Раунда 4: Послотовый допрос от жюри.
    /// </summary>
    private string BuildRound4Prompt(NpcDialoguePrompt prompt) =>
        $"""
        Сейчас Раунд 4 (Допрос). Живой игрок из жюри задает вопрос лично тебе (Слот №{prompt.Speaker.SlotId}):
        ВОПРОС ЖЮРИ: "{prompt.JuryQuestionText ?? string.Empty}"
        Контекст прошлых реплик в комнате: {FormatRoomSummary(prompt.RecentHistory)}
        Ответь жюри прямо, дерзко и в своем характере (до 200 символов). Если тебя пытаются поймать на лжи или нестыковке — выкручивайся по своей тактике защиты.
        """;

    /// <summary>
    /// Инструкция Раунда 5: Цепная перепалка ИИ (эстафета).
    /// </summary>
    private static string BuildRound5Prompt(NpcDialoguePrompt prompt)
    {
        string availableSlots = prompt.AvailableSlotsList is { Count: > 0 }
            ? string.Join(", ", prompt.AvailableSlotsList)
            : DefaultAvailableSlots;
        int prevSlot = prompt.PreviousSlotId ?? DefaultPreviousSlotId;
        return $"""
            Сейчас Раунд 5 (Свободная перепалка ботов без участия жюри).
            Предыдущий ход сделал Слот №{prevSlot} ({prompt.PreviousName ?? string.Empty}), обратившись к тебе со словами: "{prompt.PreviousSpeech ?? string.Empty}".
            Список слотов, которые еще НЕ говорили в этом раунде: {availableSlots}.
            Ответь на предъяву Слота №{prevSlot} и переведи стрелки (задай вопрос или кинь наезд) на одного из участников из списка {availableSlots} (укажи его номер в поле addressing_slot).
            """;
    }

    /// <summary>
    /// Формирует краткую сводку последних реплик комнаты (<c>{{SHORT_ROOM_SUMMARY}}</c>).
    /// </summary>
    private string FormatRoomSummary(IReadOnlyList<ChatHistoryEntry> history)
    {
        if (history.Count == 0)
        {
            return EmptySummaryPlaceholder;
        }

        int skipCount = Math.Max(0, history.Count - _settings.MaxHistoryEntries);
        StringBuilder builder = new();
        foreach (ChatHistoryEntry entry in history.Skip(skipCount))
        {
            builder.Append($"[Р{entry.RoundNumber}] {entry.SpeakerLabel}: {entry.Text} ");
        }

        return builder.ToString().Trim();
    }
}
