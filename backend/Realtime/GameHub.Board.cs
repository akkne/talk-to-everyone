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
            if (await redisStore.HasSeenCommandAsync(me.SessionId, me.Id, op, requestId))
            {
                var currentBoard = await redisStore.GetPlayerBoardAsync(me.SessionId, me.Id) ?? JsonData.Read<BoardData>(me.BoardJson);
                await Clients.Caller.SendAsync("BoardSnapshot", new { board = currentBoard, requestId });
                return;
            }
            var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
            if (session.Phase != "playing") { await BoardReject(op, "WRONG_PHASE", requestId); return; }
            var board = await redisStore.GetPlayerBoardAsync(me.SessionId, me.Id) ?? JsonData.Read<BoardData>(me.BoardJson);
            var npcs = await redisStore.GetNpcsAsync(me.SessionId);
            var active = npcs.Select(n => n.Id).ToList();
            var removed = JsonData.Read<VotingData>(session.VotingJson).Eliminated;
            active.RemoveAll(removed.Contains);
            if (!change(board) || board.Pairs.SelectMany(p => p).Concat(board.Liars).Concat(board.Notes.Keys).Any(id => !active.Contains(id))) { await BoardReject(op, "INVALID", requestId); return; }
            await redisStore.SetPlayerBoardAsync(me.SessionId, me.Id, board);
            me.BoardJson = JsonData.Write(board);
            await redisStore.RememberCommandAsync(me.SessionId, me.Id, op, requestId);
            await db.SaveChangesAsync();
            await Clients.Caller.SendAsync("BoardSnapshot", new { board, requestId });
        }
        finally { gate.Lock.Release(); }
    }

    private Task BoardReject(string op, string code, string requestId) =>
        Clients.Caller.SendAsync("BoardReject", new { op, code, message = "Изменение доски отклонено.", requestId });

    private static bool ValidNpc(string? id) => id != null && Enumerable.Range(1, 10).Any(n => id == $"npc-{n}" || id.StartsWith($"npc-{n}-", StringComparison.Ordinal));
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
            var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
            if (await redisStore.HasSeenCommandAsync(me.SessionId, me.Id, "SubmitPair", r.RequestId))
            { await Clients.Caller.SendAsync("VotingState", Voting.View(session, me.Id)); return; }
            if (pauseGate.IsPaused)
            {
                await BoardReject("SubmitPair", "GAME_PAUSED", r.RequestId);
                return;
            }
            var data = JsonData.Read<VotingData>(session.VotingJson);
            if (session.Phase != "playing" || session.RoundPhase != "choice" || session.Round != r.Round ||
                data.Stage != r.Stage || session.EndsAt <= JsonData.Now)
            { await BoardReject("SubmitPair", "WRONG_PHASE", r.RequestId); return; }
            if (!data.Electorate.Contains(me.Id) || data.Ballots.ContainsKey(me.Id) || r.Skip || r.A == null || r.B == null ||
                !data.Candidates.Any(p => Voting.Key(p) == GameLogic.PairKey(r.A, r.B)))
            { await BoardReject("SubmitPair", "INVALID", r.RequestId); return; }
            data.Ballots[me.Id] = new[] { r.A, r.B }.Order().ToArray();
            session.VotingJson = JsonData.Write(data);
            await redisStore.RememberCommandAsync(me.SessionId, me.Id, "SubmitPair", r.RequestId);
            await db.SaveChangesAsync();
            await Voting.Broadcast(db, Clients, session);
            await BroadcastParticipants(me.SessionId);
            await Voting.Advance(db, redisStore, Clients, session, settings);
        }
        finally { gate.Lock.Release(); }
    }
}
