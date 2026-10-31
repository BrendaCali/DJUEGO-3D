import { ROOM_CONFIG, rank, settle } from './roomRules';
import type { Settlement } from './roomRules';

export const TOTAL_LEVELS = 9;

export interface RoomPlayer {
  id: string;
  name: string;
  bot: boolean;
  done: number;
  at: number;
  /** Solo bots: instante en que completará su siguiente reto. */
  nextAt?: number;
  /** Solo bots: velocidad (fracción del tiempo del nivel que tardan). */
  pace?: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  entry: number;
  capacity: number;
  status: 'lobby' | 'racing' | 'finished';
  players: RoomPlayer[];
  startedAt: number;
  firstDoneAt: number | null;
  result: (Settlement & { ranking: string[] }) | null;
  version: number;
}

type Msg =
  | { t: 'who'; code: string }
  | { t: 'join'; code: string; player: RoomPlayer }
  | { t: 'leave'; code: string; id: string }
  | { t: 'progress'; code: string; id: string; done: number; at: number }
  | { t: 'state'; state: RoomState };

const CHANNEL = 'dino-escape-rooms-v1';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Rexy', 'Dina', 'Tri', 'Ptero', 'Anky', 'Bronto'];

export const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

/**
 * Cliente de sala. Un anfitrión es la autoridad (reparte el estado y mueve a los bots);
 * los invitados le envían su progreso. El transporte es BroadcastChannel, así que las
 * invitaciones funcionan entre pestañas/ventanas del mismo navegador. Para jugadores
 * remotos bastaría con sustituir `post` y la recepción por un servidor.
 */
export class RoomClient {
  state: RoomState | null = null;
  error: string | null = null;
  private ch: BroadcastChannel | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    readonly me: { id: string; name: string },
    private levelTimes: number[],
    private onChange: () => void,
  ) {
    try {
      this.ch = new BroadcastChannel(CHANNEL);
      this.ch.onmessage = (e: MessageEvent<Msg>) => this.receive(e.data);
    } catch {
      this.ch = null;
    }
  }

  get isHost() {
    return !!this.state && this.state.hostId === this.me.id;
  }

  private post(m: Msg) {
    this.ch?.postMessage(m);
  }

  private emit() {
    if (!this.disposed) this.onChange();
  }

  private commit() {
    if (!this.state) return;
    this.state = { ...this.state, version: this.state.version + 1 };
    this.post({ t: 'state', state: this.state });
    this.emit();
  }

  create(entry: number, capacity: number) {
    this.state = {
      code: newCode(),
      hostId: this.me.id,
      entry,
      capacity,
      status: 'lobby',
      players: [{ id: this.me.id, name: this.me.name, bot: false, done: 0, at: 0 }],
      startedAt: 0,
      firstDoneAt: null,
      result: null,
      version: 1,
    };
    this.timer = setInterval(() => this.tick(), 500);
    this.commit();
  }

  join(code: string) {
    code = code.trim().toUpperCase();
    this.error = null;
    this.post({ t: 'join', code, player: { id: this.me.id, name: this.me.name, bot: false, done: 0, at: 0 } });
    this.joinTimer = setTimeout(() => {
      if (!this.state) {
        this.error = this.ch ? 'No encuentro esa sala. Revisa el código y que el anfitrión tenga la sala abierta en este navegador.' : 'Este navegador no permite salas.';
        this.emit();
      }
    }, 2000);
  }

  addBot() {
    const s = this.state;
    if (!s || !this.isHost || s.status !== 'lobby' || s.players.length >= s.capacity) return;
    const used = new Set(s.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(`${n} 🤖`)) ?? `Bot${s.players.length}`;
    this.state = {
      ...s,
      players: [...s.players, { id: `bot-${Math.random().toString(36).slice(2, 7)}`, name: `${name} 🤖`, bot: true, done: 0, at: 0, pace: 0.2 + Math.random() * 0.25 }],
    };
    this.commit();
  }

  kick(id: string) {
    const s = this.state;
    if (!s || !this.isHost || s.status !== 'lobby' || id === this.me.id) return;
    this.state = { ...s, players: s.players.filter((p) => p.id !== id) };
    this.commit();
  }

  start() {
    const s = this.state;
    if (!s || !this.isHost || s.status !== 'lobby' || s.players.length < ROOM_CONFIG.minPlayers) return;
    const now = Date.now();
    this.state = {
      ...s,
      status: 'racing',
      startedAt: now,
      players: s.players.map((p) => (p.bot ? { ...p, nextAt: now + this.levelTimes[0] * 1000 * (p.pace ?? 0.3) } : p)),
    };
    this.commit();
  }

  /** Cada jugador informa cuántos retos lleva completados. */
  reportDone(done: number) {
    const s = this.state;
    if (!s) return;
    const at = Date.now();
    if (this.isHost) this.applyProgress(this.me.id, done, at);
    else this.post({ t: 'progress', code: s.code, id: this.me.id, done, at });
  }

  leave() {
    if (this.state && !this.isHost) this.post({ t: 'leave', code: this.state.code, id: this.me.id });
    this.dispose();
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.joinTimer) clearTimeout(this.joinTimer);
    this.ch?.close();
    this.ch = null;
  }

  // ---- internos ----
  private receive(m: Msg) {
    if (this.disposed) return;
    const s = this.state;
    if (m.t === 'state') {
      if (this.isHost) return;
      if (s ? s.code === m.state.code : m.state.players.some((p) => p.id === this.me.id)) {
        this.state = m.state;
        this.emit();
      }
      return;
    }
    if (!s || !this.isHost || m.code !== s.code) return;
    if (m.t === 'who') this.post({ t: 'state', state: s });
    else if (m.t === 'join') {
      if (s.status !== 'lobby' || s.players.length >= s.capacity) return;
      if (!s.players.some((p) => p.id === m.player.id)) {
        this.state = { ...s, players: [...s.players, m.player] };
      }
      this.commit();
    } else if (m.t === 'leave') {
      if (s.status === 'lobby') {
        this.state = { ...s, players: s.players.filter((p) => p.id !== m.id) };
        this.commit();
      }
    } else if (m.t === 'progress') this.applyProgress(m.id, m.done, m.at);
  }

  private applyProgress(id: string, done: number, at: number) {
    const s = this.state;
    if (!s || s.status !== 'racing') return;
    const p = s.players.find((q) => q.id === id);
    if (!p || done <= p.done) return;
    this.state = { ...s, players: s.players.map((q) => (q.id === id ? { ...q, done, at } : q)) };
    this.checkFinish();
    this.commit();
  }

  private tick() {
    const s = this.state;
    if (!s || s.status !== 'racing') return;
    const now = Date.now();
    let changed = false;
    const players = s.players.map((p) => {
      if (!p.bot || p.done >= TOTAL_LEVELS || !p.nextAt || now < p.nextAt) return p;
      changed = true;
      const done = p.done + 1;
      const nextT = this.levelTimes[done] ?? 0;
      return { ...p, done, at: now, nextAt: done >= TOTAL_LEVELS ? undefined : now + nextT * 1000 * (p.pace ?? 0.3) * (0.85 + Math.random() * 0.3) };
    });
    if (changed) this.state = { ...s, players };
    const was = this.state!.status;
    this.checkFinish(now);
    if (changed || this.state!.status !== was) this.commit();
  }

  private checkFinish(now = Date.now()) {
    const s = this.state!;
    if (s.status !== 'racing') return;
    let first = s.firstDoneAt;
    if (first === null && s.players.some((p) => p.done >= TOTAL_LEVELS)) first = now;
    const allDone = s.players.every((p) => p.done >= TOTAL_LEVELS);
    const expired = first !== null && now >= first + ROOM_CONFIG.graceSec * 1000;
    if (allDone || expired) {
      const ranked = rank(s.players);
      const res = settle(ranked, s.entry);
      this.state = { ...s, firstDoneAt: first, status: 'finished', result: { ...res, ranking: ranked.map((p) => p.id) } };
    } else this.state = { ...s, firstDoneAt: first };
  }
}
