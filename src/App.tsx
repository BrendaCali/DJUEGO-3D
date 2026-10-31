import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LEVELS, getLevel } from './levels';
import { Game, fmtTime } from './ui/Game';
import { RoomScreen } from './ui/Room';
import { MarketPanel } from './ui/Market';
import { DINO_COLORS, DinoArt, Fern, Palm, PieceIcon, PORTAL_STYLES, SymbolBadge, Volcano } from './ui/art';
import { clearSaved, loadSaved, save } from './platform/storage';
import type { Saved } from './platform/storage';
import { play, setSound } from './platform/sound';
import { REWARD_CONFIG, communitySnapshot } from './rewards/rewardRules';
import type { CompletionResult } from './rewards/rewardRules';

type Screen = { name: 'start' } | { name: 'levels' } | { name: 'game'; levelId: number; attempt: number }
  | { name: 'room'; code?: string };

const useReducedMotionQuery = () => {
  const [v, setV] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const f = () => setV(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return v;
};

export default function App() {
  const [saved, setSaved] = useState<Saved>(() => loadSaved());
  const [screen, setScreen] = useState<Screen>(() => {
    const code = new URLSearchParams(location.search).get('room');
    return code ? { name: 'room', code: code.toUpperCase().slice(0, 5) } : { name: 'start' };
  });
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const osReduce = useReducedMotionQuery();
  const reduce = saved.prefs.reduceMotion || osReduce;
  const savedRef = useRef(saved);
  savedRef.current = saved;

  useEffect(() => {
    save(saved);
    setSound(saved.prefs.sound, saved.prefs.volume);
  }, [saved]);

  const prefs = saved.prefs;
  const setPrefs = (p: Partial<Saved['prefs']>) => setSaved((s) => ({ ...s, prefs: { ...s.prefs, ...p } }));

  const unlocked = (id: number) => prefs.dev || id === 1 || saved.completed[id - 1] !== undefined;

  const onComplete = useCallback((levelId: number, usedSec: number, r: CompletionResult) => {
    setSaved((s) => ({
      ...s,
      ledger: r.ledger,
      completed: {
        ...s.completed,
        [levelId]: { bestUsedSec: Math.min(s.completed[levelId]?.bestUsedSec ?? Infinity, usedSec) },
      },
    }));
  }, []);

  const openHelp = () => {
    play('click');
    setHelpOpen(true);
  };
  const go = (s: Screen) => {
    play('click');
    setScreen(s);
  };

  const baseLevel = screen.name === 'game' ? getLevel(screen.levelId) : undefined;
  // Modo desarrollo: ?time=SEGUNDOS acorta el cronómetro para probar la derrota.
  const level = useMemo(() => {
    if (!baseLevel || !prefs.dev) return baseLevel;
    const t = Number(new URLSearchParams(location.search).get('time'));
    return t > 0 ? { ...baseLevel, timeSec: t } : baseLevel;
  }, [baseLevel, prefs.dev]);

  return (
    <div className={`app${reduce ? ' reduce-motion' : ''}`}>
      <div className="topbar">
        <span className="proto-badge" title="Todo es simulado: no hay billeteras, contratos ni dinero real">
          Prototipo: recompensas de prueba
        </span>
        <button className="balance market-chip" onClick={() => setMarketOpen(true)} title="Ver el gráfico del meme (simulado)">DINO <strong>{saved.market.price.toFixed(3)}</strong> <span className={saved.market.history.length > 1 && saved.market.price >= saved.market.history[saved.market.history.length - 2] ? 'up' : 'down'}>{saved.market.history.length > 1 && saved.market.price >= saved.market.history[saved.market.history.length - 2] ? '▲' : '▼'}</span></button>
        <span className="balance" aria-label="Saldo de prueba">
          Saldo: <strong>{saved.ledger.balance.toFixed(1)}</strong> DINO de prueba
        </span>
        <button
          className="btn ghost round"
          onClick={() => setPrefs({ sound: !prefs.sound })}
          aria-pressed={prefs.sound}
          aria-label={prefs.sound ? 'Silenciar sonido' : 'Activar sonido'}
        >
          {prefs.sound ? '🔊' : '🔇'}
        </button>
        <button className="btn ghost round" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">⚙</button>
      </div>

      {screen.name === 'start' && <StartScreen onPlay={() => go({ name: 'levels' })} onRoom={() => go({ name: 'room' })} onHelp={openHelp} />}

      {screen.name === 'levels' && (
        <LevelSelect
          saved={saved}
          unlocked={unlocked}
          dev={prefs.dev}
          onPick={(id) => go({ name: 'game', levelId: id, attempt: 0 })}
          onBack={() => go({ name: 'start' })}
        />
      )}

      {screen.name === 'game' && level && (
        <Game
          key={`${level.id}-${screen.attempt}`}
          level={level}
          ledger={saved.ledger}
          completedBefore={saved.completed[level.id] !== undefined}
          dev={prefs.dev}
          reducedMotion={reduce}
          hasNext={level.id < LEVELS.length}
          onComplete={onComplete}
          onExit={() => go({ name: 'levels' })}
          onNext={() => go({ name: 'game', levelId: level.id + 1, attempt: 0 })}
          onRetry={() => go({ name: 'game', levelId: level.id, attempt: screen.attempt + 1 })}
          onHelp={openHelp}
        />
      )}

      {screen.name === 'room' && (
        <RoomScreen
          saved={saved}
          setSaved={(f) => setSaved(f)}
          initialCode={screen.code}
          reducedMotion={reduce}
          dev={prefs.dev}
          onHelp={openHelp}
          onExit={() => go({ name: 'start' })}
        />
      )}

      {marketOpen && (
        <Modal title="Mercado del meme" onClose={() => setMarketOpen(false)}>
          <MarketPanel saved={saved} />
        </Modal>
      )}

      {helpOpen && <HelpModal onClose={() => { setHelpOpen(false); setPrefs({ seenHelp: true }); }} />}
      {settingsOpen && (
        <SettingsModal
          saved={saved}
          osReduce={osReduce}
          onChange={setPrefs}
          onReset={() => {
            if (window.confirm('¿Borrar progreso y saldo de prueba?')) {
              clearSaved();
              setSaved(loadSaved());
              setScreen({ name: 'start' });
            }
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function StartScreen({ onPlay, onRoom, onHelp }: { onPlay: () => void; onRoom: () => void; onHelp: () => void }) {
  return (
    <main className="start">
      <Volcano style={{ position: 'absolute', right: '4%', top: 40, width: 260 }} />
      <Palm style={{ position: 'absolute', left: '2%', bottom: 0, width: 150 }} />
      <Palm flip style={{ position: 'absolute', right: '3%', bottom: 0, width: 130 }} />
      <Fern style={{ position: 'absolute', left: '16%', bottom: 0, width: 120 }} />
      <div className="start-card">
        <h1>Dino <span>Escape</span></h1>
        <p className="tagline">Construye el camino, gira las piezas y lleva a los dinos a su refugio antes de que explote el volcán.</p>
        <div className="hero" aria-hidden="true">
          <svg viewBox="-60 -60 120 120" width="190" height="190" className="hero-dino"><DinoArt dino="green" mood="happy" /></svg>
          <svg viewBox="-60 -60 120 120" width="150" height="150" className="hero-dino small"><DinoArt dino="orange" facing={-1} /></svg>
        </div>
        <div className="row center">
          <button className="btn primary big" onClick={onPlay} autoFocus>Jugar</button>
          <button className="btn big" onClick={onRoom}>Carrera con amigos</button>
          <button className="btn big" onClick={onHelp}>Cómo jugar</button>
        </div>
        <p className="proto">Prototipo: recompensas de prueba · sin billeteras ni dinero real</p>
      </div>
    </main>
  );
}

function CommunityCard({ saved }: { saved: Saved }) {
  const c = communitySnapshot(saved.ledger);
  return (
    <section className="community" aria-label="Comunidad de demostración">
      <h3>{c.season}</h3>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={c.goal} aria-valuenow={c.rescues} aria-label="Progreso de rescates">
        <i style={{ width: `${c.progress * 100}%` }} />
      </div>
      <p>
        <strong>{c.rescues}</strong> / {c.goal} rescates · fondo colectivo de prueba: <strong>{c.fund.toLocaleString('es')}</strong> DINO
      </p>
      <p className="tiny">
        {c.unlocked ? 'Meta alcanzada: ¡desbloqueo de demostración conseguido!' : `Faltan ${c.goal - c.rescues} rescates para el desbloqueo de demostración.`}
      </p>
      <p className="tiny">Contador local y simulado: no representa a otros jugadores reales.</p>
    </section>
  );
}

function LevelSelect({ saved, unlocked, dev, onPick, onBack }: { saved: Saved; unlocked: (id: number) => boolean; dev: boolean; onPick: (id: number) => void; onBack: () => void }) {
  const cards = useMemo(() => LEVELS, []);
  return (
    <main className="levels">
      <div className="levels-head">
        <button className="btn ghost" onClick={onBack}>← Inicio</button>
        <h2>Elige un nivel{dev && <span className="dev-tag">DEV: todos abiertos</span>}</h2>
      </div>
      <div className="levels-grid">
        {cards.map((lv) => {
          const done = saved.completed[lv.id];
          const open = unlocked(lv.id);
          const status = done ? 'Completado' : open ? 'Disponible' : 'Bloqueado';
          return (
            <button key={lv.id} className={`level-card ${done ? 'done' : open ? 'open' : 'locked'}`} disabled={!open} onClick={() => onPick(lv.id)} aria-label={`Nivel ${lv.id}: ${lv.name}. ${status}`}>
              <span className="level-num">{lv.id}</span>
              <strong>{lv.name}</strong>
              <span className="level-meta">{lv.size} × {lv.size} · {fmtTime(lv.timeSec)} · {lv.dinos.length === 2 ? '2 dinos' : '1 dino'}</span>
              <span className="level-diff">{lv.difficulty}</span>
              <span className={`chip ${done ? 'ok' : open ? '' : 'lock'}`}>
                {done ? `✔ Completado · mejor ${fmtTime(done.bestUsedSec)}` : open ? 'Disponible' : '🔒 Bloqueado'}
              </span>
              {done && <span className="tiny">Premio cobrado: {(saved.ledger.claimed[lv.id] ?? 0).toFixed(1)} DINO de prueba · repetir = práctica</span>}
            </button>
          );
        })}
      </div>
      <CommunityCard saved={saved} />
    </main>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="overlay modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost round" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Cómo jugar" onClose={onClose}>
      <ol className="help">
        <li>Pulsa <strong>Comenzar nivel</strong>: el cronómetro arranca y puedes construir.</li>
        <li>Elige una pieza de la bandeja, <strong>gírala</strong> (↺ ↻ o teclas Q / R) y pulsa una casilla libre. En escritorio también puedes arrastrarla.</li>
        <li>Une la <strong>salida</strong> con el <strong>refugio</strong>. Dos piezas vecinas se conectan solo si las dos tienen abertura en el borde compartido.</li>
        <li>Pulsa <strong>¡Corre, Dino!</strong>. Si el camino falla verás dónde, el intento fallido se anota (−10 DINO) y puedes corregir si queda tiempo.</li>
        <li>Si el tiempo llega a cero, el tablero se llena de bombas.</li>
      </ol>
      <div className="help-pieces">
        {(
          [
            ['straight', 'Recta: dos lados opuestos.'],
            ['curve', 'Curva: dos lados contiguos.'],
            ['tee', 'Cruce en T: entra por cualquier lado menos el de la flecha y sale siempre por la flecha.'],
            ['bridge', 'Puente: cruza dos caminos a distinta altura; no cambia de eje.'],
          ] as const
        ).map(([t, d]) => (
          <div key={t} className="help-piece">
            <PieceIcon type={t} arrow="left" size={52} />
            <span>{d}</span>
          </div>
        ))}
      </div>
      <h3>Elementos del nivel</h3>
      <ul className="help">
        <li><strong>Piedras</strong> y <strong>caminos de piedra con candado</strong> no se pueden tocar. Las casillas con borde punteado son las libres.</li>
        <li><strong>Portales</strong>: entra por su conexión y sales por la de su pareja (mismo color y símbolo):{' '}
          {Object.entries(PORTAL_STYLES).slice(0, 2).map(([k, s]) => (
            <span key={k} className="inline-sym"><SymbolBadge kind={s.symbol} color={s.color} /></span>
          ))}
        </li>
        <li>Dos dinos ({DINO_COLORS.green.name} y {DINO_COLORS.orange.name}): cada uno a su refugio (hoja o sol). Si dos dinos coinciden en una casilla o se cruzan de frente, chocan. En un puente, por ejes distintos, no. Elige quién sale primero y con qué retraso.</li>
        <li>Premio de prueba = 100 × tiempo restante ÷ tiempo total − 10 × intentos fallidos (mínimo 0). Se cobra una vez por nivel; repetir es práctica.</li>
      </ul>
      <p className="tiny">Los {REWARD_CONFIG.maxPerLevel} DINO máximos por nivel son de prueba: no hay billeteras, transacciones ni dinero real.</p>
      <div className="row center"><button className="btn primary big" onClick={onClose}>¡Entendido!</button></div>
    </Modal>
  );
}

function SettingsModal({ saved, osReduce, onChange, onReset, onClose }: { saved: Saved; osReduce: boolean; onChange: (p: Partial<Saved['prefs']>) => void; onReset: () => void; onClose: () => void }) {
  const p = saved.prefs;
  return (
    <Modal title="Ajustes" onClose={onClose}>
      <div className="settings">
        <label className="field inline">
          <input type="checkbox" checked={p.sound} onChange={(e) => onChange({ sound: e.target.checked })} /> Sonido
        </label>
        <label className="field">
          <span>Volumen</span>
          <input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => onChange({ volume: Number(e.target.value) })} />
        </label>
        <label className="field inline">
          <input type="checkbox" checked={p.reduceMotion || osReduce} disabled={osReduce} onChange={(e) => onChange({ reduceMotion: e.target.checked })} />
          Reducir movimiento {osReduce && '(activado por tu sistema)'}
        </label>
        <label className="field inline">
          <input type="checkbox" checked={p.dev} onChange={(e) => onChange({ dev: e.target.checked })} />
          Modo desarrollo (abrir cualquier nivel y consultar su solución)
        </label>
        <button className="btn" onClick={onReset}>Borrar progreso y saldo de prueba</button>
      </div>
    </Modal>
  );
}
