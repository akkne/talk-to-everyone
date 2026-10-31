using Microsoft.Extensions.Options;
using TalkToEveryone.Api.Domain.Dialogue;

namespace TalkToEveryone.Api.Infrastructure.Ollama;

/// <summary>
/// Фоновый обработчик очереди генерации диалогов NPC (<see cref="IGameGenerationQueue"/>).
/// Выполняет конвейер «1 + 1»: сначала ход активного бота по Схеме А (<c>NpcSay</c>),
/// затем батч из 3 реакций трибуны по Схеме Б (<c>NpcReaction</c>).
/// </summary>
/// <param name="queue">Очередь задач генерации на базе <see cref="System.Threading.Channels"/>.</param>
/// <param name="dialogueModel">Модель генерации хода активного бота.</param>
/// <param name="reactionModel">Модель «Режиссёра реакций» трибуны.</param>
/// <param name="broadcaster">Публикатор событий в игровую сессию.</param>
/// <param name="options">Настройки таймаутов Ollama.</param>
/// <param name="logger">Структурированный логгер.</param>
public sealed class DialogueGenerationWorker(
    IGameGenerationQueue queue,
    INpcDialogueModel dialogueModel,
    INpcReactionModel reactionModel,
    IDialogueEventBroadcaster broadcaster,
    IOptions<OllamaOptions> options,
    ILogger<DialogueGenerationWorker> logger) : BackgroundService
{
    private const string TimeoutUserMessage = "Слот задумался слишком надолго. Попытка вопроса возвращена.";
    private const string ErrorUserMessage = "Не удалось получить ответ от слота. Попытка вопроса возвращена.";

    private readonly OllamaOptions _settings = options.Value;

    /// <summary>
    /// Непрерывно читает задачи из очереди и последовательно выполняет их на локальной модели.
    /// </summary>
    /// <param name="stoppingToken">Токен остановки приложения.</param>
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("DialogueGenerationWorker started and listening for tasks");
        while (!stoppingToken.IsCancellationRequested)
        {
            DialogueTask task = await queue.DequeueAsync(stoppingToken);
            await ProcessSingleTaskSafelyAsync(task, stoppingToken);
        }
    }

    /// <summary>
    /// Обрабатывает одну задачу генерации с контролем таймаута и перехватом ошибок инференса.
    /// </summary>
    private async Task ProcessSingleTaskSafelyAsync(DialogueTask task, CancellationToken stoppingToken)
    {
        using CancellationTokenSource timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(_settings.TimeoutSeconds));

        try
        {
            await ExecuteTwoStepPipelineAsync(task, timeoutCts.Token);
        }
        catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
        {
            await HandleTaskFailureAsync(task, DialogueFailureCode.LlmTimeout, TimeoutUserMessage, stoppingToken);
        }
        catch (Exception exception) when (!stoppingToken.IsCancellationRequested)
        {
            logger.LogError(exception, "Failed to process dialogue task {TaskId}", task.TaskId);
            await HandleTaskFailureAsync(task, DialogueFailureCode.LlmError, ErrorUserMessage, stoppingToken);
        }
    }

    /// <summary>
    /// Выполняет двухшаговый конвейер «1 + 1»: публикация хода спикера, затем батч из 3 реакций трибуны.
    /// </summary>
    private async Task ExecuteTwoStepPipelineAsync(DialogueTask task, CancellationToken cancellationToken)
    {
        NpcDialoguePrompt prompt = task.DialoguePrompt;
        await broadcaster.PublishNpcThinkingAsync(
            prompt.SessionId,
            prompt.Speaker.NpcId,
            task.TaskId,
            cancellationToken);

        NpcReply reply = await dialogueModel.GenerateReplyAsync(prompt, cancellationToken);
        await broadcaster.PublishNpcSayAsync(
            prompt.SessionId,
            prompt.Speaker.NpcId,
            reply,
            prompt.QuestionId,
            cancellationToken);

        if (task.GenerateEnsembleReactions && task.Listeners.Count > 0)
        {
            await GenerateAndPublishReactionsAsync(task, reply.PublicSpeech, cancellationToken);
        }
    }

    /// <summary>
    /// Запрашивает у «Режиссёра реакций» 3 самые острые реакции трибуны и публикует их в сессию.
    /// </summary>
    private async Task GenerateAndPublishReactionsAsync(
        DialogueTask task,
        string currentSpeech,
        CancellationToken cancellationToken)
    {
        NpcDialoguePrompt speakerPrompt = task.DialoguePrompt;
        NpcReactionBatchPrompt reactionPrompt = new(
            SessionId: speakerPrompt.SessionId,
            RoundNumber: speakerPrompt.RoundNumber,
            ActiveSlotId: speakerPrompt.Speaker.SlotId,
            ActiveName: speakerPrompt.Speaker.BotName,
            CurrentSpeech: currentSpeech,
            Listeners: task.Listeners);

        IReadOnlyList<NpcReactionResult> reactions = await reactionModel.GenerateReactionsAsync(
            reactionPrompt,
            cancellationToken);

        await broadcaster.PublishNpcReactionsAsync(speakerPrompt.SessionId, reactions, cancellationToken);
    }

    /// <summary>
    /// Переводит ошибку генерации в событие <c>QuestionFailed</c> для допроса раунда 4 или логирует сбой авто-хода.
    /// </summary>
    private async Task HandleTaskFailureAsync(
        DialogueTask task,
        DialogueFailureCode code,
        string userMessage,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(task.AskingPlayerId))
        {
            logger.LogWarning("Auto-round task {TaskId} failed with code {FailureCode}", task.TaskId, code);
            return;
        }

        await broadcaster.PublishQuestionFailedAsync(
            task.DialoguePrompt.SessionId,
            task.AskingPlayerId,
            task.TaskId,
            code,
            userMessage,
            cancellationToken);
    }
}
