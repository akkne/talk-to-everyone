import { useEffect, useRef, useState } from 'react';
import { SignalRClient } from './core/signalr';
import { ClientContext, connectionStatus, receiveEvent } from './core/client';
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
import { Reveal } from './components/Reveal';
import { Scene } from './scene/Scene';
import { Icon } from './components/Icon';

/** <summary>Phase routing, JWT session verification, and SignalR session lifetime.</summary> */
export default function App() {
  const [client, setClient] = useState<GameClient>(() => new SignalRClient(receiveEvent, connectionStatus));
  const activeClient = useRef(client); const [questions, setQuestions] = useState(false);
  const { phase, boardOpen, error, connection, round, voting } = useGameStore();
  const connect = async (token: string) => {
    await activeClient.current.disconnect(); resetGame(); resetCache();
    const next = new SignalRClient(receiveEvent, connectionStatus);
    activeClient.current = next; setClient(next);
    await next.connect(token);
  };
  const exit = async () => { await activeClient.current.disconnect(); resetGame(); resetCache(); setQuestions(false); };
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.VITE_HUB_ORIGIN || ''}/api/game-info`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<GameInfo>; })
      .then(gameInfo => useGameStore.setState({ gameInfo, gameInfoError: null }))
      .catch(() => { if (!controller.signal.aborted) useGameStore.setState(state => ({ gameInfoError: state.gameInfo ? null : 'Не удалось загрузить правила игры с сервера.' })); });
    void verifyStoredSession();
    return () => {
      controller.abort();
      void activeClient.current.disconnect();
    };
  }, []);
  useEffect(() => { setQuestions(round?.phase === 'interrogation'); }, [round?.phase]);
  useEffect(() => { if ((boardOpen || questions || !!voting) && document.pointerLockElement) document.exitPointerLock(); }, [boardOpen, questions, voting]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (event.key === 'Escape') { useGameStore.setState({ boardOpen: false }); setQuestions(false); }
      if (editing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Tab' && phase === 'playing') { event.preventDefault(); useGameStore.setState(s => ({ boardOpen: !s.boardOpen })); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [phase, boardOpen]);
  return <ClientContext.Provider value={client}>
    {phase === 'lobby' ? <Lobby onConnect={connect} onExit={() => void exit()} /> : phase === 'reveal' ? <Reveal onExit={() => void exit()} /> : <div className="game-page">
      <div className="scene-area"><Scene controlsBlocked={questions || !!voting} /></div><HUD onExit={() => void exit()} onQuestions={() => setQuestions(true)} /><Chat />
      {questions && round?.phase === 'interrogation' && !boardOpen && <QuestionMenu onClose={() => setQuestions(false)} />}
      {boardOpen && !voting && <Board />}
      {voting && <Voting key={`${voting.round}:${voting.stage}`} />}
    </div>}
    {phase !== 'lobby' && connection !== 'ready' && <div className="connection-banner" role="status">{connection === 'offline' ? 'Связь потеряна. Войдите снова, чтобы получить сохранённое состояние.' : 'Восстанавливаем соединение. Действия временно недоступны.'}{connection === 'offline' && <button onClick={() => void exit()}>Ко входу →</button>}</div>}
    {error && <div className="toast" role="alert"><span>{error}</span><button onClick={() => useGameStore.setState({ error: null })} aria-label="Закрыть уведомление"><Icon name="close" size={18} /></button></div>}
  </ClientContext.Provider>;
}
