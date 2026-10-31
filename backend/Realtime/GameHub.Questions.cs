using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;

namespace Backend;

public sealed partial class GameHub
{
    public async Task AskQuestion(QuestionRequest r)
    {
        GamePlayer? me; GameNpc? npc;
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
            var session = await db.Sessions.SingleAsync();
            var questions = JsonData.Read<QuestionData>(me.QuestionsJson);
            var code = session.Phase != "playing" || session.Round != 4 || session.RoundPhase != "interrogation" ? "WRONG_PHASE"
                : string.IsNullOrWhiteSpace(r.Text) || r.Text.Length > 300 ? "EMPTY"
                : questions.Pending || questions.Remaining == 0 ? "LIMIT"
                : questions.AskedTo.Contains(r.TargetNpc) ? "SAME_NPC" : null;
            npc = await db.Npcs.SingleOrDefaultAsync(n => n.Id == r.TargetNpc);
            if (npc == null || JsonData.Read<VotingData>(session.VotingJson).Eliminated.Contains(r.TargetNpc)) code = "EMPTY";
            if (code != null)
            { await Clients.Caller.SendAsync("QuestionReject", new { requestId = r.RequestId, code, message = "Вопрос сейчас недоступен." }); return; }
            questions.Remaining--; questions.AskedTo.Add(r.TargetNpc); questions.Pending = true;
            me.QuestionsJson = JsonData.Write(questions); Remember(me, "AskQuestion", r.RequestId);
            db.Messages.Add(new GameMessage { PlayerId = me.Id, NpcId = npc!.Id, Text = r.Text.Trim(), InReplyTo = r.RequestId, IsQuestion = true, At = JsonData.Now });
            await db.SaveChangesAsync();
            await Clients.Caller.SendAsync("QuestionOk", new { requestId = r.RequestId, questions });
            await Clients.All.SendAsync("NpcThinking", new { npc = npc.Id, questionId = r.RequestId });
        }
        finally { gate.Lock.Release(); }

        string answer; string emotion;
        try
        {
            await gate.LlmLock.WaitAsync();
            try
            {
                var history = await db.Messages.AsNoTracking().Where(m => m.NpcId == npc!.Id && m.InReplyTo != r.RequestId).OrderByDescending(m => m.At).Take(8).ToListAsync();
                (answer, emotion) = await llm.Answer(npc!, r.Text, history);
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
                if ((await db.Sessions.AsNoTracking().SingleAsync()).RoundPhase == "interrogation")
                { questions.Remaining++; questions.AskedTo.Remove(r.TargetNpc); }
                me.QuestionsJson = JsonData.Write(questions);
                var processed = JsonData.Read<List<string>>(me.ProcessedJson);
                processed.Remove($"AskQuestion:{r.RequestId}");
                me.ProcessedJson = JsonData.Write(processed);
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
            var current = await db.Sessions.AsNoTracking().SingleAsync();
            if (JsonData.Read<VotingData>(current.VotingJson).Eliminated.Contains(npc!.Id))
            {
                await db.SaveChangesAsync();
                await Clients.Caller.SendAsync("QuestionState", new { questions });
                return;
            }
            var line = new GameMessage { PlayerId = me.Id, NpcId = npc!.Id, Text = answer, Emotion = emotion, InReplyTo = r.RequestId, At = JsonData.Now };
            db.Messages.Add(line); await db.SaveChangesAsync();
            await Clients.Caller.SendAsync("QuestionState", new { questions });
            await Clients.All.SendAsync("NpcSay", new { id = line.Id, npc = line.NpcId, text = line.Text, inReplyTo = line.InReplyTo, emotion = line.Emotion, at = line.At });
        }
        finally { gate.Lock.Release(); }
    }
}
