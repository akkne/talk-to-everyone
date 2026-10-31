import { HubConnection, HubConnectionBuilder, HttpTransportType, LogLevel } from '@microsoft/signalr';
import { C2S, HUB, NET, S2C } from '../shared/contract';
import { UI } from '../shared/config';
import type { Commands, EventHandler, Events, GameClient, Pose, Vec3 } from '../shared/types';
import type { ConnectionStatus } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';

/** <summary>Authenticated WebSocket transport using JWT Bearer token and room code.</summary> */
export class SignalRClient implements GameClient {
  private readonly connection: HubConnection;
  private credentials: Commands[typeof C2S.AUTH] | null = null;
  private authenticated = false;
  private ready = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private authDeadline?: ReturnType<typeof setTimeout>;
  private pose: Omit<Commands[typeof C2S.SEND_POSE], 'seq'> = { position: { x: 0, y: 0, z: 5 }, yaw: 0, pitch: 0 };
  private sentPose = '';
  private poseBusy = false;
  private seq = 0;
  private epoch = 0;

  constructor(private readonly emit: EventHandler, private readonly status: (status: ConnectionStatus) => void) {
    this.connection = new HubConnectionBuilder()
      .withUrl(`${import.meta.env.VITE_HUB_ORIGIN || ''}${HUB}`, {
        transport: HttpTransportType.WebSockets,
        skipNegotiation: true,
        accessTokenFactory: () => useAuthStore.getState().jwt || '',
      })
      .withAutomaticReconnect([...NET.RECONNECT_DELAYS_MS])
      .configureLogging(LogLevel.None).build();
    for (const event of Object.values(S2C)) this.connection.on(event, payload => this.receive(event, payload));
    this.connection.onreconnecting(() => { this.suspend(); this.status('reconnecting'); });
    this.connection.onreconnected(() => { void this.authenticate().catch(() => this.fail('Не удалось повторно авторизоваться. Войдите заново.')); });
    this.connection.onclose(() => { this.suspend(); this.status('offline'); });
  }
  /** <summary>Initial failures remain retryable from the lobby; auto-reconnect handles established connections.</summary> */
  async connect(token: string) {
    this.credentials = { token };
    const epoch = ++this.epoch;
    this.status('connecting');
    this.armDeadline();
    try {
      await this.connection.start();
      if (epoch !== this.epoch) return;
      await this.authenticate();
    } catch {
      if (epoch === this.epoch) this.fail('Сервер недоступен или сессия истекла. Проверьте вход в аккаунт и повторите попытку.');
    }
  }
  /** <summary>Auth is always the first invocation on a newly established connection.</summary> */
  private async authenticate() {
    if (!this.credentials) return;
    this.authenticated = false; this.ready = false; this.sentPose = '';
    this.status('authenticating'); this.armDeadline();
    await this.connection.invoke(C2S.AUTH, this.credentials);
  }
  private armDeadline() {
    clearTimeout(this.authDeadline);
    this.authDeadline = setTimeout(() => this.fail('Сервер не прислал подтверждение входа и полный снимок состояния.'), UI.CONNECTION_TIMEOUT_MS);
  }
  /** <summary>Only AuthOk followed by StateSnapshot unlocks game commands.</summary> */
  private receive<K extends keyof Events>(event: K, payload: Events[K]) {
    if (event === S2C.AUTH_ERR) { this.emit(event, payload); this.suspend(); void this.connection.stop(); return; }
    if (event === S2C.AUTH_OK) { this.authenticated = true; this.status('syncing'); }
    if (event !== S2C.AUTH_OK && !this.authenticated) return;
    if (event === S2C.STATE_SNAPSHOT) {
      const snapshot = payload as Events[typeof S2C.STATE_SNAPSHOT];
      const me = snapshot.players.find(p => p.id === snapshot.me.id);
      if (me) this.syncPose(me.pose);
      this.emit(event, payload);
      clearTimeout(this.authDeadline); this.ready = true; this.status('ready'); this.startTimers();
      return;
    }
    this.emit(event, payload);
  }
  /** <summary>One DTO per method; StartGame retains the contract's explicit no-argument exception.</summary> */
  async send<K extends keyof Commands>(method: K, payload: Commands[K]) {
    if (!this.ready || method === C2S.AUTH) throw new Error('Дождитесь подключения и восстановления сессии.');
    await (payload === undefined ? this.connection.invoke(method) : this.connection.invoke(method, payload));
  }
  setPose(position: Vec3, yaw: number, pitch: number) {
    if (![position.x, position.y, position.z, yaw, pitch].every(Number.isFinite)) return;
    this.pose = { position, yaw, pitch: Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch)) };
  }
  syncPose(pose: Pose) { this.pose = { position: pose.position, yaw: pose.yaw, pitch: pose.pitch }; this.seq = Math.max(this.seq, pose.seq); this.sentPose = ''; }
  private startTimers() {
    this.timers.forEach(clearInterval);
    this.timers = [
      setInterval(() => { void this.send(C2S.PING, { t: Date.now() }).catch(() => {}); }, NET.PING_INTERVAL_MS),
      setInterval(() => { void this.flushPose(); }, 1000 / NET.POSE_HZ),
    ];
  }
  /** <summary>Send the latest changed pose, without queuing obsolete camera frames.</summary> */
  private async flushPose() {
    const key = JSON.stringify(this.pose);
    if (!this.ready || this.poseBusy || key === this.sentPose) return;
    this.poseBusy = true;
    try { await this.send(C2S.SEND_POSE, { ...this.pose, seq: ++this.seq }); this.sentPose = key; }
    catch { /* A later tick or reconnect retries the current pose. */ }
    finally { this.poseBusy = false; }
  }
  private suspend() {
    this.ready = false; this.authenticated = false;
    clearTimeout(this.authDeadline); this.timers.forEach(clearInterval); this.timers = [];
  }
  private fail(message: string) {
    this.epoch++; this.suspend(); this.status('offline');
    this.emit(S2C.SERVER_ERROR, { code: 'AUTH_REQUIRED', message });
    void this.connection.stop();
  }
  async disconnect() {
    this.epoch++; this.credentials = null; this.suspend(); await this.connection.stop(); this.status('offline');
  }
}
