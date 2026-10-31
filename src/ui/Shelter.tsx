import { DinoArt } from './art';
import { addDemoDuels, challengeLevelId, SHELTER_CONFIG, shelterProgress, stagesDone } from '../shelter/shelterRules';
import type { ChallengeOutcome, ShelterState } from '../shelter/shelterRules';
import { getLevel } from '../levels';
import { fmtTime } from './Game';
import { FeeTable } from './Room';
import type { Saved } from '../platform/storage';

const fmt = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 2 });

interface Item {
  at: number;
  kind: 'ground' | 'plant' | 'nest' | 'dino';
  x: number;
  y: number;
  i: number;
}

/** Cada elemento aparece cuando el progreso real del fondo alcanza su umbral. */
const ITEMS: Item[] = [
  ...Array.from({ length: 6 }, (_, i): Item => ({ kind: 'ground', at: ((i + 1) / 6) * 0.25, x: 55 + i * 98, y: 222, i })),
  ...Array.from({ length: 6 }, (_, i): Item => ({ kind: 'plant', at: 0.25 + ((i + 1) / 6) * 0.25, x: 40 + i * 104, y: 214, i })),
  ...Array.from({ length: 4 }, (_, i): Item => ({ kind: 'nest', at: 0.5 + ((i + 1) / 4) * 0.25, x: 110 + i * 125, y: 228, i })),
  ...Array.from({ length: 4 }, (_, i): Item => ({ kind: 'dino', at: 0.75 + ((i + 1) / 4) * 0.25, x: 100 + i * 135, y: 190, i })),
];

export function ShelterScene({ progress }: { progress: number }) {
  return (
    <svg viewBox="0 0 600 270" width="100%" role="img" aria-label={`Refugio reconstruido al ${Math.round(progress * 100)} %`} className="shelter-scene">
      <rect width="600" height="270" fill="#bfe6f5" rx="12" />
      <circle cx="520" cy="46" r="26" fill="#ffd36b" />
      <path d="M0 200 Q150 150 300 190 T600 175 V270 H0 Z" fill="#a9c98a" opacity="0.35" />
      {ITEMS.map((it) => {
        const on = progress + 1e-9 >= it.at;
        return (
          <g key={`${it.kind}${it.i}`} className={`s-item ${on ? 'on' : 'off'}`} transform={`translate(${it.x} ${it.y})`}>
            {it.kind === 'ground' && <ellipse rx="62" ry="15" fill="#6fae4a" stroke="#4b8a32" strokeWidth="2" />}
            {it.kind === 'plant' && (
              <g>
                <rect x="-3" y="-34" width="6" height="34" fill="#8a5a2b" rx="2" />
                <ellipse cx="-12" cy="-38" rx="16" ry="7" fill="#2f8a3c" transform="rotate(-25 -12 -38)" />
                <ellipse cx="12" cy="-38" rx="16" ry="7" fill="#3da24c" transform="rotate(25 12 -38)" />
                <ellipse cx="0" cy="-44" rx="7" ry="14" fill="#2f8a3c" />
              </g>
            )}
            {it.kind === 'nest' && (
              <g>
                <ellipse rx="30" ry="10" fill="#9b6a37" stroke="#6b4423" strokeWidth="2" />
                <ellipse cx="-8" cy="-7" rx="7" ry="9" fill="#fff6dc" stroke="#b79b62" />
                <ellipse cx="8" cy="-7" rx="7" ry="9" fill="#fff6dc" stroke="#b79b62" />
              </g>
            )}
            {it.kind === 'dino' && (
              <g transform={`scale(${it.i % 2 ? -0.62 : 0.62} 0.62)`}>
                <DinoArt dino={it.i % 2 ? 'orange' : 'green'} mood="happy" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

interface Props {
  saved: Saved;
  setSaved: (f: (s: Saved) => Saved) => void;
  dev: boolean;
  outcome: ChallengeOutcome | null;
  onDismissOutcome: () => void;
  onPlayChallenge: () => void;
  onDuel: () => void;
  onBack: () => void;
}

export function ShelterScreen({ saved, setSaved, dev, outcome, onDismissOutcome, onPlayChallenge, onDuel, onBack }: Props) {
  const sh: ShelterState = saved.shelter;
  const p = shelterProgress(sh);
  const done = stagesDone(sh);
  const open = sh.pool !== null;
  const lvl = getLevel(challengeLevelId(sh))!;
  const left = Math.max(0, SHELTER_CONFIG.goalDuels - sh.duels);
  const pool = sh.pool ?? sh.fund;
  return (
    <main className="shelter">
      <div className="levels-head">
        <button className="btn ghost" onClick={onBack}>← Inicio</button>
        <h2>Refugio comunitario <span className="sim-tag">DINO de prueba</span></h2>
      </div>
      <p className="muted">Cada duelo válido aporta su parte al refugio y suma un rescate. Al llegar a la meta se abre un desafío sin entrada cuyos premios salen solo de ese fondo, una sola vez. Si la meta no se cumple, los tokens permanecen guardados.</p>

      {outcome && (
        <section className="card-plain outcome" role="status">
          <h3>Desafío comunitario cerrado · quedaste {outcome.place}.º</h3>
          <ol className="podium">
            {outcome.rows.map((r) => (
              <li key={r.name} className={r.you ? 'me' : ''}>
                <span className="pos">{r.place}.º</span>
                <span className="who">{r.name}</span>
                <span className="tiny">{fmtTime(r.score)}</span>
                <strong>{r.prize > 0 ? `+${fmt(r.prize)}` : '—'}</strong>
              </li>
            ))}
          </ol>
          <p className="tiny">
            {outcome.prize > 0 ? `Cobraste ${fmt(outcome.prize)} DINO de prueba del fondo.` : 'Esta vez no entraste al reparto.'} Los rivales marcados «demo» son simulados. El fondo se repartió una sola vez y empieza otro ciclo.
          </p>
          <button className="btn small" onClick={onDismissOutcome}>Cerrar</button>
        </section>
      )}

      <div className="shelter-grid">
        <section className="card-plain wide">
          <ShelterScene progress={p} />
          <ol className="stages" aria-label="Etapas de reconstrucción">
            {SHELTER_CONFIG.stages.map((st, i) => (
              <li key={st} className={i < done ? 'ok' : i === done ? 'now' : ''}>{i < done ? '✔' : i + 1}. {st}</li>
            ))}
          </ol>
          <div className="meter big" role="progressbar" aria-valuemin={0} aria-valuemax={SHELTER_CONFIG.goalDuels} aria-valuenow={sh.duels} aria-label="Rescates del ciclo">
            <i style={{ width: `${p * 100}%` }} />
          </div>
          <p>
            Ciclo {sh.cycle} · <strong>{Math.min(sh.duels, SHELTER_CONFIG.goalDuels)}</strong> / {SHELTER_CONFIG.goalDuels} rescates · fondo guardado: <strong>{fmt(sh.fund)}</strong> DINO de prueba
          </p>
          <p className="tiny">
            Arrancó con {SHELTER_CONFIG.seedDuels} rescates de demostración (simulados). Duelos que has jugado tú: {sh.realDuels}. Comisiones de operación acumuladas por tus duelos: {fmt(sh.operation)}.
          </p>
          {dev && (
            <button className="btn small" onClick={() => setSaved((s) => ({ ...s, shelter: addDemoDuels(s.shelter, 5) }))}>
              DEV: +5 duelos de demostración
            </button>
          )}
        </section>

        <section className="card-plain">
          <h3>Desafío comunitario</h3>
          {open ? (
            <>
              <p><strong>¡Abierto!</strong> Sin entrada · nivel {lvl.id}: {lvl.name} ({fmtTime(lvl.timeSec)}).</p>
              <table className="fee-table" aria-label="Reparto publicado de premios">
                <caption>Reparto publicado del fondo ({fmt(pool)} DINO de prueba)</caption>
                <tbody>
                  {SHELTER_CONFIG.prizeSplit.map((s, i) => (
                    <tr key={i}><th>{i + 1}.º puesto · {Math.round(s * 100)} %</th><td>{fmt(Math.floor(pool * s * 100) / 100)}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={2}>Puntuación: segundos usados + {SHELTER_CONFIG.failPenaltySec} s por intento fallido. Compites contra rivales de demostración. No se promete más de lo que hay en el fondo.</td></tr></tfoot>
              </table>
              <button className="btn primary big" onClick={onPlayChallenge}>Jugar el desafío</button>
            </>
          ) : (
            <>
              <p>Cerrado: faltan <strong>{left}</strong> duelos válidos para abrirlo.</p>
              <p className="tiny">Con la meta cumplida se reserva el fondo ({fmt(sh.fund)} ahora) como premios del desafío.</p>
              <button className="btn primary big" onClick={onDuel}>Jugar un duelo</button>
            </>
          )}
        </section>

        <section className="card-plain">
          <h3>Cómo se financia</h3>
          <FeeTable entry={10} />
          <p className="tiny">Un duelo sin ningún reto completado se anula: se devuelven las entradas y no suma al refugio.</p>
        </section>

        {sh.history.length > 0 && (
          <section className="card-plain wide">
            <h3>Desafíos anteriores</h3>
            <ul className="seats">
              {[...sh.history].reverse().map((h) => (
                <li key={h.cycle}>Ciclo {h.cycle} · nivel {h.level} · fondo {fmt(h.pool)} · tu puesto {h.place}.º · cobraste {fmt(h.prize)}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
