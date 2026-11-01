using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;

namespace Backend;

public sealed partial class GameHub
{
    public async Task AskQuestion(QuestionRequest r)
    {
        GamePlayer? me; GameNpc? npc; string askerName = "";
        await gate.Lock.WaitAsync();
        try
        {
            me = await Authorized(); if (me == null) return;
            askerName = me.Name;
            if (r == null || !ValidRequestId(r.RequestId))
            { await Clients.Caller.SendAsync("QuestionReject", new { requestId = r?.RequestId, code = "EMPTY", message = "Неверный ID вопроса." }); return; }
            if (await redisStore.HasSeenCommandAsync(me.SessionId, me.Id, "AskQuestion", r.RequestId))
            {
                var q = await redisStore.GetPlayerQuestionsAsync(me.SessionId, me.Id) ?? JsonData.Read<QuestionData>(me.QuestionsJson);
                await Clients.Caller.SendAsync("QuestionOk", new { requestId = r.RequestId, questions = q });
                return;
            }
            if (pauseGate.IsPaused)
            {
                await Clients.Caller.SendAsync("QuestionReject", new { requestId = r.RequestId, code = "GAME_PAUSED", message = "Игра и боты поставлены на паузу хостом." });
                return;
            }
            var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
            var questions = await redisStore.GetPlayerQuestionsAsync(me.SessionId, me.Id) ?? JsonData.Read<QuestionData>(me.QuestionsJson);
            var code = session.Phase != "playing" || session.Round != 4 || session.RoundPhase != "interrogation" ? "WRONG_PHASE"
                : string.IsNullOrWhiteSpace(r.Text) || r.Text.Length > 300 ? "EMPTY"
                : questions.Pending || questions.Remaining == 0 ? "LIMIT"
                : questions.AskedTo.Contains(r.TargetNpc) ? "SAME_NPC" : null;
            npc = await redisStore.GetNpcAsync(me.SessionId, r.TargetNpc);
            if (npc == null || JsonData.Read<VotingData>(session.VotingJson).Eliminated.Contains(r.TargetNpc)) code = "EMPTY";
            if (code != null)
            { await Clients.Caller.SendAsync("QuestionReject", new { requestId = r.RequestId, code, message = "Вопрос сейчас недоступен." }); return; }
            questions.Remaining--; questions.AskedTo.Add(r.TargetNpc); questions.Pending = true;
            await redisStore.SetPlayerQuestionsAsync(me.SessionId, me.Id, questions);
            me.QuestionsJson = JsonData.Write(questions);
            await redisStore.RememberCommandAsync(me.SessionId, me.Id, "AskQuestion", r.RequestId);

            var qMsg = new GameMessage { SessionId = me.SessionId, PlayerId = me.Id, NpcId = npc!.Id, Text = r.Text.Trim(), InReplyTo = r.RequestId, IsQuestion = true, At = JsonData.Now };
            await redisStore.AddMessageAsync(me.SessionId, qMsg);
            var questionEvent = NpcConversationLog.Append(redisStore, session, r.Text.Trim(), null, npc.Id, me.Id, isQuestion: true);
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
                var allMessages = await redisStore.GetMessagesAsync(me!.SessionId);
                var history = allMessages.Where(m => m.NpcId == npc!.Id && m.InReplyTo != r.RequestId).OrderByDescending(m => m.At).Take(8).ToList();
                var roster = await redisStore.GetNpcsAsync(me!.SessionId);
                (answer, emotion) = await llm.Answer(npc!, r.Text, history, roster);
            }
            finally { gate.LlmLock.Release(); }
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "NPC answer failed for {NpcId}", npc!.Id);
            await gate.Lock.WaitAsync();
            try
            {
                var questions = await redisStore.GetPlayerQuestionsAsync(me!.SessionId, me!.Id) ?? JsonData.Read<QuestionData>(me!.QuestionsJson);
                questions.Pending = false;
                if ((await db.Sessions.AsNoTracking().SingleAsync(s => s.Id == me!.SessionId)).RoundPhase == "interrogation")
                { questions.Remaining++; questions.AskedTo.Remove(r.TargetNpc); }
                await redisStore.SetPlayerQuestionsAsync(me!.SessionId, me!.Id, questions);
                me!.QuestionsJson = JsonData.Write(questions);
                await redisStore.RemoveSeenCommandAsync(me!.SessionId, me!.Id, "AskQuestion", r.RequestId);
                await Clients.Caller.SendAsync("QuestionFailed", new { questionId = r.RequestId, code = "LLM_ERROR", message = "Ответ не получен.", questions });
            }
            finally { gate.Lock.Release(); }
            return;
        }

        await gate.Lock.WaitAsync();
        try
        {
            var questions = await redisStore.GetPlayerQuestionsAsync(me!.SessionId, me!.Id) ?? JsonData.Read<QuestionData>(me!.QuestionsJson);
            questions.Pending = false;
            await redisStore.SetPlayerQuestionsAsync(me!.SessionId, me!.Id, questions);
            me!.QuestionsJson = JsonData.Write(questions);
            var current = await db.Sessions.AsNoTracking().SingleAsync(s => s.Id == me!.SessionId);
            if (JsonData.Read<VotingData>(current.VotingJson).Eliminated.Contains(npc!.Id))
            {
                await Clients.Caller.SendAsync("QuestionState", new { questions });
                return;
            }
            var formattedText = $"[{askerName}: «{r.Text.Trim()}»] {answer}";
            if (formattedText.Length > 500) formattedText = formattedText[..500];
            var line = new GameMessage { SessionId = me!.SessionId, PlayerId = me!.Id, NpcId = npc!.Id, Text = formattedText, Emotion = emotion, InReplyTo = r.RequestId, At = JsonData.Now };
            await redisStore.AddMessageAsync(me!.SessionId, line);
            NpcConversationLog.Append(redisStore, current, answer, npc!.Id, null, me!.Id);
            await db.SaveChangesAsync();
            await Clients.Caller.SendAsync("QuestionState", new { questions });
            await Clients.Group(me!.SessionId).SendAsync("NpcSay", new { id = line.Id, npc = line.NpcId, text = line.Text, inReplyTo = line.InReplyTo, emotion = line.Emotion, at = line.At });
        }
        finally { gate.Lock.Release(); }
    }
}
