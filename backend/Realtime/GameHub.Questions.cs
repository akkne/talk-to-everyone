using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;

namespace Backend;

public sealed partial class GameHub
{
    public async Task AskQuestion(QuestionRequest r)
    {
        GamePlayer? me; GameNpc? npc; string gameId; string questionEventId;
        await gate.Lock.WaitAsync();
        try
        {
            me = await Authorized(); if (me == null) return;
            if (r == null || !ValidRequestId(r.RequestId))
            { await Clients.Caller.SendAsync("QuestionReject", new { requestId = r?.RequestId, code = "EMPTY", message = "Неверный ID вопроса." }); return; }
            if (Seen(me, "AskQuestion", r.RequestId))
            {
                await Clients.Caller.SendAsync("QuestionOk", new { requestId = r.RequestId, questions = JsonData.Read<QuestionData>(me.QuestionsJson) });
                return;
            }
            if (pauseGate.IsPaused)
            {
                await Clients.Caller.SendAsync("QuestionReject", new { requestId = r.RequestId, code = "GAME_PAUSED", message = "Игра и боты поставлены на паузу хостом." });
                return;
            }
            var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
            gameId = session.GameId;
            var questions = JsonData.Read<QuestionData>(me.QuestionsJson);
            var code = session.Phase != "playing" || session.Round != 4 || session.RoundPhase != "interrogation" ? "WRONG_PHASE"
                : string.IsNullOrWhiteSpace(r.Text) || r.Text.Length > 300 ? "EMPTY"
                : questions.Pending || questions.Remaining == 0 ? "LIMIT"
                : questions.AskedTo.Contains(r.TargetNpc) ? "SAME_NPC" : null;
            npc = await db.Npcs.SingleOrDefaultAsync(n => n.SessionId == me.SessionId && n.Id == r.TargetNpc);
            if (npc == null || JsonData.Read<VotingData>(session.VotingJson).Eliminated.Contains(r.TargetNpc)) code = "EMPTY";
            if (code != null)
            { await Clients.Caller.SendAsync("QuestionReject", new { requestId = r.RequestId, code, message = "Вопрос сейчас недоступен." }); return; }
            questions.Remaining--; questions.AskedTo.Add(r.TargetNpc); questions.Pending = true;
            me.QuestionsJson = JsonData.Write(questions); Remember(me, "AskQuestion", r.RequestId);
            db.Messages.Add(new GameMessage { SessionId = me.SessionId, PlayerId = me.Id, NpcId = npc!.Id, Text = r.Text.Trim(), InReplyTo = r.RequestId, IsQuestion = true, At = JsonData.Now });
            questionEventId = NpcConversationLog.Append(db, session, r.Text.Trim(), null, npc.Id, me.Id, isQuestion: true).Id;
            await db.SaveChangesAsync();
            await Clients.Caller.SendAsync("QuestionOk", new { requestId = r.RequestId, questions });
            await Clients.Group(me.SessionId).SendAsync("NpcThinking", new { npc = npc.Id, questionId = r.RequestId });
            await BroadcastParticipants(me.SessionId);
        }
        finally { gate.Lock.Release(); }

        string answer; string emotion;
        try
        {
            await gate.LlmLock.WaitAsync();
            try
            {
                var history = await db.ConversationEvents.AsNoTracking().Where(e => e.GameId == gameId)
                    .OrderBy(e => e.Sequence).ToListAsync();
                var roster = await db.Npcs.AsNoTracking().Where(n => n.SessionId == me.SessionId).ToListAsync();
                (answer, emotion) = await llm.Answer(npc!, r.Text, [], roster, history);
            }
            finally { gate.LlmLock.Release(); }
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "NPC answer failed for {NpcId}", npc!.Id);
            await gate.Lock.WaitAsync();
            try
            {
                me = await db.Players.SingleAsync(p => p.Id == me!.Id);
                await db.Entry(me).ReloadAsync();
                var questions = JsonData.Read<QuestionData>(me.QuestionsJson);
                questions.Pending = false;
                if ((await db.Sessions.AsNoTracking().SingleAsync(s => s.Id == me.SessionId)).RoundPhase == "interrogation")
                { questions.Remaining++; questions.AskedTo.Remove(r.TargetNpc); }
                me.QuestionsJson = JsonData.Write(questions);
                var processed = JsonData.Read<List<string>>(me.ProcessedJson);
                processed.Remove($"AskQuestion:{r.RequestId}");
                me.ProcessedJson = JsonData.Write(processed);
                var failedQuestion = await db.Messages.SingleOrDefaultAsync(m => m.SessionId == me.SessionId && m.InReplyTo == r.RequestId && m.IsQuestion);
                if (failedQuestion != null) db.Messages.Remove(failedQuestion);
                var failedEvent = await db.ConversationEvents.FindAsync(questionEventId);
                if (failedEvent != null) db.ConversationEvents.Remove(failedEvent);
                await db.SaveChangesAsync();
                await Clients.Caller.SendAsync("QuestionFailed", new { questionId = r.RequestId, code = "LLM_ERROR", message = "Ответ не получен.", questions });
            }
            finally { gate.Lock.Release(); }
            return;
        }
        await gate.Lock.WaitAsync();
        try
        {
            me = await db.Players.SingleAsync(p => p.Id == me!.Id);
            await db.Entry(me).ReloadAsync();
            var questions = JsonData.Read<QuestionData>(me.QuestionsJson); questions.Pending = false;
            me.QuestionsJson = JsonData.Write(questions);
            var current = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
            await db.Entry(current).ReloadAsync();
            if (current.GameId != gameId || current.Phase != "playing" || current.Round != 4 ||
                JsonData.Read<VotingData>(current.VotingJson).Eliminated.Contains(npc!.Id))
            {
                await db.SaveChangesAsync();
                await Clients.Caller.SendAsync("QuestionState", new { questions });
                return;
            }
            var line = new GameMessage { SessionId = me.SessionId, PlayerId = me.Id, NpcId = npc!.Id, Text = answer, Emotion = emotion, InReplyTo = r.RequestId, At = JsonData.Now };
            db.Messages.Add(line);
            NpcConversationLog.Append(db, current, answer, npc.Id);
            await db.SaveChangesAsync();
            await Clients.Caller.SendAsync("QuestionState", new { questions });
            await Clients.Group(me.SessionId).SendAsync("NpcSay", new { id = line.Id, npc = line.NpcId, text = line.Text, inReplyTo = line.InReplyTo,
                questionText = r.Text.Trim(), questioner = me.Name, emotion = line.Emotion, at = line.At });
        }
        finally { gate.Lock.Release(); }
    }
}
