namespace TalkToEveryone.Api.Domain.Dialogue;

/// <summary>
/// Элемент истории диалога партии, передаваемый в контекст модели для сохранения связности разговора.
/// </summary>
/// <param name="SpeakerLabel">Обозначение автора реплики (например, «Бот №2 (Макс)» или «Судья (Игрок)»).</param>
/// <param name="Text">Текст произнесённой реплики или вопроса.</param>
/// <param name="RoundNumber">Номер раунда, в котором прозвучала реплика.</param>
public sealed record ChatHistoryEntry(
    string SpeakerLabel,
    string Text,
    int RoundNumber);
