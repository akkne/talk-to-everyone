import { useEffect, useRef, useState } from 'react';
import { SignalRClient } from './core/signalr';
import { ClientContext, connectionStatus, receiveEvent } from './core/client';
import { C2S, NET } from './shared/contract';
import { PlayerActivityClassifier } from './shared/activity';
import { PushToTalkController } from './audio/PushToTalkController';
import { setPushToTalkPressed } from './store/voiceSettingsStore';
import type { GameClient, GameInfo } from './shared/types';
import { resetGame, useGameStore } from './store/gameStore';
import { resetCache } from './store/cacheStore';
import { verifyStoredSession } from './store/authStore';
import { Lobby } from './components/Lobby';
import { HUD } from './components/HUD';
import { Voting } from './components/Voting';
import { Board } from './components/Board';
import { Chat } from './components/Chat';
import { QuestionMenu } from './components/QuestionMenu';
import { EscapeMenu } from './components/EscapeMenu';
import { Reveal } from './components/Reveal';
import { Scene } from './scene/Scene';
import { Icon } from './components/Icon';

/** <summary>Determines the next Escape/Board/Questions UI state when the Escape key is pressed.</summary> */
export function handleEscapeKeyState(current: {
  phase: 'lobby' | 'playing' | 'reveal';
  escapeOpen: boolean;
  boardOpen: boolean;
  questionsOpen: boolean;
}): { escapeOpen: boolean; boardOpen: boolean; questionsOpen: boolean } {
  if (current.escapeOpen) {
    return { escapeOpen: false, boardOpen: current.boardOpen, questionsOpen: current.questionsOpen };
  }
  if (current.boardOpen || current.questionsOpen) {
    return { escapeOpen: false, boardOpen: false, questionsOpen: false };
  }
  return { escapeOpen: true, boardOpen: false, questionsOpen: false };
}

/** <summary>Phase routing, JWT session verification, Escape menu, and SignalR session lifetime.</summary> */
export default function App() {
  const [client, setClient] = useState<GameClient>(() => new SignalRClient(receiveEvent, connectionStatus));
  const activeClient = useRef(client);
  const [questions, setQuestions] = useState(false);
  const [tour, setTour] = useState(false);
  const { phase, boardOpen, escapeOpen, error, connection, round, voting, paused, scene } = useGameStore();

  const connect = async (token: string) => {
    await activeClient.current.disconnect();
    resetGame();
    resetCache();
    const next = new SignalRClient(receiveEvent, connectionStatus);
    activeClient.current = next;
    setClient(next);
    await next.connect(token);
  };

  const exit = async () => {
    await activeClient.current.disconnect();
    resetGame();
    resetCache();
    setTour(false);
    setQuestions(false);
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.VITE_HUB_ORIGIN || ''}/api/game-info`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<GameInfo>;
      })
      .then(gameInfo => useGameStore.setState({ gameInfo, gameInfoError: null }))
      .catch(() => {
        if (!controller.signal.aborted) {
          useGameStore.setState(state => ({
            gameInfoError: state.gameInfo ? null : 'Не удалось загрузить правила игры с сервера.',
          }));
        }
      });
    void verifyStoredSession();
    return () => {
      controller.abort();
      void activeClient.current.disconnect();
    };
  }, []);

  useEffect(() => {
    setQuestions(round?.phase === 'interrogation');
  }, [round?.phase]);

  useEffect(() => {
    if ((boardOpen || questions || !!voting || escapeOpen) && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [boardOpen, questions, voting, escapeOpen]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = Boolean(
        target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      );
      if (event.key === 'Escape') {
        const state = useGameStore.getState();
        if (state.phase === 'lobby' && state.connection !== 'ready') return;
        event.preventDefault();
        const next = handleEscapeKeyState({
          phase: state.phase,
          escapeOpen: state.escapeOpen,
          boardOpen: state.boardOpen,
          questionsOpen: questions,
        });
        useGameStore.setState({ escapeOpen: next.escapeOpen, boardOpen: next.boardOpen });
        setQuestions(next.questionsOpen);
        return;
      }
      if (editing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (PushToTalkController.isPushToTalkKeyEvent(event)) {
        setPushToTalkPressed(true);
      }
      if (event.key === 'Tab' && phase === 'playing' && !escapeOpen) {
        event.preventDefault();
        useGameStore.setState(s => ({ boardOpen: !s.boardOpen }));
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (PushToTalkController.isPushToTalkKeyEvent(event)) {
        setPushToTalkPressed(false);
      }
    };
    const blur = () => setPushToTalkPressed(false);
    document.addEventListener('keydown', key);
    document.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  }, [phase, boardOpen, escapeOpen, questions]);

  useEffect(() => {
    if (connection !== 'ready') return;
    const sendDiagnostics = () => {
      const s = useGameStore.getState();
      if (s.connection !== 'ready') return;
      const mePose = s.players.find(p => p.id === s.playerId)?.pose.mode ?? 'walking';
      const activity = PlayerActivityClassifier.resolveCode({
        phase: s.phase,
        escapeOpen: s.escapeOpen,
        votingOpen: Boolean(s.voting),
        questionOpen: questions && s.round?.phase === 'interrogation' && !s.boardOpen,
        questionPending: s.questions.pending,
        boardOpen: s.boardOpen,
        npcSpeaking: Boolean(s.dialogue.current),
        poseMode: mePose,
      });
      void activeClient.current
        .send(C2S.REPORT_DIAGNOSTICS, {
          fps: s.metrics.fps,
          pingMs: s.rtt ?? 0,
          activity,
        })
        .catch(() => {});
    };

    sendDiagnostics();
    const timer = setInterval(sendDiagnostics, NET.DIAGNOSTICS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [connection, phase, escapeOpen, boardOpen, questions, voting]);

  return (
    <ClientContext.Provider value={client}>
      {phase === 'lobby' && tour && connection === 'ready' ? (
        <div className="hangar-tour">
          <Scene controlsBlocked={escapeOpen} />
          <div className="hangar-tour-bar"><span>{scene?.name ?? 'Локация'} · {scene?.room.width} × {scene?.room.depth} × {scene?.room.height} м</span><button className="secondary" onClick={() => setTour(false)}>Вернуться в лобби</button></div>
        </div>
      ) : phase === 'lobby' ? (
        <Lobby onConnect={connect} onExit={() => void exit()} onTour={() => setTour(true)} />
      ) : phase === 'reveal' ? (
        <Reveal onExit={() => void exit()} />
      ) : (
        <div className="game-page">
          <div className="scene-area">
            <Scene controlsBlocked={questions || !!voting || escapeOpen} />
          </div>
          <HUD
            onExit={() => void exit()}
            onQuestions={() => setQuestions(true)}
            onOpenEscape={() => useGameStore.setState({ escapeOpen: true })}
          />
          <Chat />
          {paused && (
            <div className="pause-banner" role="status">
              <Icon name="pause" size={16} />
              <span>Игра и боты поставлены хостом на паузу — перемещение по студии и доска расследования доступны</span>
            </div>
          )}
          {questions && round?.phase === 'interrogation' && !boardOpen && !escapeOpen && (
            <QuestionMenu onClose={() => setQuestions(false)} />
          )}
          {boardOpen && !voting && !escapeOpen && <Board />}
          {voting && !escapeOpen && <Voting key={`${voting.round}:${voting.stage}`} />}
        </div>
      )}
      {escapeOpen && connection === 'ready' && (
        <EscapeMenu
          onClose={() => useGameStore.setState({ escapeOpen: false })}
          onExit={() => {
            useGameStore.setState({ escapeOpen: false });
            void exit();
          }}
        />
      )}
      {phase !== 'lobby' && connection !== 'ready' && (
        <div className="connection-banner" role="status">
          {connection === 'offline'
            ? 'Связь потеряна. Войдите снова, чтобы получить сохранённое состояние.'
            : 'Восстанавливаем соединение. Действия временно недоступны.'}
          {connection === 'offline' && <button onClick={() => void exit()}>Ко входу →</button>}
        </div>
      )}
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button onClick={() => useGameStore.setState({ error: null })} aria-label="Закрыть уведомление">
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
    </ClientContext.Provider>
  );
}
