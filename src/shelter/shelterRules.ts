/**
 * Refugio comunitario (DEMOSTRATIVO: solo DINO de prueba).
 * Módulo independiente: cada duelo válido aporta su parte al refugio; al llegar a la meta se
 * abre un desafío sin entrada cuyos premios salen únicamente de ese fondo, una sola vez.
 * Si la meta no se cumple, los tokens permanecen guardados.
 */
import type { Settlement } from '../rooms/roomRules';

export const SHELTER_CONFIG = {
  /** Duelos válidos para abrir un desafío comunitario. */
  goalDuels: 100,
  /** Duelos de demostración con los que arranca el contador (no son jugadores reales). */
  seedDuels: 95,
  /** Aporte por duelo de la entrada de ejemplo (10 DINO): 0,5. */
  seedContribution: 0.5,
  /** Reparto publicado del fondo entre los puestos 1, 2 y 3. */
  prizeSplit: [0.5, 0.3, 0.2],
  /** Rivales de demostración: fracción del tiempo del nivel que tardan. */
  rivalFractions: [0.3, 0.5, 0.7],
  rivalNames: ['Rexy (demo)', 'Dina (demo)', 'Tri (demo)'],
  /** Segundos que suma cada intento fallido a la puntuación del desafío. */
  failPenaltySec: 15,
  /** Nivel de cada ciclo del desafío, en rotación. */
  challengeLevels: [4, 5, 6],
  stages: ['Terreno', 'Plantas', 'Nidos', 'Dinosaurios'],
} as const;

export interface ShelterEvent {
  cycle: number;
  place: number;
  prize: number;
  pool: number;
  level: number;
}

export interface ShelterState {
  cycle: number;
  /** Duelos válidos del ciclo actual (incluye los de demostración iniciales). */
  duels: number;
  /** Tokens de prueba guardados en el refugio. */
  fund: number;
  /** Total de comisiones de operación acumuladas (informativo). */
  operation: number;
  /** Duelos jugados de verdad en este navegador. */
  realDuels: number;
  /** Fondo reservado para el desafío abierto (null = aún no se alcanza la meta). */
  pool: number | null;
  history: ShelterEvent[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const emptyShelter = (): ShelterState => ({
  cycle: 1,
  duels: SHELTER_CONFIG.seedDuels,
  fund: r2(SHELTER_CONFIG.seedDuels * SHELTER_CONFIG.seedContribution),
  operation: 0,
  realDuels: 0,
  pool: null,
  history: [],
});

/** Si se alcanzó la meta y no hay desafío abierto, reserva el fondo para sus premios. */
function unlock(s: ShelterState): ShelterState {
  return s.pool === null && s.duels >= SHELTER_CONFIG.goalDuels ? { ...s, pool: r2(s.fund) } : s;
}

/** Un duelo válido suma su aporte al refugio y un rescate al contador. */
export function recordDuel(s: ShelterState, settlement: Settlement): ShelterState {
  if (!settlement.valid) return s;
  return unlock({
    ...s,
    duels: s.duels + 1,
    realDuels: s.realDuels + 1,
    fund: r2(s.fund + settlement.shelter),
    operation: r2(s.operation + settlement.operation),
  });
}

/** Solo para el modo desarrollo: suma duelos de demostración (no cuentan como duelos jugados). */
export function addDemoDuels(s: ShelterState, n: number): ShelterState {
  return unlock({
    ...s,
    duels: s.duels + n,
    fund: r2(s.fund + n * SHELTER_CONFIG.seedContribution),
  });
}

export const shelterProgress = (s: ShelterState) => Math.min(1, s.duels / SHELTER_CONFIG.goalDuels);

/** Etapas completadas (0–4): terreno, plantas, nidos y dinosaurios protegidos. */
export const stagesDone = (s: ShelterState) => Math.floor(shelterProgress(s) * SHELTER_CONFIG.stages.length + 1e-9);

export const challengeLevelId = (s: ShelterState) =>
  SHELTER_CONFIG.challengeLevels[(s.cycle - 1) % SHELTER_CONFIG.challengeLevels.length];

export interface ChallengeRow {
  name: string;
  score: number;
  place: number;
  prize: number;
  you: boolean;
}

export interface ChallengeOutcome {
  state: ShelterState;
  place: number;
  prize: number;
  rows: ChallengeRow[];
}

/**
 * Cierra el desafío abierto. Puntuación = segundos usados + penalización por intento fallido;
 * en empate gana el rival. El fondo reservado se reparte una sola vez con `prizeSplit`
 * (redondeado hacia abajo), así que nunca se entrega más de lo disponible.
 */
export function resolveChallenge(s: ShelterState, levelTimeSec: number, usedSec: number, failed: number): ChallengeOutcome | null {
  if (s.pool === null) return null;
  const pool = s.pool;
  const mine = usedSec + failed * SHELTER_CONFIG.failPenaltySec;
  const entries = [
    ...SHELTER_CONFIG.rivalFractions.map((f, i) => ({ name: SHELTER_CONFIG.rivalNames[i], score: Math.round(levelTimeSec * f), you: false })),
    { name: 'Tú', score: Math.round(mine), you: true },
  ].sort((a, b) => a.score - b.score || Number(a.you) - Number(b.you));
  const rows: ChallengeRow[] = entries.map((e, i) => ({
    ...e,
    place: i + 1,
    prize: Math.floor(pool * (SHELTER_CONFIG.prizeSplit[i] ?? 0) * 100) / 100,
  }));
  const you = rows.find((r) => r.you)!;
  const next = unlock({
    ...s,
    cycle: s.cycle + 1,
    duels: Math.max(0, s.duels - SHELTER_CONFIG.goalDuels),
    fund: r2(s.fund - pool),
    pool: null,
    history: [...s.history, { cycle: s.cycle, place: you.place, prize: you.prize, pool, level: challengeLevelId(s) }].slice(-10),
  });
  return { state: next, place: you.place, prize: you.prize, rows };
}
