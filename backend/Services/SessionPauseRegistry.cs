using System.Collections.Concurrent;

namespace Backend;

public sealed class SessionPauseRegistry
{
    private readonly ConcurrentDictionary<string, ISessionPauseGate> gates = new();
    public ISessionPauseGate For(string sessionId) => gates.GetOrAdd(sessionId, _ => new SessionPauseGate());
    public void Remove(string sessionId)
    {
        if (gates.TryRemove(sessionId, out var gate)) gate.Reset();
    }
}
