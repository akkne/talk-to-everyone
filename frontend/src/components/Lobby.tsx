import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useGameStore } from '../store/gameStore';
import { loginWithPassword, logoutAccount, registerAccount, useAuthStore } from '../store/authStore';
import { C2S } from '../shared/contract';
import { command, useClient } from '../core/client';
import { Icon } from './Icon';
import { Brand, initials } from './Brand';
import { HomeArt } from './HomeArt';

interface HostEndpoint { ip: string; label: string; url: string }
interface HostInfo {
  isHostMachine: boolean;
  roomCode: string;
  hostCode: string;
  endpoints: HostEndpoint[];
  ollama?: { connected: boolean; baseUrl: string; model: string; availableModels: string[] };
}

interface Props { onConnect: (token: string) => Promise<void>; onExit: () => void }
export function Lobby({ onConnect, onExit }: Props) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [regName, setRegName] = useState('');
  const [token, setToken] = useState(''), [starting, setStarting] = useState(false);
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);
  const [copied, setCopied] = useState('');
  const rules = useRef<HTMLDialogElement>(null);
  const { connection, lobby, playerId, gameInfo, gameInfoError } = useGameStore();
  const { jwt, user, initializing, busy: authBusy, error: authError } = useAuthStore();
  const client = useClient();
  const connected = connection === 'ready', busy = !['offline', 'ready'].includes(connection), leader = lobby?.leaderId === playerId;

  useEffect(() => { window.scrollTo(0, 0); }, [connected]);
  useEffect(() => {
    if (!jwt || !user) {
      setHostInfo(null);
      return;
    }
    fetch('/api/host-info', {
      headers: { Authorization: `Bearer ${jwt}` },
    })
      .then(r => {
        if (r.status === 401) {
          logoutAccount();
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data: HostInfo | null) => {
        if (data) {
          setHostInfo(data);
          setToken(prev => prev || data.roomCode || '1234');
        }
      })
      .catch(() => {});
  }, [connected, jwt, user]);

  const submitAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (authBusy) return;
    if (authMode === 'login') {
      await loginWithPassword(loginInput.trim(), passwordInput);
    } else {
      await registerAccount(loginInput.trim(), passwordInput, regName.trim());
    }
  };

  const handleLogout = () => {
    if (connected || busy) onExit();
    logoutAccount();
    setPasswordInput('');
  };

  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const joinToken = token.trim() || hostInfo?.roomCode || '1234';
    void onConnect(joinToken);
  };
  const createAsHost = () => {
    if (!user || busy) return;
    const leaderToken = hostInfo?.hostCode || 'host';
    void onConnect(leaderToken);
  };
  const start = async () => { setStarting(true); await command(client, C2S.START_GAME, undefined); setStarting(false); };
  const copyText = (value: string, label: string) => {
    void navigator.clipboard?.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const factsList: [string | number, string][] = gameInfo
    ? [[gameInfo.npcCount, 'участников в студии'], [gameInfo.pairCount, 'пар друзей'], [gameInfo.actorCount, 'актёров среди них'], [gameInfo.rounds.length, 'раундов игры']]
    : [['10', 'участников в студии'], ['3', 'пары друзей'], ['4', 'актёра среди них'], ['5', 'раундов игры']];

  return <div className="home-shell"><div className="container"><header className="header"><Brand onClick={() => { if (connected) onExit(); }} /><nav className="header-nav" aria-label="Навигация">
    {user ? <>
      <span className="pill" title={`Логин: ${user.login}`}>{user.name}</span>
      <button type="button" className="btn ghost" onClick={handleLogout}>Выйти из аккаунта</button>
    </> : !connected && <a href="#join" className="btn ghost">Войти в аккаунт <Icon name="arrow" /></a>}
  </nav></header>
    {!connected ? <main><section className="hero"><div className="hero-copy"><h1>Вы узнаете тех,<br />кто дружит<br />по-настоящему?</h1><p>Участники расскажут о себе и своих знакомых. Пока настоящие друзья вспоминают общие истории, актёры пытаются убедить вас, что тоже были их частью.</p><div className="facts">{factsList.map(([n, t]) => <div className="fact" key={t}><b>{n}</b><span>{t}</span></div>)}</div>{gameInfoError && <p role="alert">{gameInfoError}</p>}<HomeArt /></div>
      {initializing ? (
        <div className="join-card" id="join">
          <h2>Проверка сессии…</h2>
          <p>Загружаем профиль пользователя.</p>
        </div>
      ) : !user ? (
        <form className="join-card" id="join" onSubmit={e => void submitAuth(e)}>
          <h2>{authMode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}</h2>
          <p>{authMode === 'login' ? 'Войдите по логину и паролю, чтобы присоединиться к команде.' : 'Укажите логин, пароль и ваше имя для участия в играх.'}</p>

          <label className="field" htmlFor="auth-login">Логин</label>
          <input className="input" id="auth-login" type="text" value={loginInput} onChange={e => setLoginInput(e.target.value)} minLength={3} maxLength={32} required autoComplete="username" placeholder="Ваш логин" disabled={authBusy} />

          <label className="field" htmlFor="auth-password">Пароль</label>
          <input className="input" id="auth-password" type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} minLength={4} maxLength={128} required autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} placeholder="Минимум 4 символа" disabled={authBusy} />

          {authMode === 'register' && <>
            <label className="field" htmlFor="auth-name">Ваше имя</label>
            <input className="input" id="auth-name" type="text" value={regName} onChange={e => setRegName(e.target.value)} minLength={1} maxLength={32} required autoComplete="nickname" placeholder="Как вас представить остальным" disabled={authBusy} />
          </>}

          {authError && <p className="form-note" style={{ color: '#b9362c', margin: '12px 0' }} role="alert">{authError}</p>}

          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button className="btn block" type="submit" disabled={authBusy || !loginInput.trim() || !passwordInput || (authMode === 'register' && !regName.trim())}>
              {authBusy ? 'Подождите…' : authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
              <Icon name="arrow" />
            </button>
            <button
              className="btn ghost block"
              type="button"
              disabled={authBusy}
              onClick={() => {
                setAuthMode(m => (m === 'login' ? 'register' : 'login'));
                useAuthStore.setState({ error: null });
              }}
            >
              {authMode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
            </button>
          </div>
        </form>
      ) : (
        <form className="join-card" id="join" onSubmit={submitJoin}>
          <h2>Соберите своё жюри (LAN)</h2>
          <p>Вы вошли как <b>{user.name}</b>. Вводить имя повторно не требуется — просто присоединитесь к команде.</p>
          <label className="field" htmlFor="session-token">Код комнаты</label>
          <input className="input" id="session-token" type="text" value={token} onChange={e => setToken(e.target.value)} required autoComplete="off" placeholder="Например: 1234" disabled={busy} />
          <p className="form-note">Код по умолчанию для игроков: <b>{hostInfo?.roomCode || '1234'}</b></p>
          <button className="btn block" disabled={busy || !token.trim()}>{busy ? 'Подключаемся…' : 'Присоединиться к команде'}<Icon name="arrow" /></button>
          <button className="btn ghost block create-room" type="button" style={{ marginTop: '10px' }} disabled={busy} onClick={createAsHost} title="Войти как ведущий (хост) комнаты">Создать лобби (Хост)</button>
          {hostInfo?.ollama && <p className="footnote" style={{ marginTop: '0.5rem' }}>
            Ollama: <b>{hostInfo.ollama.connected ? `Подключена (${hostInfo.ollama.model})` : 'Модель недоступна'}</b>
          </p>}
          {busy && <button type="button" className="text-button mt-3" onClick={onExit}>Отменить подключение</button>}
        </form>
      )}
    </section>
      <section className="how"><div className="section-head"><h2>Постепенно вы соберёте свою версию.</h2><p>У каждого судьи будут свои заметки и догадки.</p></div><div className="steps">{[['Слушайте истории участников', 'Сравнивайте знакомые детали и замечайте моменты, в которых чужие воспоминания перестают сходиться.'], ['Проверяйте свои догадки', 'Записывайте наблюдения в личный блокнот и задавайте вопросы, которые помогут разобраться в противоречиях.'], ['Найдите настоящих друзей', 'Составляйте пары по своим наблюдениям, чтобы в финале узнать, насколько точно вы поняли, кто с кем дружит.']].map(([t, p], i) => <article className="step" key={t}><span className="step-number">0{i + 1}</span><div><h3>{t}</h3><p>{p}</p></div></article>)}</div></section></main> :
      <main><section className="lobby"><button className="back" onClick={onExit}>← Вернуться на главную</button><div className="lobby-title"><div><h1>Теперь можно занять<br />своё место в студии.</h1></div><div className="room-code" onClick={() => copyText(hostInfo?.roomCode || '1234', 'code')} style={{ cursor: 'pointer' }} title="Нажмите, чтобы скопировать код комнаты">Код для друзей<b>{hostInfo?.roomCode || '1234'}</b>{copied === 'code' && <small style={{ display: 'block', fontSize: '0.75rem' }}>Скопировано!</small>}</div></div>
        <div className="lobby-grid"><div className="people"><div className="people-head"><span>Игроки в комнате</span><span>{lobby?.players.filter(p => p.connected).length ?? 0} онлайн (всего {lobby?.players.length ?? 0})</span></div>{lobby?.players.map(p => <div className="player" key={p.id}><span className="avatar">{initials(p.name)}</span><div><div className="player-name">{p.name}{p.id === playerId && <span className="muted"> · Вы</span>}</div><div className="player-role">{p.id === lobby.leaderId ? 'Ведущий комнаты (Хост)' : 'Судья'}</div></div><span className="player-ready"><i />{p.connected ? 'В комнате' : 'Нет связи'}</span></div>)}</div>
          <aside className="launch"><h2>Компания готова к игре?</h2><p>Вы окажетесь в общей студии, где участники начнут знакомиться с жюри и рассказывать свои истории.</p>
            <button className="btn block" onClick={() => void start()} disabled={!lobby?.canStart || !leader || starting}>{starting ? 'Начинаем…' : leader ? 'Начать игру' : 'Ожидаем ведущего'}<Icon name="arrow" /></button>
            {!lobby?.canStart && <p className="subtle">Нужно игроков: {lobby?.minPlayers ?? '1'}</p>}
            {hostInfo?.endpoints && hostInfo.endpoints.length > 0 && (
              <div className="room-detail" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}>
                <span style={{ fontWeight: 600 }}>Ссылки для друзей (Radmin / Hamachi / LAN):</span>
                {hostInfo.endpoints.map(ep => (
                  <button
                    key={ep.ip}
                    type="button"
                    onClick={() => copyText(ep.url, ep.ip)}
                    style={{ textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontSize: '0.85rem', textDecoration: 'underline' }}
                    title="Нажмите, чтобы скопировать ссылку для Discord"
                  >
                    <b>{ep.label}:</b> {ep.url} {copied === ep.ip ? '✓ скопировано' : ''}
                  </button>
                ))}
              </div>
            )}
            {hostInfo?.ollama && (
              <div className="room-detail">
                <Icon name="sound" />
                <span>ИИ (Ollama): <b>{hostInfo.ollama.connected ? hostInfo.ollama.model : 'модель недоступна'}</b></span>
              </div>
            )}
          </aside></div></section></main>}
    <footer className="footer"><span>Угадай друзей © 2026</span><button onClick={() => rules.current?.showModal()}>Прочитать правила игры</button></footer></div><dialog className="rules-dialog" ref={rules}><h2>Доверяйте деталям, которые сходятся.</h2>{gameInfo ? <><p>В студии {gameInfo.npcCount} участников: {gameInfo.pairCount} пары друзей и {gameInfo.actorCount} актёра. Слушайте истории и собирайте наблюдения в личном блокноте.</p><p>Голосование проходит после раундов {gameInfo.choiceRounds.join(', ')}. В раунде допроса каждый судья может задать {gameInfo.questionLimit} вопроса разным участникам. В финале откроются настоящие связи и результаты жюри.</p></> : <><p>В студии находятся десять участников: три пары друзей и четыре актёра. Слушайте истории и собирайте наблюдения в личном блокноте.</p><p>После второго, четвёртого и пятого раундов жюри голосует за пару. В четвёртом раунде каждый судья может задать два вопроса разным участникам. В финале откроются настоящие связи и результаты жюри.</p></>}<button className="btn" onClick={() => rules.current?.close()}>Вернуться к компании</button></dialog></div>;
}
