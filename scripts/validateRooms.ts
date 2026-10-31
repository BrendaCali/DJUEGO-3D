import assert from 'node:assert/strict';
import { ROOM_CONFIG, nextPrice, rank, settle } from '../src/rooms/roomRules';
import { RoomClient } from '../src/rooms/roomClient';
import { SHELTER_CONFIG, addDemoDuels, emptyShelter, recordDuel, resolveChallenge, stagesDone } from '../src/shelter/shelterRules';

let checks = 0;
const ok = (c: unknown, m: string) => {
  checks++;
  assert.ok(c, m);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Duelo ----
const duel = settle([{ id: 'w', done: 9 }, { id: 'l', done: 4 }], 10);
ok(duel.payouts.w === 19 && duel.operation === 0.5 && duel.shelter === 0.5, 'Duelo de 10: ganador 19, operación 0,5, refugio 0,5');
ok(duel.payouts.w + duel.operation + duel.shelter === duel.pot && duel.pot === 20, 'Todo lo aportado queda repartido (20)');
ok(duel.net.w === 9 && duel.net.l === -10, 'Neto: +9 al ganador y -10 al perdedor');
const voided = settle([{ id: 'a', done: 0 }, { id: 'b', done: 0 }], 10);
ok(!voided.valid && voided.payouts.a === 10 && voided.shelter === 0, 'Un duelo sin retos se anula y devuelve las entradas');
ok(nextPrice(1, duel, 2) !== 1 && nextPrice(1, voided, 2) === 1, 'El precio solo se mueve con duelos válidos');
ok(ROOM_CONFIG.maxPlayers === 2, 'Los duelos son de dos jugadores');
ok(
  rank([{ id: 'a', done: 3, at: 5 }, { id: 'b', done: 4, at: 9 }, { id: 'c', done: 4, at: 2 }]).map((p) => p.id).join('') === 'cba',
  'Ranking por retos y desempate por tiempo',
);
for (const entry of ROOM_CONFIG.entryOptions) {
  const st = settle([{ id: 'x', done: 9 }, { id: 'y', done: 1 }], entry);
  ok(Math.abs(st.payouts.x + st.operation + st.shelter - entry * 2) < 1e-9, `Conservación del pozo con entrada ${entry}`);
}

// ---- Refugio: ciclo completo ----
let sh = emptyShelter();
ok(sh.duels === SHELTER_CONFIG.seedDuels && sh.pool === null, 'El refugio arranca por debajo de la meta');
sh = recordDuel(sh, voided);
ok(sh.duels === SHELTER_CONFIG.seedDuels, 'Un duelo anulado no suma');
const fund0 = sh.fund;
sh = recordDuel(sh, duel);
ok(sh.duels === SHELTER_CONFIG.seedDuels + 1 && Math.abs(sh.fund - fund0 - 0.5) < 1e-9 && sh.realDuels === 1, 'Cada duelo válido suma 1 rescate y 0,5 al fondo');
while (sh.pool === null) sh = recordDuel(sh, duel);
ok(sh.duels === 100 && sh.pool === 50 && sh.fund === 50, '100 duelos válidos reúnen 50 DINO y abren el desafío');
sh = recordDuel(sh, duel);
ok(sh.pool === 50 && sh.fund === 50.5, 'Lo que llega después no cambia los premios publicados');
const lvTime = 210;
const win = resolveChallenge(sh, lvTime, 40, 0)!;
ok(win.place === 1 && win.prize === 25, 'Primer puesto: 50 % del fondo (25)');
ok(win.rows.reduce((a, r) => a + r.prize, 0) <= 50 + 1e-9, 'Los premios nunca superan el fondo reservado');
ok(win.state.pool === null && win.state.cycle === 2 && win.state.fund === 0.5 && win.state.duels === 1, 'El fondo se reparte una sola vez y empieza otro ciclo');
ok(resolveChallenge(win.state, lvTime, 40, 0) === null, 'Sin meta alcanzada no hay desafío');
const slow = resolveChallenge(sh, lvTime, 200, 2)!;
ok(slow.place === 4 && slow.prize === 0, 'Quien es más lento que todos no cobra');
ok(stagesDone(emptyShelter()) === 3 && stagesDone(sh) === 4, 'Etapas visuales según el progreso real');
ok(addDemoDuels(emptyShelter(), 5).pool === 50, 'El modo desarrollo puede acelerar la demostración');

// ---- Salas en red local ----
const times = Array(9).fill(1);
const host = new RoomClient({ id: 'h', name: 'Host' }, times, () => {});
const guest = new RoomClient({ id: 'g', name: 'Guest' }, times, () => {});
host.create(25, 2);
guest.join(host.state!.code);
await wait(150);
ok(guest.state?.code === host.state!.code && host.state!.players.length === 2, 'Un invitado entra con el código del duelo');
const stranger = new RoomClient({ id: 'x', name: 'X' }, times, () => {});
stranger.join('ZZZZZ');
await wait(2300);
ok(!stranger.state && !!stranger.error, 'Un código inexistente da error');
host.addBot();
ok(host.state!.players.length === 2, 'El duelo no admite un tercero');
host.start();
await wait(150);
ok(guest.state?.status === 'racing', 'El invitado ve que el duelo empieza');
for (let i = 1; i <= 9; i++) guest.reportDone(i);
await wait(150);
ok(host.state!.players.find((p) => p.id === 'g')!.done === 9, 'El anfitrión recibe el progreso del invitado');
host.reportDone(9);
await wait(150);
ok(guest.state?.status === 'finished' && guest.state.result!.ranking[0] === 'g' && guest.state.result!.valid, 'El duelo termina y el primero en acabar gana');
[host, guest, stranger].forEach((c) => c.dispose());
console.log(`✔ ${checks} comprobaciones de duelos y refugio superadas`);
