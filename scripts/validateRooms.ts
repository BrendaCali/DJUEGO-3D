import assert from 'node:assert/strict';
import { ROOM_CONFIG, nextPrice, rank, settle } from '../src/rooms/roomRules';
import { RoomClient } from '../src/rooms/roomClient';

let checks = 0;
const ok = (c: unknown, m: string) => {
  checks++;
  assert.ok(c, m);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const n of [2, 3, 4]) {
  ok(Math.abs(ROOM_CONFIG.podium[n].reduce((a, b) => a + b, 0) - 1) < 1e-9, `El podio de ${n} suma 100 %`);
  const ids = Array.from({ length: n }, (_, i) => ({ id: 'p' + i }));
  const st = settle(ids, 50);
  const paid = Object.values(st.payouts).reduce((a, b) => a + b, 0);
  ok(Math.abs(paid + st.burned - st.pot) < 0.05, `Pozo = pagos + quemado (${n} jugadores)`);
  ok(st.payouts.p0 > st.payouts.p1, 'El primero cobra más que el segundo');
  ok(st.net.p0 > 0 && st.net[`p${n - 1}`] < 0, 'Unos ganan y otros pierden');
  const up = nextPrice(1, { ...st, losers: 0 }, n);
  const down = nextPrice(1, { ...st, burned: 0, losers: n - 1 }, n);
  ok(up > 1 && down < 1, 'El precio sube con lo quemado y baja con las pérdidas');
}
ok(
  rank([{ id: 'a', done: 3, at: 5 }, { id: 'b', done: 4, at: 9 }, { id: 'c', done: 4, at: 2 }]).map((p) => p.id).join('') === 'cba',
  'Ranking por retos y desempate por tiempo',
);

const times = Array(9).fill(1);
const host = new RoomClient({ id: 'h', name: 'Host' }, times, () => {});
const guest = new RoomClient({ id: 'g', name: 'Guest' }, times, () => {});
host.create(25, 3);
guest.join(host.state!.code);
await wait(150);
ok(guest.state?.code === host.state!.code && host.state!.players.length === 2, 'Un invitado entra con el código de la sala');
const stranger = new RoomClient({ id: 'x', name: 'X' }, times, () => {});
stranger.join('ZZZZZ');
await wait(2300);
ok(!stranger.state && !!stranger.error, 'Un código inexistente da error');
host.addBot();
host.addBot();
ok(host.state!.players.length === 3, 'La sala respeta su capacidad');
host.start();
await wait(150);
ok(guest.state?.status === 'racing', 'El invitado ve que la carrera empieza');
for (let i = 1; i <= 9; i++) guest.reportDone(i);
await wait(150);
ok(host.state!.players.find((p) => p.id === 'g')!.done === 9, 'El anfitrión recibe el progreso del invitado');
host.state!.players.forEach((p) => p.bot && ((p.done = 9), (p.at = Date.now() + 1e6)));
host.reportDone(9);
await wait(150);
ok(guest.state?.status === 'finished' && guest.state.result!.ranking[0] === 'g', 'La sala termina y el primero en acabar gana');
[host, guest, stranger].forEach((c) => c.dispose());
console.log(`✔ ${checks} comprobaciones de salas superadas`);
