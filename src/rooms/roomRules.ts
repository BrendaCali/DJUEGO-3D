/**
 * Reglas de las salas competitivas (DEMOSTRATIVAS: solo DINO de prueba).
 * Módulo independiente del juego y de la red; se puede sustituir por una lógica real.
 */

export const ROOM_CONFIG = {
  minPlayers: 2,
  maxPlayers: 4,
  entryOptions: [10, 25, 50],
  /** Parte del pozo que se quema / pasa al fondo del meme. */
  feeRate: 0.1,
  /** Reparto del pozo neto por puesto, según cuántos jugadores hay (suma 1). */
  podium: {
    2: [0.78, 0.22],
    3: [0.61, 0.28, 0.11],
    4: [0.5, 0.28, 0.17, 0.05],
  } as Record<number, number[]>,
  basePrice: 1,
  minPrice: 0.2,
  maxPrice: 20,
  /** Subida del precio por cada 1 % del pozo quemado, por jugador por encima de 1. */
  upPerBurnPct: 0.012,
  /** Bajada del precio por cada jugador que sale perdiendo. */
  downPerLoser: 0.03,
  /** Segundos que tienen los demás tras terminar el primero. */
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
  burned: number;
  payouts: Record<string, number>;
  /** Cambio neto de cada jugador (pago − entrada). */
  net: Record<string, number>;
  losers: number;
}

export function settle(ranked: { id: string }[], entry: number): Settlement {
  const n = ranked.length;
  const pot = entry * n;
  const burned = Math.round(pot * ROOM_CONFIG.feeRate * 100) / 100;
  const net_pot = pot - burned;
  const shares = ROOM_CONFIG.podium[n] ?? ROOM_CONFIG.podium[4];
  const payouts: Record<string, number> = {};
  const net: Record<string, number> = {};
  let losers = 0;
  ranked.forEach((p, i) => {
    const pay = Math.round(net_pot * (shares[i] ?? 0) * 100) / 100;
    payouts[p.id] = pay;
    net[p.id] = Math.round((pay - entry) * 100) / 100;
    if (pay < entry) losers++;
  });
  return { pot, burned, payouts, net, losers };
}

/** Sube con lo quemado, baja con cada jugador que pierde. */
export function nextPrice(price: number, s: Settlement, players: number): number {
  const burnPct = (s.burned / s.pot) * 100;
  const up = burnPct * ROOM_CONFIG.upPerBurnPct * (players - 1);
  const down = s.losers * ROOM_CONFIG.downPerLoser;
  const p = price * (1 + up - down);
  return Math.round(Math.min(ROOM_CONFIG.maxPrice, Math.max(ROOM_CONFIG.minPrice, p)) * 1000) / 1000;
}
