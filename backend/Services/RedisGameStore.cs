using System.Collections.Concurrent;
using StackExchange.Redis;

namespace Backend;

public interface IGameRedisStore
{
    // NPCs
    Task SaveNpcsAsync(string sessionId, IEnumerable<GameNpc> npcs);
    Task<List<GameNpc>> GetNpcsAsync(string sessionId);
    Task<GameNpc?> GetNpcAsync(string sessionId, string npcId);
    Task DeleteNpcsAsync(string sessionId);

    // Conversation events
    Task AddConversationEventAsync(string sessionId, NpcConversationEvent ev);
    Task<List<NpcConversationEvent>> GetConversationEventsAsync(string sessionId, string? gameId = null);
    Task RemoveConversationEventAsync(string sessionId, string eventId);
    Task DeleteConversationEventsAsync(string sessionId);

    // Messages
    Task AddMessageAsync(string sessionId, GameMessage message);
    Task<List<GameMessage>> GetMessagesAsync(string sessionId);
    Task RemoveMessageAsync(string sessionId, string messageId);
    Task RemoveMessagesByNpcIdsAsync(string sessionId, IEnumerable<string> npcIds);
    Task DeleteMessagesAsync(string sessionId);

    // Choices
    Task SaveChoiceAsync(string sessionId, PairChoice choice);
    Task<List<PairChoice>> GetChoicesAsync(string sessionId);
    Task RemoveChoicesByNpcIdsAsync(string sessionId, IEnumerable<string> npcIds);
    Task DeleteChoicesAsync(string sessionId);

    // Movement / Player Poses (High-frequency object movement)
    Task SetPlayerPoseAsync(string sessionId, string playerId, PoseData pose);
    Task<PoseData?> GetPlayerPoseAsync(string sessionId, string playerId);
    Task<Dictionary<string, PoseData>> GetPlayerPosesAsync(string sessionId);
    Task ResetPosesAsync(string sessionId);

    // Gamification & dynamic runtime player states (Board, Questions, Idempotency)
    Task SetPlayerBoardAsync(string sessionId, string playerId, BoardData board);
    Task<BoardData?> GetPlayerBoardAsync(string sessionId, string playerId);
    Task SetPlayerQuestionsAsync(string sessionId, string playerId, QuestionData questions);
    Task<QuestionData?> GetPlayerQuestionsAsync(string sessionId, string playerId);
    Task<bool> HasSeenCommandAsync(string sessionId, string playerId, string op, string id);
    Task RememberCommandAsync(string sessionId, string playerId, string op, string id);
    Task RemoveSeenCommandAsync(string sessionId, string playerId, string op, string id);
    Task ClearSeenCommandsAsync(string sessionId, string playerId);

    // Full clear for session
    Task ClearSessionGameStateAsync(string sessionId);
}

public sealed class RedisGameStore : IGameRedisStore
{
    private readonly IConnectionMultiplexer? _redis;
    private readonly IDatabase? _db;

    // In-memory fallback if Redis is not configured or unavailable (e.g. unit tests)
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, GameNpc>> _memNpcs = new();
    private readonly ConcurrentDictionary<string, List<NpcConversationEvent>> _memEvents = new();
    private readonly ConcurrentDictionary<string, List<GameMessage>> _memMessages = new();
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, PairChoice>> _memChoices = new();
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, PoseData>> _memPoses = new();
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, BoardData>> _memBoards = new();
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, QuestionData>> _memQuestions = new();
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, HashSet<string>>> _memSeen = new();

    public RedisGameStore(IConnectionMultiplexer? redis = null)
    {
        _redis = redis;
        if (_redis != null && _redis.IsConnected)
        {
            try
            {
                _db = _redis.GetDatabase();
            }
            catch
            {
                _db = null;
            }
        }
    }

    private bool UseRedis => _db != null && _redis != null && _redis.IsConnected;

    private static string NpcKey(string sessionId) => $"game:{sessionId}:npcs";
    private static string EventKey(string sessionId) => $"game:{sessionId}:events";
    private static string MessageKey(string sessionId) => $"game:{sessionId}:messages";
    private static string ChoiceKey(string sessionId) => $"game:{sessionId}:choices";
    private static string PoseKey(string sessionId) => $"game:{sessionId}:poses";
    private static string BoardKey(string sessionId) => $"game:{sessionId}:boards";
    private static string QuestionKey(string sessionId) => $"game:{sessionId}:questions";
    private static string SeenKey(string sessionId, string playerId) => $"game:{sessionId}:seen:{playerId}";

    // --- NPCs ---
    public async Task SaveNpcsAsync(string sessionId, IEnumerable<GameNpc> npcs)
    {
        var list = npcs.ToList();
        if (UseRedis)
        {
            var entries = list.Select(n => new HashEntry(n.Id, JsonData.Write(n))).ToArray();
            if (entries.Length > 0)
            {
                await _db!.HashSetAsync(NpcKey(sessionId), entries);
            }
            return;
        }

        var dict = _memNpcs.GetOrAdd(sessionId, _ => new ConcurrentDictionary<string, GameNpc>());
        foreach (var n in list)
        {
            dict[n.Id] = n;
        }
    }

    public async Task<List<GameNpc>> GetNpcsAsync(string sessionId)
    {
        if (UseRedis)
        {
            var values = await _db!.HashValuesAsync(NpcKey(sessionId));
            var result = new List<GameNpc>(values.Length);
            foreach (var val in values)
            {
                if (!val.IsNullOrEmpty)
                {
                    result.Add(JsonData.Read<GameNpc>(val!));
                }
            }
            return result.OrderBy(n => n.Number).ToList();
        }

        if (_memNpcs.TryGetValue(sessionId, out var dict))
        {
            return dict.Values.OrderBy(n => n.Number).ToList();
        }
        return [];
    }

    public async Task<GameNpc?> GetNpcAsync(string sessionId, string npcId)
    {
        if (UseRedis)
        {
            var val = await _db!.HashGetAsync(NpcKey(sessionId), npcId);
            return val.IsNullOrEmpty ? null : JsonData.Read<GameNpc>(val!);
        }

        if (_memNpcs.TryGetValue(sessionId, out var dict) && dict.TryGetValue(npcId, out var npc))
        {
            return npc;
        }
        return null;
    }

    public async Task DeleteNpcsAsync(string sessionId)
    {
        if (UseRedis)
        {
            await _db!.KeyDeleteAsync(NpcKey(sessionId));
            return;
        }
        _memNpcs.TryRemove(sessionId, out _);
    }

    // --- Conversation Events ---
    public async Task AddConversationEventAsync(string sessionId, NpcConversationEvent ev)
    {
        if (UseRedis)
        {
            await _db!.ListRightPushAsync(EventKey(sessionId), JsonData.Write(ev));
            return;
        }

        var list = _memEvents.GetOrAdd(sessionId, _ => []);
        lock (list)
        {
            list.Add(ev);
        }
    }

    public async Task<List<NpcConversationEvent>> GetConversationEventsAsync(string sessionId, string? gameId = null)
    {
        List<NpcConversationEvent> events;
        if (UseRedis)
        {
            var values = await _db!.ListRangeAsync(EventKey(sessionId), 0, -1);
            events = new List<NpcConversationEvent>(values.Length);
            foreach (var val in values)
            {
                if (!val.IsNullOrEmpty)
                {
                    events.Add(JsonData.Read<NpcConversationEvent>(val!));
                }
            }
        }
        else
        {
            if (_memEvents.TryGetValue(sessionId, out var list))
            {
                lock (list)
                {
                    events = list.ToList();
                }
            }
            else
            {
                events = [];
            }
        }

        if (!string.IsNullOrEmpty(gameId))
        {
            return events.Where(e => e.GameId == gameId).OrderBy(e => e.Sequence).ToList();
        }
        return events.OrderBy(e => e.Sequence).ToList();
    }

    public async Task RemoveConversationEventAsync(string sessionId, string eventId)
    {
        if (UseRedis)
        {
            var all = await GetConversationEventsAsync(sessionId);
            var toRemove = all.FirstOrDefault(e => e.Id == eventId);
            if (toRemove != null)
            {
                await _db!.ListRemoveAsync(EventKey(sessionId), JsonData.Write(toRemove));
            }
            return;
        }

        if (_memEvents.TryGetValue(sessionId, out var list))
        {
            lock (list)
            {
                list.RemoveAll(e => e.Id == eventId);
            }
        }
    }

    public async Task DeleteConversationEventsAsync(string sessionId)
    {
        if (UseRedis)
        {
            await _db!.KeyDeleteAsync(EventKey(sessionId));
            return;
        }
        _memEvents.TryRemove(sessionId, out _);
    }

    // --- Messages ---
    public async Task AddMessageAsync(string sessionId, GameMessage message)
    {
        if (UseRedis)
        {
            await _db!.ListRightPushAsync(MessageKey(sessionId), JsonData.Write(message));
            return;
        }

        var list = _memMessages.GetOrAdd(sessionId, _ => []);
        lock (list)
        {
            list.Add(message);
        }
    }

    public async Task<List<GameMessage>> GetMessagesAsync(string sessionId)
    {
        if (UseRedis)
        {
            var values = await _db!.ListRangeAsync(MessageKey(sessionId), 0, -1);
            var list = new List<GameMessage>(values.Length);
            foreach (var val in values)
            {
                if (!val.IsNullOrEmpty)
                {
                    list.Add(JsonData.Read<GameMessage>(val!));
                }
            }
            return list.OrderBy(m => m.At).ThenBy(m => m.Id).ToList();
        }

        if (_memMessages.TryGetValue(sessionId, out var memList))
        {
            lock (memList)
            {
                return memList.OrderBy(m => m.At).ThenBy(m => m.Id).ToList();
            }
        }
        return [];
    }

    public async Task RemoveMessageAsync(string sessionId, string messageId)
    {
        if (UseRedis)
        {
            var all = await GetMessagesAsync(sessionId);
            var toRemove = all.FirstOrDefault(m => m.Id == messageId);
            if (toRemove != null)
            {
                await _db!.ListRemoveAsync(MessageKey(sessionId), JsonData.Write(toRemove));
            }
            return;
        }

        if (_memMessages.TryGetValue(sessionId, out var memList))
        {
            lock (memList)
            {
                memList.RemoveAll(m => m.Id == messageId);
            }
        }
    }

    public async Task RemoveMessagesByNpcIdsAsync(string sessionId, IEnumerable<string> npcIds)
    {
        var ids = new HashSet<string>(npcIds);
        if (ids.Count == 0) return;

        if (UseRedis)
        {
            var all = await GetMessagesAsync(sessionId);
            var toKeep = all.Where(m => !ids.Contains(m.NpcId)).ToList();
            await _db!.KeyDeleteAsync(MessageKey(sessionId));
            if (toKeep.Count > 0)
            {
                var values = toKeep.Select(m => (RedisValue)JsonData.Write(m)).ToArray();
                await _db.ListRightPushAsync(MessageKey(sessionId), values);
            }
            return;
        }

        if (_memMessages.TryGetValue(sessionId, out var memList))
        {
            lock (memList)
            {
                memList.RemoveAll(m => ids.Contains(m.NpcId));
            }
        }
    }

    public async Task DeleteMessagesAsync(string sessionId)
    {
        if (UseRedis)
        {
            await _db!.KeyDeleteAsync(MessageKey(sessionId));
            return;
        }
        _memMessages.TryRemove(sessionId, out _);
    }

    // --- Choices ---
    public async Task SaveChoiceAsync(string sessionId, PairChoice choice)
    {
        var key = $"{choice.PlayerId}:{choice.Round}";
        if (UseRedis)
        {
            await _db!.HashSetAsync(ChoiceKey(sessionId), key, JsonData.Write(choice));
            return;
        }

        var dict = _memChoices.GetOrAdd(sessionId, _ => new ConcurrentDictionary<string, PairChoice>());
        dict[key] = choice;
    }

    public async Task<List<PairChoice>> GetChoicesAsync(string sessionId)
    {
        if (UseRedis)
        {
            var values = await _db!.HashValuesAsync(ChoiceKey(sessionId));
            var list = new List<PairChoice>(values.Length);
            foreach (var val in values)
            {
                if (!val.IsNullOrEmpty)
                {
                    list.Add(JsonData.Read<PairChoice>(val!));
                }
            }
            return list;
        }

        if (_memChoices.TryGetValue(sessionId, out var dict))
        {
            return dict.Values.ToList();
        }
        return [];
    }

    public async Task RemoveChoicesByNpcIdsAsync(string sessionId, IEnumerable<string> npcIds)
    {
        var ids = new HashSet<string>(npcIds);
        if (ids.Count == 0) return;

        if (UseRedis)
        {
            var choices = await GetChoicesAsync(sessionId);
            var toRemove = choices.Where(c => (c.A != null && ids.Contains(c.A)) || (c.B != null && ids.Contains(c.B))).ToList();
            if (toRemove.Count > 0)
            {
                var fields = toRemove.Select(c => (RedisValue)$"{c.PlayerId}:{c.Round}").ToArray();
                await _db!.HashDeleteAsync(ChoiceKey(sessionId), fields);
            }
            return;
        }

        if (_memChoices.TryGetValue(sessionId, out var dict))
        {
            foreach (var kvp in dict.ToArray())
            {
                if ((kvp.Value.A != null && ids.Contains(kvp.Value.A)) || (kvp.Value.B != null && ids.Contains(kvp.Value.B)))
                {
                    dict.TryRemove(kvp.Key, out _);
                }
            }
        }
    }

    public async Task DeleteChoicesAsync(string sessionId)
    {
        if (UseRedis)
        {
            await _db!.KeyDeleteAsync(ChoiceKey(sessionId));
            return;
        }
        _memChoices.TryRemove(sessionId, out _);
    }

    // --- Movement / Poses (High-frequency player & object movement) ---
    public async Task SetPlayerPoseAsync(string sessionId, string playerId, PoseData pose)
    {
        if (UseRedis)
        {
            await _db!.HashSetAsync(PoseKey(sessionId), playerId, JsonData.Write(pose));
            return;
        }

        var dict = _memPoses.GetOrAdd(sessionId, _ => new ConcurrentDictionary<string, PoseData>());
        dict[playerId] = pose;
    }

    public async Task<PoseData?> GetPlayerPoseAsync(string sessionId, string playerId)
    {
        if (UseRedis)
        {
            var val = await _db!.HashGetAsync(PoseKey(sessionId), playerId);
            return val.IsNullOrEmpty ? null : JsonData.Read<PoseData>(val!);
        }

        if (_memPoses.TryGetValue(sessionId, out var dict) && dict.TryGetValue(playerId, out var pose))
        {
            return pose;
        }
        return null;
    }

    public async Task<Dictionary<string, PoseData>> GetPlayerPosesAsync(string sessionId)
    {
        if (UseRedis)
        {
            var entries = await _db!.HashGetAllAsync(PoseKey(sessionId));
            var dict = new Dictionary<string, PoseData>(entries.Length);
            foreach (var entry in entries)
            {
                if (!entry.Value.IsNullOrEmpty)
                {
                    dict[entry.Name!] = JsonData.Read<PoseData>(entry.Value!);
                }
            }
            return dict;
        }

        if (_memPoses.TryGetValue(sessionId, out var memDict))
        {
            return new Dictionary<string, PoseData>(memDict);
        }
        return [];
    }

    public async Task ResetPosesAsync(string sessionId)
    {
        if (UseRedis)
        {
            await _db!.KeyDeleteAsync(PoseKey(sessionId));
            return;
        }
        _memPoses.TryRemove(sessionId, out _);
    }

    // --- Gamification States (Board, Questions, Idempotency) ---
    public async Task SetPlayerBoardAsync(string sessionId, string playerId, BoardData board)
    {
        if (UseRedis)
        {
            await _db!.HashSetAsync(BoardKey(sessionId), playerId, JsonData.Write(board));
            return;
        }

        var dict = _memBoards.GetOrAdd(sessionId, _ => new ConcurrentDictionary<string, BoardData>());
        dict[playerId] = board;
    }

    public async Task<BoardData?> GetPlayerBoardAsync(string sessionId, string playerId)
    {
        if (UseRedis)
        {
            var val = await _db!.HashGetAsync(BoardKey(sessionId), playerId);
            return val.IsNullOrEmpty ? null : JsonData.Read<BoardData>(val!);
        }

        if (_memBoards.TryGetValue(sessionId, out var dict) && dict.TryGetValue(playerId, out var board))
        {
            return board;
        }
        return null;
    }

    public async Task SetPlayerQuestionsAsync(string sessionId, string playerId, QuestionData questions)
    {
        if (UseRedis)
        {
            await _db!.HashSetAsync(QuestionKey(sessionId), playerId, JsonData.Write(questions));
            return;
        }

        var dict = _memQuestions.GetOrAdd(sessionId, _ => new ConcurrentDictionary<string, QuestionData>());
        dict[playerId] = questions;
    }

    public async Task<QuestionData?> GetPlayerQuestionsAsync(string sessionId, string playerId)
    {
        if (UseRedis)
        {
            var val = await _db!.HashGetAsync(QuestionKey(sessionId), playerId);
            return val.IsNullOrEmpty ? null : JsonData.Read<QuestionData>(val!);
        }

        if (_memQuestions.TryGetValue(sessionId, out var dict) && dict.TryGetValue(playerId, out var q))
        {
            return q;
        }
        return null;
    }

    public async Task<bool> HasSeenCommandAsync(string sessionId, string playerId, string op, string id)
    {
        var tag = $"{op}:{id}";
        if (UseRedis)
        {
            return await _db!.SetContainsAsync(SeenKey(sessionId, playerId), tag);
        }

        if (_memSeen.TryGetValue(sessionId, out var players) && players.TryGetValue(playerId, out var set))
        {
            lock (set)
            {
                return set.Contains(tag);
            }
        }
        return false;
    }

    public async Task RememberCommandAsync(string sessionId, string playerId, string op, string id)
    {
        var tag = $"{op}:{id}";
        if (UseRedis)
        {
            await _db!.SetAddAsync(SeenKey(sessionId, playerId), tag);
            return;
        }

        var players = _memSeen.GetOrAdd(sessionId, _ => new ConcurrentDictionary<string, HashSet<string>>());
        var set = players.GetOrAdd(playerId, _ => []);
        lock (set)
        {
            set.Add(tag);
        }
    }

    public async Task RemoveSeenCommandAsync(string sessionId, string playerId, string op, string id)
    {
        var tag = $"{op}:{id}";
        if (UseRedis)
        {
            await _db!.SetRemoveAsync(SeenKey(sessionId, playerId), tag);
            return;
        }

        if (_memSeen.TryGetValue(sessionId, out var players) && players.TryGetValue(playerId, out var set))
        {
            lock (set)
            {
                set.Remove(tag);
            }
        }
    }

    public async Task ClearSeenCommandsAsync(string sessionId, string playerId)
    {
        if (UseRedis)
        {
            await _db!.KeyDeleteAsync(SeenKey(sessionId, playerId));
            return;
        }

        if (_memSeen.TryGetValue(sessionId, out var players))
        {
            players.TryRemove(playerId, out _);
        }
    }

    // --- Full Session Cleanup ---
    public async Task ClearSessionGameStateAsync(string sessionId)
    {
        if (UseRedis)
        {
            var keys = new RedisKey[]
            {
                NpcKey(sessionId),
                EventKey(sessionId),
                MessageKey(sessionId),
                ChoiceKey(sessionId),
                PoseKey(sessionId),
                BoardKey(sessionId),
                QuestionKey(sessionId)
            };
            await _db!.KeyDeleteAsync(keys);
            return;
        }

        _memNpcs.TryRemove(sessionId, out _);
        _memEvents.TryRemove(sessionId, out _);
        _memMessages.TryRemove(sessionId, out _);
        _memChoices.TryRemove(sessionId, out _);
        _memPoses.TryRemove(sessionId, out _);
        _memBoards.TryRemove(sessionId, out _);
        _memQuestions.TryRemove(sessionId, out _);
        _memSeen.TryRemove(sessionId, out _);
    }
}
