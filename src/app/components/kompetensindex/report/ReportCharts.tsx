import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { BANDS, DIMS, DIM_KEYS, bandFor, type Initiative, type Zone } from '../../../../lib/kompetensindexReport';
import type { CPIResult } from '../../pages/KompetensindexPage';

// Alla diagram ritas med landningssidans tokens (--fg, --border, --accent). Nivåfärgerna är semantiska
// (grön till röd) och delas med skalförklaringen och PDF-rapporten.

const polar = (cx: number, cy: number, r: number, score: number) => {
  const a = Math.PI - (score / 100) * Math.PI;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
};

// ── Halvcirkelmätare för totalpoängen ───────────────────────────────────

export function ScoreGauge({ score }: { score: number }) {
  const cx = 130, cy = 125, r = 100;
  const band = bandFor(score);
  const marker = polar(cx, cy, r, score);
  const gap = 1.2;

  return (
    <svg viewBox="0 0 260 165" className="w-full max-w-[320px] mx-auto" role="img"
      aria-label={`Totalpoäng ${score} av 100, nivå ${band.label}`}>
      {BANDS.map((b) => {
        const from = polar(cx, cy, r, b.from + gap);
        const to = polar(cx, cy, r, Math.min(b.to - 1, 100) - gap + 1);
        return (
          <path key={b.index} d={`M ${from.x} ${from.y} A ${r} ${r} 0 0 1 ${to.x} ${to.y}`}
            fill="none" stroke={b.color} strokeOpacity={b.index === band.index ? 0.95 : 0.28}
            strokeWidth={16} strokeLinecap="butt" />
        );
      })}
      <circle cx={marker.x} cy={marker.y} r={9} fill="#fff" stroke={band.color} strokeWidth={4} />
      <text x={cx} y={cy - 18} textAnchor="middle" fontSize="52" fontWeight="700" fill={band.color}>{score}</text>
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="12" fill="var(--fg-muted)">av 100</text>
      <text x={cx - r} y={cy + 24} textAnchor="middle" fontSize="10" fill="var(--fg-subtle)">0</text>
      <text x={cx + r} y={cy + 24} textAnchor="middle" fontSize="10" fill="var(--fg-subtle)">100</text>
    </svg>
  );
}

// ── Skalstapel med markör ───────────────────────────────────────────────

export function ScaleBar({ score, compact = false }: { score: number; compact?: boolean }) {
  const band = bandFor(score);
  const pos = Math.min(Math.max(score, 0), 100);
  return (
    <div>
      <div className="relative">
        <div className={`flex overflow-hidden rounded-full ${compact ? 'h-2' : 'h-2.5'}`}>
          {BANDS.map((b) => (
            <div key={b.index} className="flex-1" style={{ backgroundColor: b.color, opacity: b.index === band.index ? 0.9 : 0.25 }} />
          ))}
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-[3px] shadow-sm"
          style={{ left: `${pos}%`, borderColor: band.color }} />
      </div>
      {!compact && (
        <div className="flex justify-between mt-1.5 text-[10px] text-[var(--fg-subtle)]">
          <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
        </div>
      )}
    </div>
  );
}

// ── Radar över de fyra dimensionerna ────────────────────────────────────

export function DimensionRadar({ scores }: { scores: CPIResult['scores'] }) {
  const data = DIM_KEYS.map((k) => ({ dim: `${DIMS[k].abbr} ${DIMS[k].label}`, value: scores[k] }));
  return (
    <div className="w-full h-[290px]" role="img" aria-label="Radardiagram över de fyra dimensionerna">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="76%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="dim" tick={{ fill: 'var(--fg-muted)', fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={{ fill: 'var(--fg-subtle)', fontSize: 10 }} axisLine={false} />
          <Radar dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.18} isAnimationActive={false} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Förändringstryck mot omställningsbegränsning ────────────────────────

export function PressureQuadrant({ AF, OK, zone }: { AF: number; OK: number; zone: Zone }) {
  const L = 54, R = 384, T = 16, B = 286;
  const w = R - L, h = B - T;
  const x = (v: number) => L + (v / 100) * w;
  const y = (v: number) => B - (v / 100) * h;
  const px = x(AF), py = y(OK);
  const labelRight = AF < 70;

  const zones = [
    { id: 'vulnerable', x: L, y: T, c: '#C2410C', t: 'Sårbar' },
    { id: 'critical', x: x(50), y: T, c: '#B91C1C', t: 'Kritisk zon' },
    { id: 'stable', x: L, y: y(50), c: '#15803D', t: 'Stabil' },
    { id: 'equipped', x: x(50), y: y(50), c: '#A16207', t: 'Rustad' },
  ];

  return (
    <svg viewBox="0 0 410 340" className="w-full max-w-[520px] mx-auto" role="img"
      aria-label={`Förändringstryck ${AF}, omställningsbegränsning ${OK}: ${zone.label}`}>
      {zones.map((z) => (
        <g key={z.id}>
          <rect x={z.x} y={z.y} width={w / 2} height={h / 2} fill={z.c} fillOpacity={zone.id === z.id ? 0.2 : 0.07} />
          <text x={z.x + 10} y={z.y + 20} fontSize="11" fontWeight="600" fill={z.c}>{z.t}</text>
        </g>
      ))}
      <rect x={L} y={T} width={w} height={h} fill="none" stroke="var(--border)" />
      <line x1={x(50)} y1={T} x2={x(50)} y2={B} stroke="var(--border)" />
      <line x1={L} y1={y(50)} x2={R} y2={y(50)} stroke="var(--border)" />

      <circle cx={px} cy={py} r={9} fill="var(--accent)" stroke="#fff" strokeWidth={3} />
      <text x={labelRight ? px + 15 : px - 15} y={py + 4} textAnchor={labelRight ? 'start' : 'end'}
        fontSize="12" fontWeight="700" fill="var(--fg)">Ni</text>

      <text x={(L + R) / 2} y={B + 26} textAnchor="middle" fontSize="11" fill="var(--fg-muted)">
        Förändringstryck (AF) →
      </text>
      <text x={L} y={B + 14} fontSize="10" fill="var(--fg-subtle)">0</text>
      <text x={R} y={B + 14} textAnchor="end" fontSize="10" fill="var(--fg-subtle)">100</text>
      <text transform={`translate(14 ${(T + B) / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fill="var(--fg-muted)">
        Begränsning (OK) →
      </text>
    </svg>
  );
}

// ── Effekt mot genomförandeinsats ───────────────────────────────────────

function pointColor(i: Initiative): string {
  if (i.effect >= 50 && i.effort < 50) return '#15803D';
  if (i.effect >= 50) return '#C2410C';
  if (i.effort < 50) return '#2655C4';
  return '#B91C1C';
}

export function PriorityMatrix({ items }: { items: Initiative[] }) {
  const L = 22, R = 396, T = 28, B = 296;
  const w = R - L, h = B - T;
  const x = (v: number) => L + (v / 100) * w;
  const y = (v: number) => B - (v / 100) * h;

  return (
    <div>
      <svg viewBox="0 0 420 336" className="w-full max-w-[520px] mx-auto" role="img" aria-label="Matris över effekt mot genomförandeinsats">
        <rect x={L} y={T} width={w} height={h} fill="var(--bg-raised)" stroke="var(--border)" />
        <rect x={L} y={T} width={w / 2} height={h / 2} fill="#15803D" fillOpacity={0.07} />
        <line x1={x(50)} y1={T} x2={x(50)} y2={B} stroke="var(--border)" />
        <line x1={L} y1={y(50)} x2={R} y2={y(50)} stroke="var(--border)" />
        <text x={L} y={T - 10} fontSize="10" fontWeight="600" fill="var(--fg-muted)">HÖG EFFEKT</text>
        <text x={L} y={B + 18} fontSize="10" fontWeight="600" fill="var(--fg-muted)">LÅG INSATS</text>
        <text x={R} y={B + 18} textAnchor="end" fontSize="10" fontWeight="600" fill="var(--fg-muted)">HÖG INSATS</text>
        <text x={L + 8} y={T + 16} fontSize="10" fill="#15803D" fontWeight="600">Bra start</text>
        {items.map((i, n) => (
          <g key={i.id}>
            <circle cx={x(i.effort)} cy={y(i.effect)} r={12} fill={pointColor(i)} stroke="#fff" strokeWidth={2} />
            <text x={x(i.effort)} y={y(i.effect) + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{n + 1}</text>
          </g>
        ))}
      </svg>
      <ol className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
        {items.map((i, n) => (
          <li key={i.id} className="flex gap-2.5 text-sm">
            <span className="w-5 h-5 rounded-full text-[11px] font-bold text-white flex items-center justify-center shrink-0 mt-0.5"
              style={{ backgroundColor: pointColor(i) }}>{n + 1}</span>
            <span className="leading-snug">
              <span className="font-semibold text-[var(--fg)]">{i.label}</span>
              <span className="block text-xs text-[var(--fg-muted)]">{i.why}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
