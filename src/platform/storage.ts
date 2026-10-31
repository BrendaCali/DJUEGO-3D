import { emptyLedger } from '../rewards/rewardRules';
import type { RewardLedger } from '../rewards/rewardRules';

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
}

const KEY = 'dino-escape-prototype-v1';

export const defaultSaved = (): Saved => ({
  version: 1,
  ledger: emptyLedger(),
  completed: {},
  prefs: { sound: true, volume: 0.6, reduceMotion: false, dev: false, seenHelp: false },
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
