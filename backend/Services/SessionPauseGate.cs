namespace Backend;

/// <summary>
/// Default thread-safe coordinator for pausing and resuming the game session and NPC bots.
/// </summary>
public sealed class SessionPauseGate : ISessionPauseGate
{
    private readonly object _sync = new();
    private TaskCompletionSource<bool>? _resumeSignal;
    private bool _isPaused;
    private long _pausedRemainingMs;
    private string? _pausedByPlayerId;

    /// <inheritdoc />
    public bool IsPaused
    {
        get
        {
            lock (_sync)
            {
                return _isPaused;
            }
        }
    }

    /// <inheritdoc />
    public long PausedRemainingMs
    {
        get
        {
            lock (_sync)
            {
                return _pausedRemainingMs;
            }
        }
    }

    /// <inheritdoc />
    public string? PausedByPlayerId
    {
        get
        {
            lock (_sync)
            {
                return _pausedByPlayerId;
            }
        }
    }

    /// <inheritdoc />
    public GamePauseView ApplyPause(GameSession session, bool paused, string actorPlayerId, long nowMs)
    {
        lock (_sync)
        {
            if (paused && !_isPaused)
            {
                _pausedRemainingMs = session.Phase == "playing" && session.EndsAt > nowMs
                    ? session.EndsAt - nowMs
                    : 0L;
                _isPaused = true;
                _pausedByPlayerId = actorPlayerId;
                _resumeSignal = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            }
            else if (!paused && _isPaused)
            {
                if (session.Phase == "playing" && _pausedRemainingMs > 0)
                {
                    session.EndsAt = nowMs + _pausedRemainingMs;
                }

                _isPaused = false;
                _pausedRemainingMs = 0L;
                _pausedByPlayerId = null;
                _resumeSignal?.TrySetResult(true);
                _resumeSignal = null;
            }

            var effectiveEndsAt = _isPaused ? nowMs + _pausedRemainingMs : session.EndsAt;
            return new GamePauseView(_isPaused, _pausedRemainingMs, effectiveEndsAt, _pausedByPlayerId);
        }
    }

    /// <inheritdoc />
    public GamePauseView CurrentView(GameSession session, long nowMs)
    {
        lock (_sync)
        {
            var effectiveEndsAt = _isPaused ? nowMs + _pausedRemainingMs : session.EndsAt;
            return new GamePauseView(_isPaused, _pausedRemainingMs, effectiveEndsAt, _pausedByPlayerId);
        }
    }

    /// <inheritdoc />
    public void Reset()
    {
        lock (_sync)
        {
            _isPaused = false;
            _pausedRemainingMs = 0L;
            _pausedByPlayerId = null;
            _resumeSignal?.TrySetResult(true);
            _resumeSignal = null;
        }
    }

    /// <inheritdoc />
    public Task WaitWhilePausedAsync(CancellationToken ct = default)
    {
        Task? waitTask;
        lock (_sync)
        {
            if (!_isPaused || _resumeSignal == null)
            {
                return Task.CompletedTask;
            }

            waitTask = _resumeSignal.Task;
        }

        return waitTask.WaitAsync(ct);
    }
}
