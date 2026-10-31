using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;

namespace Backend;

public sealed partial class GameHub
{
    private async Task BoardChange(string op, string requestId, Func<BoardData, bool> change)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            if (!ValidRequestId(requestId)) { await BoardReject(op, "INVALID", requestId); return; }
            if (Seen(me, op, requestId))
            {
                await Clients.Caller.SendAsync("BoardSnapshot", new { board = JsonData.Read<BoardData>(me.BoardJson), requestId });
                return;
            }
            var session = await db.Sessions.SingleAsync();
            if (session.Phase != "playing") { await BoardReject(op, "WRONG_PHASE", requestId); return; }
            var board = JsonData.Read<BoardData>(me.BoardJson);
            if (!change(board)) { await BoardReject(op, "INVALID", requestId); return; }
            me.BoardJson = JsonData.Write(board); Remember(me, op, requestId); await db.SaveChangesAsync();
            await Clients.Caller.SendAsync("BoardSnapshot", new { board, requestId });
        }
        finally { gate.Lock.Release(); }
    }

    private Task BoardReject(string op, string code, string requestId) =>
        Clients.Caller.SendAsync("BoardReject", new { op, code, message = "Изменение доски отклонено.", requestId });

    private static bool ValidNpc(string? id) => id != null && Enumerable.Range(1, 10).Any(n => id == $"npc-{n}");
    private static bool Locked(BoardData b, string id) => b.Locks.Keys.Any(key => key.Split(':').Contains(id));
    private static bool Used(BoardData b, string id) => b.Pairs.Any(pair => pair.Contains(id)) || b.Liars.Contains(id);

    public Task PairNpcs(PairRequest r) => BoardChange("PairNpcs", r.RequestId, b =>
    {
        if (!ValidNpc(r.A) || !ValidNpc(r.B) || r.A == r.B || Used(b, r.A) || Used(b, r.B) || b.Pairs.Count >= 3) return false;
        b.Pairs.Add([r.A, r.B]); return true;
    });

    public Task UnpairNpcs(PairRequest r) => BoardChange("UnpairNpcs", r.RequestId, b =>
    {
        var pair = b.Pairs.FirstOrDefault(p => p.Length == 2 && GameLogic.PairKey(p[0], p[1]) == GameLogic.PairKey(r.A, r.B));
        if (pair == null || Locked(b, r.A) || Locked(b, r.B)) return false;
        b.Pairs.Remove(pair); return true;
    });

    public Task MarkLiar(NpcRequest r) => BoardChange("MarkLiar", r.RequestId, b =>
    {
        if (!ValidNpc(r.Npc) || Used(b, r.Npc) || b.Liars.Count >= 4) return false;
        b.Liars.Add(r.Npc); return true;
    });

    public Task UnmarkLiar(NpcRequest r) => BoardChange("UnmarkLiar", r.RequestId, b => b.Liars.Remove(r.Npc));

    public Task SaveNote(NoteRequest r) => BoardChange("SaveNote", r.RequestId, b =>
    {
        if (!ValidNpc(r.Npc) || r.Text == null || r.Text.Length > 200) return false;
        b.Notes[r.Npc] = r.Text; return true;
    });

    public async Task SubmitPair(SubmitRequest r)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized(); if (me == null) return;
            if (r == null || !ValidRequestId(r.RequestId)) { await BoardReject("SubmitPair", "INVALID", r?.RequestId ?? ""); return; }
            if (Seen(me, "SubmitPair", r.RequestId))
            {
                var old = JsonData.Read<BoardData>(me.BoardJson);
                await Clients.Caller.SendAsync("BoardSnapshot", new { board = old, requestId = r.RequestId });
                await Clients.Caller.SendAsync("PairSubmitted", new { round = r.Round, pair = old.Submitted.GetValueOrDefault(r.Round) });
                return;
            }
            var session = await db.Sessions.SingleAsync();
            if (session.Phase != "playing" || session.RoundPhase != "choice" || session.Round != r.Round)
            { await BoardReject("SubmitPair", "WRONG_PHASE", r.RequestId); return; }
            var board = JsonData.Read<BoardData>(me.BoardJson);
            if (board.Submitted.ContainsKey(r.Round)) { await BoardReject("SubmitPair", "ALREADY_SUBMITTED", r.RequestId); return; }
            string[]? pair = null;
            if (!r.Skip)
            {
                if (!ValidNpc(r.A) || !ValidNpc(r.B) || r.A == r.B || Locked(board, r.A!) || Locked(board, r.B!) ||
                    !board.Pairs.Any(p => p.Length == 2 && GameLogic.PairKey(p[0], p[1]) == GameLogic.PairKey(r.A!, r.B!)))
                { await BoardReject("SubmitPair", "INVALID", r.RequestId); return; }
                pair = [r.A!, r.B!]; board.Locks[GameLogic.PairKey(r.A!, r.B!)] = r.Round;
            }
            board.Submitted[r.Round] = pair; me.BoardJson = JsonData.Write(board); Remember(me, "SubmitPair", r.RequestId);
            db.Choices.Add(new PairChoice { PlayerId = me.Id, Round = r.Round, A = pair?[0], B = pair?[1] });
            await db.SaveChangesAsync();
            await Clients.Caller.SendAsync("BoardSnapshot", new { board, requestId = r.RequestId });
            await Clients.Caller.SendAsync("PairSubmitted", new { round = r.Round, pair });
        }
        finally { gate.Lock.Release(); }
    }

}
