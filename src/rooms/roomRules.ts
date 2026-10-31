/**
 * Reglas de los duelos (DEMOSTRATIVAS: solo DINO de prueba).
 * Módulo independiente del juego y de la red; se puede sustituir por una lógica real.
 *
 * Duelo: dos jugadores aportan la misma entrada, que queda bloqueada antes de empezar.
 * El pozo se reparte así: comisión de operación + aporte al refugio comunitario (ambas
 * anunciadas) y el resto, al ganador. Con entrada 10: 19 / 0,5 / 0,5.
 */

export const ROOM_CONFIG = {
  minPlayers: 2,
  maxPlayers: 2,
  entryOptions: [10, 25, 50],
  /** Parte del pozo que se queda el proyecto (operación). */
  operationRate: 0.025,
  /** Parte del pozo que va al refugio comunitario. */
  shelterRate: 0.025,
  basePrice: 1,
  minPrice: 0.2,
  maxPrice: 20,
  /** Subida del precio por cada 1 % del pozo que sale en comisiones, por jugador por encima de 1. */
  upPerBurnPct: 0.012,
  /** Bajada del precio por cada jugador que sale perdiendo. */
  downPerLoser: 0.03,
  /** Segundos que tiene el rival tras terminar el primero. */
  graceSec: 90,
  faucet: 100,
} as const;

export interface Standing {
  id: string;
  /** Retos completados (0–9). */
  done: number;
  /** Instante (ms) en que completó su último reto. */
  at: number;
}

/** Orden: más retos primero; a igualdad, quien llegó antes. */
export const rank = <T extends Standing>(list: T[]): T[] =>
  [...list].sort((a, b) => b.done - a.done || a.at - b.at);

export interface Settlement {
  pot: number;
  /** Total de comisiones (operación + refugio). */
  burned: number;
  operation: number;
  shelter: number;
  payouts: Record<string, number>;
  /** Cambio neto de cada jugador (pago − entrada). */
  net: Record<string, number>;
  losers: number;
  /** false si nadie completó ningún reto: se devuelven las entradas y no cuenta como duelo. */
  valid: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function settle(ranked: { id: string; done: number }[], entry: number): Settlement {
  const pot = r2(entry * ranked.length);
  const payouts: Record<string, number> = {};
  const net: Record<string, number> = {};
  if (ranked.length < 2 || ranked[0].done <= 0) {
    ranked.forEach((p) => {
      payouts[p.id] = entry;
      net[p.id] = 0;
    });
    return { pot, burned: 0, operation: 0, shelter: 0, payouts, net, losers: 0, valid: false };
  }
  const operation = r2(pot * ROOM_CONFIG.operationRate);
  const shelter = r2(pot * ROOM_CONFIG.shelterRate);
  const win = r2(pot - operation - shelter);
  ranked.forEach((p, i) => {
    payouts[p.id] = i === 0 ? win : 0;
    net[p.id] = r2(payouts[p.id] - entry);
  });
  return { pot, burned: r2(operation + shelter), operation, shelter, payouts, net, losers: ranked.length - 1, valid: true };
}

/** Sube con las comisiones, baja con cada jugador que pierde. */
export function nextPrice(price: number, s: Settlement, players: number): number {
  if (!s.valid) return price;
  const burnPct = (s.burned / s.pot) * 100;
  const up = burnPct * ROOM_CONFIG.upPerBurnPct * (players - 1);
  const down = s.losers * ROOM_CONFIG.downPerLoser;
  const p = price * (1 + up - down);
  return Math.round(Math.min(ROOM_CONFIG.maxPrice, Math.max(ROOM_CONFIG.minPrice, p)) * 1000) / 1000;
}
