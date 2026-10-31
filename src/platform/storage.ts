import { emptyLedger } from '../rewards/rewardRules';
import type { RewardLedger } from '../rewards/rewardRules';
import { ROOM_CONFIG } from '../rooms/roomRules';
import { emptyShelter } from '../shelter/shelterRules';
import type { ShelterState } from '../shelter/shelterRules';

export interface Prefs {
  sound: boolean;
  volume: number;
  reduceMotion: boolean;
  dev: boolean;
  seenHelp: boolean;
}

export interface Saved {
  version: 1;
  ledger: RewardLedger;
  /** Mejor tiempo usado (segundos) por nivel completado. */
  completed: Record<number, { bestUsedSec: number }>;
  prefs: Prefs;
  /** Precio simulado del meme DINO de prueba y su historial. */
  market: { price: number; history: number[] };
  /** Salas ya liquidadas (evita cobrar dos veces). */
  settled: string[];
  name: string;
  shelter: ShelterState;
}

const KEY = 'dino-escape-prototype-v1';

/** Historial simulado y determinista que termina en el precio dado, para que el gráfico no empiece vacío. */
export function seedHistory(end: number, n = 32): number[] {
  const out = [end];
  let a = 12345;
  for (let i = 1; i < n; i++) {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    const r = (a / 0x7fffffff - 0.5) * 0.14;
    out.unshift(Math.max(ROOM_CONFIG.minPrice, Math.round(out[0] / (1 + r) * 1000) / 1000));
  }
  return out;
}

export const defaultSaved = (): Saved => ({
  version: 1,
  ledger: emptyLedger(),
  completed: {},
  prefs: { sound: true, volume: 0.6, reduceMotion: false, dev: false, seenHelp: false },
  market: { price: ROOM_CONFIG.basePrice, history: seedHistory(ROOM_CONFIG.basePrice) },
  settled: [],
  name: 'Dino' + Math.floor(100 + Math.random() * 900),
  shelter: emptyShelter(),
});

export function loadSaved(): Saved {
  const base = defaultSaved();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return withUrlFlags(base);
    const p = JSON.parse(raw) as Partial<Saved>;
    return withUrlFlags({
      version: 1,
      ledger: { ...base.ledger, ...(p.ledger ?? {}) },
      completed: p.completed ?? {},
      prefs: { ...base.prefs, ...(p.prefs ?? {}) },
      market: p.market && p.market.history.length >= 10 ? p.market : { price: p.market?.price ?? base.market.price, history: [...seedHistory(p.market?.price ?? base.market.price).slice(0, -1), ...(p.market?.history ?? [])] },
      settled: p.settled ?? [],
      name: p.name ?? base.name,
      shelter: p.shelter ? { ...base.shelter, ...p.shelter } : base.shelter,
    });
  } catch {
    return withUrlFlags(base);
  }
}

/** ?dev=1 abre el modo de desarrollo sin tocar los ajustes. */
function withUrlFlags(s: Saved): Saved {
  try {
    if (new URLSearchParams(location.search).get('dev') === '1') s.prefs.dev = true;
  } catch {
    /* sin acceso a location */
  }
  return s;
}

export function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function clearSaved() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
}
