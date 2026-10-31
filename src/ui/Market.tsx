import type { Saved } from '../platform/storage';

const fmtP = (n: number) => n.toLocaleString('es', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

interface Candle {
  o: number;
  c: number;
  h: number;
  l: number;
}

/** Velas derivadas del historial simulado: cada sala cierra una vela. */
export function candlesFrom(history: number[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 1; i < history.length; i++) {
    const o = history[i - 1];
    const c = history[i];
    const j = (((i * 37) % 7) + 1) * 0.004;
    out.push({ o, c, h: Math.max(o, c) * (1 + j), l: Math.min(o, c) * (1 - j) });
  }
  return out;
}

export function MarketChart({ history, height = 190 }: { history: number[]; height?: number }) {
  const candles = candlesFrom(history).slice(-40);
  const W = 520;
  const padR = 56;
  const lo = Math.min(...candles.map((k) => k.l));
  const hi = Math.max(...candles.map((k) => k.h));
  const span = hi - lo || 1;
  const y = (v: number) => 8 + (1 - (v - lo) / span) * (height - 24);
  const step = (W - padR) / Math.max(candles.length, 1);
  const last = candles[candles.length - 1];
  const up = !last || last.c >= last.o;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + span * t);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label="Gráfico de velas del índice del meme (simulado)" className="market-svg">
      {ticks.map((t) => (
        <g key={t}>
          <line x1="0" x2={W - padR} y1={y(t)} y2={y(t)} stroke="#2b3139" strokeWidth="1" />
          <text x={W - padR + 6} y={y(t) + 4} fontSize="11" fill="#848e9c">{fmtP(t)}</text>
        </g>
      ))}
      {candles.map((k, i) => {
        const x = i * step + step / 2;
        const upC = k.c >= k.o;
        const col = upC ? '#0ecb81' : '#f6465d';
        const top = y(Math.max(k.o, k.c));
        const bh = Math.max(2, Math.abs(y(k.o) - y(k.c)));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(k.h)} y2={y(k.l)} stroke={col} strokeWidth="1.5" />
            <rect x={x - step * 0.3} y={top} width={step * 0.6} height={bh} fill={col} rx="1" />
          </g>
        );
      })}
      {last && (
        <g>
          <line x1="0" x2={W - padR} y1={y(last.c)} y2={y(last.c)} stroke={up ? '#0ecb81' : '#f6465d'} strokeDasharray="4 4" strokeWidth="1" />
          <rect x={W - padR} y={y(last.c) - 9} width={padR} height="18" fill={up ? '#0ecb81' : '#f6465d'} rx="3" />
          <text x={W - padR + 4} y={y(last.c) + 4} fontSize="11" fontWeight="700" fill="#0b0e11">{fmtP(last.c)}</text>
        </g>
      )}
    </svg>
  );
}

export function MarketPanel({ saved }: { saved: Saved }) {
  const h = saved.market.history;
  const price = saved.market.price;
  const prev = h.length > 1 ? h[h.length - 2] : price;
  const change = (price / prev - 1) * 100;
  const recent = h.slice(-40);
  const up = change >= 0;
  return (
    <section className="market" aria-label="Mercado simulado del meme DINO">
      <div className="market-head">
        <div>
          <span className="pair">DINO / PRUEBA</span>
          <span className="sim-tag">SIMULADO</span>
        </div>
        <div className={`market-price ${up ? 'up' : 'down'}`}>
          {fmtP(price)}
          <small>{up ? '▲' : '▼'} {Math.abs(change).toFixed(2)} %</small>
        </div>
      </div>
      <div className="market-stats">
        <span>Máx <b>{fmtP(Math.max(...recent))}</b></span>
        <span>Mín <b>{fmtP(Math.min(...recent))}</b></span>
        <span>Salas <b>{saved.settled.length}</b></span>
      </div>
      <MarketChart history={h} />
      <p className="market-note">Índice de demostración: cada vela es una sala. Sube con lo que se quema y baja con cada jugador que pierde. Sin valor real ni equivalencias.</p>
    </section>
  );
}
