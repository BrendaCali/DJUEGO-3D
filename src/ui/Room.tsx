import { useEffect, useMemo, useRef, useState } from 'react';
import { LEVELS } from '../levels';
import { RoomClient, TOTAL_LEVELS } from '../rooms/roomClient';
import type { RoomPlayer, RoomState } from '../rooms/roomClient';
import { ROOM_CONFIG, nextPrice } from '../rooms/roomRules';
import { recordDuel, SHELTER_CONFIG, shelterProgress } from '../shelter/shelterRules';
import type { Saved } from '../platform/storage';
import { play } from '../platform/sound';
import { DinoArt } from './art';
import { Game, fmtTime } from './Game';
import { MarketPanel } from './Market';

interface Props {
  saved: Saved;
  setSaved: (f: (s: Saved) => Saved) => void;
  initialCode?: string;
  reducedMotion: boolean;
  dev: boolean;
  onHelp: () => void;
  onExit: () => void;
}

const fmt = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 2 });

export function Sparkline({ values }: { values: number[] }) {
  const v = values.length > 1 ? values : [values[0] ?? 1, values[0] ?? 1];
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 200},${46 - ((x - min) / span) * 40}`).join(' ');
  return (
    <svg viewBox="0 0 200 52" width="100%" height="52" role="img" aria-label="Historial del índice del meme">
      <polyline points={pts} fill="none" stroke="#2f8a3c" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="200" cy={46 - ((v[v.length - 1] - min) / span) * 40} r="4" fill="#f7973a" />
    </svg>
  );
}

export function FeeTable({ entry }: { entry: number }) {
  const pot = entry * 2;
  const op = Math.round(pot * ROOM_CONFIG.operationRate * 100) / 100;
  const sh = Math.round(pot * ROOM_CONFIG.shelterRate * 100) / 100;
  const win = Math.round((pot - op - sh) * 100) / 100;
  return (
    <table className="fee-table" aria-label="Reparto del pozo">
      <caption>Reparto del pozo con entrada {entry}</caption>
      <tbody>
        <tr><th>Ganador</th><td>{fmt(win)}</td></tr>
        <tr><th>Operación del proyecto</th><td>{fmt(op)}</td></tr>
        <tr><th>Refugio comunitario</th><td>{fmt(sh)}</td></tr>
        <tr className="total"><th>Total aportado</th><td>{fmt(pot)}</td></tr>
      </tbody>
      <tfoot><tr><td colSpan={2}>Ganancia neta del ganador: +{fmt(win - entry)} · el perdedor pierde su entrada ({entry}) y nada más.</td></tr></tfoot>
    </table>
  );
}

function PriceCard({ saved }: { saved: Saved }) {
  return <MarketPanel saved={saved} />;
}

export function RoomScreen({ saved, setSaved, initialCode, reducedMotion, dev, onHelp, onExit }: Props) {
  const me = useRef({ id: Math.random().toString(36).slice(2, 10), name: saved.name });
  const clientRef = useRef<RoomClient | null>(null);
  const [, bump] = useState(0);
  const [entry, setEntry] = useState<number>(ROOM_CONFIG.entryOptions[0]);
  const capacity = ROOM_CONFIG.maxPlayers;
  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [name, setName] = useState(saved.name);
  const [step, setStep] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState('');
  const paid = useRef<string | null>(null);
  const levelTimes = useMemo(() => LEVELS.map((l) => l.timeSec), []);
  const [now, setNow] = useState(Date.now());

  const client = () => {
    me.current.name = name.trim() || saved.name;
    if (!clientRef.current) clientRef.current = new RoomClient(me.current, levelTimes, () => bump((v) => v + 1));
    return clientRef.current;
  };
  useEffect(() => {
    if (initialCode) {
      client().join(initialCode);
      bump((v) => v + 1);
    }
    return () => {
      clientRef.current?.leave();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const c = clientRef.current;
  const s: RoomState | null = c?.state ?? null;

  // Cobro de la entrada al empezar y liquidación al terminar (una vez por sala)
  useEffect(() => {
    if (!s) return;
    if (s.status === 'racing' && paid.current !== s.code) {
      paid.current = s.code;
      setSaved((v) => ({ ...v, ledger: { ...v.ledger, balance: Math.max(0, Math.round((v.ledger.balance - s.entry) * 100) / 100) } }));
    }
    if (s.status === 'finished' && s.result && !saved.settled.includes(s.code)) {
      const res = s.result;
      const mine = res.payouts[me.current.id] ?? 0;
      const entryPaid = paid.current === s.code;
      setSaved((v) => {
        if (v.settled.includes(s.code)) return v;
        const price = nextPrice(v.market.price, res, s.players.length);
        return {
          ...v,
          ledger: { ...v.ledger, balance: Math.round((v.ledger.balance + (entryPaid ? mine : 0)) * 100) / 100 },
          market: res.valid ? { price, history: [...v.market.history, price].slice(-30) } : v.market,
          settled: [...v.settled, s.code].slice(-50),
          shelter: entryPaid ? recordDuel(v.shelter, res) : v.shelter,
        };
      });
      play(res.ranking[0] === me.current.id ? 'win' : 'error');
    }
  }, [s, saved.settled, setSaved]);

  const link = s ? `${location.origin}${location.pathname}?room=${s.code}` : '';
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      window.prompt('Copia esto:', text);
    }
    setTimeout(() => setCopied(''), 1800);
  };

  const leave = () => {
    clientRef.current?.leave();
    clientRef.current = null;
    paid.current = null;
    setStep(1);
    onExit();
  };

  // ---------- Menú ----------
  if (!s) {
    const noFunds = saved.ledger.balance < entry;
    return (
      <main className="room">
        <div className="levels-head">
          <button className="btn ghost" onClick={leave}>← Inicio</button>
          <h2>Duelo con DINO de prueba</h2>
        </div>
        <p className="muted">Dos jugadores aportan la misma entrada, que queda bloqueada antes de empezar, y resuelven los mismos 9 retos. El ganador recibe el pozo menos dos comisiones anunciadas; una de ellas alimenta el Refugio comunitario. Todo es simulado.</p>
        <FeeTable entry={entry} />
        <div className="room-grid">
          <section className="card-plain">
            <h3>Tu nombre</h3>
            <input className="text-in" value={name} maxLength={14} onChange={(e) => setName(e.target.value)} aria-label="Tu nombre" />
            <p className="tiny">Saldo: <strong>{fmt(saved.ledger.balance)}</strong> DINO de prueba</p>
            {noFunds && (
              <button className="btn small" onClick={() => setSaved((v) => ({ ...v, ledger: { ...v.ledger, balance: v.ledger.balance + ROOM_CONFIG.faucet } }))}>
                Recibir {ROOM_CONFIG.faucet} DINO de prueba
              </button>
            )}
          </section>

          <section className="card-plain">
            <h3>Crear sala</h3>
            <label className="field"><span>Entrada (DINO de prueba)</span>
              <select value={entry} onChange={(e) => setEntry(Number(e.target.value))}>
                {ROOM_CONFIG.entryOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <p className="tiny">Pozo bloqueado: {entry * capacity} DINO de prueba (2 × {entry}).</p>
            <button
              className="btn primary big"
              disabled={noFunds}
              onClick={() => {
                play('click');
                client().create(entry, capacity);
                bump((v) => v + 1);
              }}
            >
              Crear duelo
            </button>
          </section>

          <section className="card-plain">
            <h3>Unirme con código</h3>
            <input className="text-in code" value={codeInput} maxLength={5} placeholder="ABCDE" onChange={(e) => setCodeInput(e.target.value.toUpperCase())} aria-label="Código de sala" />
            <button
              className="btn big"
              disabled={codeInput.length < 5}
              onClick={() => {
                play('click');
                client().join(codeInput);
                bump((v) => v + 1);
              }}
            >
              Unirme
            </button>
            {c?.error && <p className="tiny err" role="alert">{c.error}</p>}
          </section>

          <PriceCard saved={saved} />
        </div>
      </main>
    );
  }

  const meP = s.players.find((p) => p.id === me.current.id);
  const youHost = s.hostId === me.current.id;

  // ---------- Sala de espera ----------
  if (s.status === 'lobby') {
    const slots = Array.from({ length: s.capacity }, (_, i) => s.players[i] ?? null);
    const noFunds = saved.ledger.balance < s.entry;
    return (
      <main className="room">
        <div className="levels-head">
          <button className="btn ghost" onClick={leave}>← Salir</button>
          <h2>Sala <span className="code-big">{s.code}</span></h2>
        </div>
        <div className="room-grid">
          <section className="card-plain">
            <h3>Invita a tus amigos</h3>
            <p className="tiny">Comparte el código o el enlace. Funciona con pestañas o ventanas de este mismo navegador (demo local).</p>
            <div className="row">
              <button className="btn" onClick={() => copy(s.code, 'code')}>{copied === 'code' ? '¡Copiado!' : 'Copiar código'}</button>
              <button className="btn" onClick={() => copy(link, 'link')}>{copied === 'link' ? '¡Copiado!' : 'Copiar enlace'}</button>
              <button className="btn" onClick={() => window.open(link, '_blank')}>Abrir como invitado ↗</button>
            </div>
            <p className="tiny link">{link}</p>
            <p className="tiny">Entrada: <strong>{s.entry}</strong> cada uno · al empezar quedan bloqueados <strong>{s.entry * s.capacity}</strong> DINO de prueba.</p>
            <FeeTable entry={s.entry} />
          </section>

          <section className="card-plain">
            <h3>Jugadores ({s.players.length}/{s.capacity})</h3>
            <ul className="seats">
              {slots.map((p, i) =>
                p ? (
                  <li key={p.id} className={p.id === me.current.id ? 'me' : ''}>
                    <svg viewBox="-50 -50 100 100" width="34" height="34" aria-hidden="true"><DinoArt dino={i % 2 ? 'orange' : 'green'} /></svg>
                    <span>{p.name}{p.id === s.hostId ? ' · anfitrión' : ''}{p.id === me.current.id ? ' (tú)' : ''}</span>
                    {youHost && p.id !== me.current.id && <button className="btn small" onClick={() => c!.kick(p.id)} aria-label={`Quitar a ${p.name}`}>✕</button>}
                  </li>
                ) : (
                  <li key={`e${i}`} className="empty">Esperando invitado…</li>
                ),
              )}
            </ul>
            {youHost ? (
              <div className="row">
                <button className="btn" disabled={s.players.length >= s.capacity} onClick={() => c!.addBot()}>+ Rival bot (demo)</button>
                <button className="btn primary big" disabled={s.players.length < ROOM_CONFIG.minPlayers || noFunds} onClick={() => { play('run'); c!.start(); }}>
                  Bloquear entradas y empezar
                </button>
              </div>
            ) : (
              <p className="tiny">Esperando a que el anfitrión empiece…</p>
            )}
            {noFunds && (
              <button className="btn small" onClick={() => setSaved((v) => ({ ...v, ledger: { ...v.ledger, balance: v.ledger.balance + ROOM_CONFIG.faucet } }))}>
                Saldo insuficiente: recibir {ROOM_CONFIG.faucet} DINO de prueba
              </button>
            )}
          </section>
        </div>
      </main>
    );
  }

  // ---------- Resultados ----------
  if (s.status === 'finished' && s.result) {
    const r = s.result;
    const byId = new Map(s.players.map((p) => [p.id, p]));
    const prev = saved.market.history[saved.market.history.length - 2] ?? saved.market.price;
    return (
      <main className="room">
        <div className="levels-head"><h2>Resultados de la sala {s.code}</h2></div>
        <div className="room-grid">
          <section className="card-plain wide">
            <ol className="podium">
              {r.ranking.map((id, i) => {
                const p = byId.get(id)!;
                const net = r.net[id];
                return (
                  <li key={id} className={id === me.current.id ? 'me' : ''}>
                    <span className="pos">{i + 1}.º</span>
                    <span className="who">{p.name}</span>
                    <span className="tiny">{p.done}/{TOTAL_LEVELS} retos</span>
                    <strong>{fmt(r.payouts[id])}</strong>
                    <span className={net >= 0 ? 'up' : 'down'}>{net >= 0 ? '+' : ''}{fmt(net)}</span>
                  </li>
                );
              })}
            </ol>
            {r.valid ? (
              <dl className="split">
                <div><dt>Ganador</dt><dd>{fmt(r.payouts[r.ranking[0]])}</dd></div>
                <div><dt>Operación del proyecto</dt><dd>{fmt(r.operation)}</dd></div>
                <div><dt>Refugio comunitario</dt><dd>{fmt(r.shelter)}</dd></div>
                <div className="total"><dt>Total aportado</dt><dd>{fmt(r.pot)}</dd></div>
              </dl>
            ) : (
              <p className="tiny">Nadie completó ningún reto: se devolvieron las entradas y el duelo no cuenta para el refugio.</p>
            )}
            {r.valid && (
              <p className="tiny shelter-note">
                🦕 El refugio sube a <strong>{saved.shelter.duels}/{SHELTER_CONFIG.goalDuels}</strong> rescates ({Math.round(shelterProgress(saved.shelter) * 100)} %) y guarda <strong>{fmt(saved.shelter.fund)}</strong> DINO de prueba.
              </p>
            )}
            <div className="row">
              <button className="btn primary big" onClick={() => { clientRef.current?.leave(); clientRef.current = null; paid.current = null; setStep(1); bump((v) => v + 1); }}>Nueva sala</button>
              <button className="btn big" onClick={leave}>Salir</button>
            </div>
          </section>
          <div>
            <PriceCard saved={saved} />
            <p className="tiny">Antes {fmt(prev)} → ahora {fmt(saved.market.price)}</p>
            <p className="tiny">Saldo: <strong>{fmt(saved.ledger.balance)}</strong> DINO de prueba</p>
          </div>
        </div>
      </main>
    );
  }

  // ---------- Carrera ----------
  const grace = s.firstDoneAt ? Math.max(0, Math.ceil((s.firstDoneAt + ROOM_CONFIG.graceSec * 1000 - now) / 1000)) : null;
  const standings = (
    <aside className="standings" aria-label="Carrera en vivo">
      <h3>Carrera · sala {s.code}</h3>
      {s.players.map((p: RoomPlayer) => (
        <div key={p.id} className={`lane${p.id === me.current.id ? ' me' : ''}`}>
          <span className="lane-name">{p.name}</span>
          <span className="lane-bar" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL_LEVELS} aria-valuenow={p.done} aria-label={`${p.name}: ${p.done} de ${TOTAL_LEVELS} retos`}>
            {Array.from({ length: TOTAL_LEVELS }, (_, i) => <i key={i} className={i < p.done ? 'on' : ''} />)}
          </span>
        </div>
      ))}
      {grace !== null && <p className="banner error small-banner">¡Alguien terminó! Quedan {fmtTime(grace)} para los demás.</p>}
    </aside>
  );

  if (step > TOTAL_LEVELS || (meP && meP.done >= TOTAL_LEVELS && step > TOTAL_LEVELS)) {
    return (
      <main className="room">
        <div className="levels-head"><h2>¡Terminaste los 9 retos!</h2></div>
        <div className="room-grid">{standings}<section className="card-plain"><p>Esperando a los demás jugadores…</p></section></div>
      </main>
    );
  }

  const level = LEVELS[step - 1];
  return (
    <div className="race-wrap">
      <div className="race-bar">{standings}</div>
      <Game
        key={`${step}-${attempt}`}
        level={level}
        ledger={saved.ledger}
        completedBefore={false}
        dev={dev}
        reducedMotion={reducedMotion}
        hasNext
        race={{ step, onWin: () => c?.reportDone(step) }}
        onComplete={() => undefined}
        onExit={leave}
        onNext={() => { setAttempt(0); setStep(step + 1); }}
        onRetry={() => setAttempt((a) => a + 1)}
        onHelp={onHelp}
      />
    </div>
  );
}
