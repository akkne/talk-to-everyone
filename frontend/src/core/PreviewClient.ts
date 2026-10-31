import { C2S, GAME, S2C } from '../shared/contract';
import { lockedRound, UI } from '../shared/config';
import type { Board, Commands, EventHandler, GameClient, NpcDetails, NpcMeta } from '../shared/types';
import type { ConnectionStatus } from '../store/gameStore';

const names = ['Алиса', 'Марк', 'Соня', 'Лев', 'Ника', 'Тим', 'Вера', 'Ян', 'Майя', 'Олег'];
const colors = ['#bd7056', '#798b82', '#c4a36b', '#627d97', '#ab7d86', '#8b9875', '#b19368', '#827a99', '#b17b51', '#6e9696'];
const lines = [
  'Я всегда беру два билета. Даже если ещё не знаю, кто пойдёт со мной.',
  'Наш поезд ушёл в 06:40. А мы всё ещё спорили, кто забыл билеты.',
  'Не люблю громкие компании. Но ради одного человека делаю исключение.',
  'Я точно помню тот вечер. Кажется, это было летом. Или в ноябре…',
  'У нас есть правило: кто опоздал, тот выбирает самый плохой фильм.',
  'Это неправда! Фильм был отличный. Просто мы оба уснули.',
  'Все мои друзья говорят, что я никогда не ошибаюсь в людях.',
  'У меня была ровно такая же история. Только намного интереснее.',
  'Мне рассказывали эту историю. Но деталей я, конечно, не спрашивала.',
  'Билеты были у меня. Я просто перепутал карманы куртки.',
];
const friends: [string, string][] = [['npc-0', 'npc-2'], ['npc-1', 'npc-9'], ['npc-4', 'npc-5']];
const actors = ['npc-3', 'npc-6', 'npc-7', 'npc-8'];
const DETAIL_BYTES = 4096;

/** <summary>Explicit UI-only preview. No network, database, multiplayer or LLM is simulated as verified.</summary> */
export class PreviewClient implements GameClient {
  private board: Board = { pairs: [], liars: [], locks: {}, notes: {} };
  private askedTo: string[] = [];
  private round = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private alive = false;
  private started = false;
  private readonly npcs: NpcMeta[] = names.map((_, index) => ({ id: `npc-${index}`, index, color: colors[index] }));
  constructor(private readonly emit: EventHandler, private readonly status: (status: ConnectionStatus) => void) {}
  async connect(_token: string, name: string) {
    this.alive = true;
    this.emit(S2C.AUTH_OK, { playerId: 'preview', sessionId: 'preview', role: 'leader' });
    this.emit(S2C.STATE_SNAPSHOT, { sessionId: 'preview', me: 'preview', started: false,
      round: { n: 0, phase: 'lobby', endsAt: 0 }, players: [{ id: 'preview', yaw: 0, pitch: 0, connected: true }],
      npcs: this.npcs, worldSizeBytes: DETAIL_BYTES * GAME.NPC_COUNT, board: this.copyBoard(), score: { preview: 0 } });
    this.emit(S2C.LOBBY_STATE, { sessionId: 'preview', players: [{ id: 'preview', name, connected: true }], minPlayers: 1, canStart: true, started: false });
    this.status('ready');
  }
  async disconnect() { this.alive = false; this.timers.forEach(clearTimeout); this.timers = []; this.status('offline'); }
  setCamera(_yaw: number, _pitch: number) { /* This mode deliberately has no remote players. */ }
  async send<K extends keyof Commands>(method: K, payload: Commands[K]) {
    if (!this.alive) throw new Error('Preview closed');
    if (method === C2S.START_GAME && !this.started) {
      this.started = true; this.emit(S2C.GAME_STARTED, { rounds: [...GAME.ROUNDS], npcs: this.npcs }); this.nextRound(); return;
    }
    if (method === C2S.REQUEST_CHUNK) {
      const p = payload as Commands[typeof C2S.REQUEST_CHUNK];
      this.emit(S2C.CHUNK_DATA, { reqId: p.reqId, npcs: p.ids.slice(0, 1).filter(id => this.npcs.some(n => n.id === id)).map(id => ({ id, details: this.details(id), sizeBytes: DETAIL_BYTES })) }); return;
    }
    if (method === C2S.PING) { this.emit(S2C.PONG, payload as Commands[typeof C2S.PING]); return; }
    if (method === C2S.ASK_QUESTION) { this.ask(payload as Commands[typeof C2S.ASK_QUESTION]); return; }
    if ([C2S.SEND_CAMERA, C2S.RELEASE_CHUNK, C2S.AUTH, C2S.START_GAME].includes(method as never)) return;
    if (this.round < 1 || this.round >= 5) { this.reject(method, 'Доска доступна во время расследования.'); return; }
    this.editBoard(method, payload);
  }
  private copyBoard(): Board { return structuredClone(this.board); }
  private reject(op: string, message: string) { this.emit(S2C.BOARD_REJECT, { op, code: 'INVALID', message }); }
  private isLocked(npc: string) { return this.board.pairs.some(([a, b]) => (a === npc || b === npc) && lockedRound(this.board.locks, a, b) !== undefined); }
  private used(npc: string) { return this.board.liars.includes(npc) || this.board.pairs.some(p => p.includes(npc)); }
  private editBoard<K extends keyof Commands>(method: K, payload: Commands[K]) {
    const p = payload as { a?: string; b?: string; npc?: string; text?: string; round?: number };
    const valid = (id?: string): id is string => !!id && this.npcs.some(n => n.id === id);
    if (method === C2S.PAIR_NPCS && valid(p.a) && valid(p.b) && p.a !== p.b && !this.used(p.a) && !this.used(p.b) && this.board.pairs.length < GAME.PAIR_SLOTS) this.board.pairs.push([p.a, p.b]);
    else if (method === C2S.UNPAIR_NPCS && valid(p.a) && valid(p.b) && !this.isLocked(p.a) && !this.isLocked(p.b)) this.board.pairs = this.board.pairs.filter(pair => !(pair.includes(p.a!) && pair.includes(p.b!)));
    else if (method === C2S.MARK_LIAR && valid(p.npc) && !this.used(p.npc) && this.board.liars.length < GAME.LIAR_SLOTS) this.board.liars.push(p.npc);
    else if (method === C2S.UNMARK_LIAR && valid(p.npc)) this.board.liars = this.board.liars.filter(id => id !== p.npc);
    else if (method === C2S.LOCK_PAIR && valid(p.a) && valid(p.b) && this.round >= 2 && this.board.pairs.some(pair => pair.includes(p.a!) && pair.includes(p.b!))) this.board.locks[`${p.a}-${p.b}`] ??= this.round;
    else if (method === C2S.SAVE_NOTE && valid(p.npc)) this.board.notes[p.npc] = (p.text || '').replace(/<[^>]*>/g, '').slice(0, GAME.NOTE_MAX_LEN);
    else { this.reject(method, 'Назначение недоступно: проверьте свободные слоты, пару и замки.'); return; }
    this.emit(S2C.BOARD_SNAPSHOT, { board: this.copyBoard() });
  }
  /** <summary>Generate one fixed-size detail record on demand; no browser-side world detail array.</summary> */
  private details(id: string): NpcDetails {
    const index = this.npcs.findIndex(n => n.id === id);
    const details = { displayName: names[index], photoColor: colors[index], loreChunks: [lines[index]], voiceHint: 'Спокойный голос' };
    details.loreChunks[0] += ' '.repeat(DETAIL_BYTES - new TextEncoder().encode(JSON.stringify(details)).length);
    return details;
  }
  private later(callback: () => void, ms: number) { this.timers.push(setTimeout(() => { if (this.alive) callback(); }, ms)); }
  private nextRound() {
    const round = GAME.ROUNDS[this.round++];
    if (!round) return;
    this.emit(S2C.ROUND_STARTED, { n: round.n, phase: round.phase, endsAt: Date.now() + UI.PREVIEW_ROUND_SEC * 1000 });
    if (round.n === 5) {
      this.emit(S2C.GAME_ENDED, { reveal: { trueFriends: friends, actors } });
      this.emit(S2C.SCORE_UPDATE, { players: [{ id: 'preview', score: 0, title: 'Осмотр интерфейса — очки не начисляются' }] }); return;
    }
    if (round.n < 4) for (let i = 0; i < GAME.NPC_COUNT; i++) this.later(() => this.say(`npc-${i}`, null), 900 + i * 2500);
    this.later(() => { this.emit(S2C.ROUND_ENDED, { n: round.n, nextIn: 0 }); this.nextRound(); }, UI.PREVIEW_ROUND_SEC * 1000);
  }
  private ask(p: Commands[typeof C2S.ASK_QUESTION]) {
    if (this.round !== 4 || this.askedTo.length >= GAME.QUESTIONS_PER_JUDGE) { this.emit(S2C.QUESTION_REJECT, { code: 'LIMIT', message: 'Допрос доступен в четвёртом раунде: всего два вопроса.' }); return; }
    if (this.askedTo.includes(p.targetNpc)) { this.emit(S2C.QUESTION_REJECT, { code: 'SAME_NPC', message: 'Выберите другого собеседника.' }); return; }
    if (!p.text.trim() || !this.npcs.some(n => n.id === p.targetNpc)) { this.emit(S2C.QUESTION_REJECT, { code: 'EMPTY', message: 'Выберите NPC и напишите вопрос.' }); return; }
    this.askedTo.push(p.targetNpc);
    this.emit(S2C.QUESTION_OK, { remaining: GAME.QUESTIONS_PER_JUDGE - this.askedTo.length, askedTo: [...this.askedTo] });
    this.later(() => this.say(p.targetNpc, p.text), 700);
  }
  private say(id: string, question: string | null) {
    const index = this.npcs.findIndex(n => n.id === id);
    this.emit(S2C.NPC_SAY, { npc: id, text: lines[index], inReplyTo: question });
    const friend = friends.find(pair => pair.includes(id))?.find(npc => npc !== id);
    if (friend) this.emit(S2C.NPC_REACTION, { npc: friend, reaction: 'pulse', reason: 'Знакомая история (сценарий осмотра)' });
  }
}
