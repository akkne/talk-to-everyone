import { HubConnection, HubConnectionBuilder, HttpTransportType, LogLevel } from '@microsoft/signalr';
import { C2S, HUB, NET, S2C } from '../shared/contract';
import { UI } from '../shared/config';
import type { Commands, EventHandler, Events, GameClient } from '../shared/types';
import type { ConnectionStatus } from '../store/gameStore';

/** <summary>Authenticated WebSocket transport. Tokens remain only in memory and the Auth DTO.</summary> */
export class SignalRClient implements GameClient {
  private readonly connection: HubConnection;
  private credentials: Commands[typeof C2S.AUTH] | null = null;
  private authenticated = false;
  private ready = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private authDeadline?: ReturnType<typeof setTimeout>;
  private camera: Commands[typeof C2S.SEND_CAMERA] = { yaw: 0, pitch: 0 };
  private sentCamera = '';
  private cameraBusy = false;
  private epoch = 0;

  constructor(private readonly emit: EventHandler, private readonly status: (status: ConnectionStatus) => void) {
    this.connection = new HubConnectionBuilder()
      .withUrl(`${import.meta.env.VITE_HUB_ORIGIN || ''}${HUB}`, { transport: HttpTransportType.WebSockets, skipNegotiation: true })
      .withAutomaticReconnect([...NET.RECONNECT_DELAYS_MS])
      .configureLogging(LogLevel.None).build();
    for (const event of Object.values(S2C)) this.connection.on(event, payload => this.receive(event, payload));
    this.connection.onreconnecting(() => { this.suspend(); this.status('reconnecting'); });
    this.connection.onreconnected(() => { void this.authenticate().catch(() => this.fail('Не удалось повторно авторизоваться. Войдите заново.')); });
    this.connection.onclose(() => { this.suspend(); this.status('offline'); });
  }
  /** <summary>Initial failures remain retryable from the lobby; auto-reconnect handles established connections.</summary> */
  async connect(token: string, name: string) {
    this.credentials = { token, name };
    const epoch = ++this.epoch;
    this.status('connecting');
    this.armDeadline();
    try {
      await this.connection.start();
      if (epoch !== this.epoch) return;
      await this.authenticate();
    } catch {
      if (epoch === this.epoch) this.fail('Сервер недоступен. Проверьте адрес, запуск бэкенда и токен, затем повторите вход.');
    }
  }
  /** <summary>Auth is always the first invocation on a newly established connection.</summary> */
  private async authenticate() {
    if (!this.credentials) return;
    this.authenticated = false; this.ready = false; this.sentCamera = '';
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
  setCamera(yaw: number, pitch: number) {
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
    const clamp = (v: number) => Math.max(-UI.CAMERA_LIMIT, Math.min(UI.CAMERA_LIMIT, v));
    this.camera = { yaw: clamp(yaw), pitch: clamp(pitch) };
  }
  private startTimers() {
    this.timers.forEach(clearInterval);
    this.timers = [
      setInterval(() => { void this.send(C2S.PING, { t: Date.now() }).catch(() => {}); }, NET.PING_INTERVAL_MS),
      setInterval(() => { void this.flushCamera(); }, 1000 / NET.CAMERA_HZ),
    ];
  }
  /** <summary>Send the latest changed pose, without queuing obsolete camera frames.</summary> */
  private async flushCamera() {
    const key = `${this.camera.yaw}:${this.camera.pitch}`;
    if (!this.ready || this.cameraBusy || key === this.sentCamera) return;
    this.cameraBusy = true;
    try { await this.send(C2S.SEND_CAMERA, { ...this.camera }); this.sentCamera = key; }
    catch { /* A later tick or reconnect retries the current pose. */ }
    finally { this.cameraBusy = false; }
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
