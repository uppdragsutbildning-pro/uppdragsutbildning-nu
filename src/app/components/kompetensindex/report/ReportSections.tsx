import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CalendarCheck, FileText, GraduationCap } from 'lucide-react';
import {
  BANDS, DIMS, DIM_KEYS, SI_LABELS, bandFor, siToPct,
  type Analysis, type Finding, type Recommendation,
} from '../../../../lib/kompetensindexReport';
import { ADVISORY_BOOKING_URL, ADVISORY_LABEL } from '../../../../lib/advisory';
import type { ReportCourse } from '../../../../lib/reportCourseMatching';
import type { CPIResult } from '../../pages/KompetensindexPage';
import { ScaleBar } from './ReportCharts';

// ── Bas ─────────────────────────────────────────────────────────────────

export function Section({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)] mb-1.5">{eyebrow}</p>
        <h2 className="text-[clamp(1.35rem,2.6vw,1.75rem)] font-bold leading-tight tracking-[-0.02em] text-[var(--fg)]">{title}</h2>
        {intro && <p className="mt-2 text-[15px] leading-relaxed text-[var(--fg-muted)] max-w-2xl">{intro}</p>}
      </header>
      {children}
    </section>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-[var(--bg-raised)] border border-[var(--border)] rounded-[14px] p-5 sm:p-6 ${className}`}>{children}</div>;
}

export function FocusQuestion({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[12px] bg-[var(--accent-dim)] px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)] mb-1">Ledningens fokusfråga</p>
      <p className="text-[15px] font-semibold text-[var(--fg)] leading-snug">{children}</p>
    </div>
  );
}

// ── Så läser du resultatet ──────────────────────────────────────────────

export function ScaleLegend() {
  return (
    <Card>
      <h3 className="font-semibold text-[var(--fg)] mb-1">Så läser du resultatet</h3>
      <p className="text-sm text-[var(--fg-muted)] leading-relaxed mb-4">
        Alla värden är på skalan 0–100 och har samma riktning: <strong className="text-[var(--fg)]">högre poäng betyder större behov
        eller större begränsning</strong>. Ett lågt värde är alltså bra. Totalpoängen är medelvärdet av de fyra dimensionerna.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {BANDS.map((b) => (
          <div key={b.index} className="rounded-[10px] px-3.5 py-3 border" style={{ backgroundColor: b.bg, borderColor: b.border }}>
            <p className="text-sm font-semibold" style={{ color: b.color }}>{b.label}</p>
            <p className="text-xs font-medium text-[var(--fg-muted)] mb-1">{b.range} p</p>
            <p className="text-xs leading-snug text-[var(--fg-muted)]">
              {['Goda förutsättningar. Fortsätt arbeta proaktivt.', 'Tydliga områden att stärka.', 'Riktade insatser rekommenderas.', 'Omedelbara, strategiska insatser behövs.'][b.index]}
            </p>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-1.5 text-xs text-[var(--fg-muted)] leading-relaxed">
        {DIM_KEYS.map((k) => (
          <li key={k}><strong className="text-[var(--fg)]">{DIMS[k].abbr} {DIMS[k].label}:</strong> {DIMS[k].reading}</li>
        ))}
        <li><strong className="text-[var(--fg)]">Insatsbehov (SI):</strong> hur stort behov ni själva ser av respektive insats, omräknat från skalan 1–5 till 0–100.</li>
      </ul>
    </Card>
  );
}

// ── Sammanfattning: nyckelkort och styrkor/risker ───────────────────────

export function KeyFacts({ items }: { items: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((it) => (
        <div key={it.label} className="rounded-[12px] bg-[var(--bg-raised)] border border-[var(--border)] px-4 py-3.5 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--fg-subtle)] mb-1">{it.label}</p>
          <p className="text-sm sm:text-[15px] font-bold leading-snug [overflow-wrap:anywhere] hyphens-auto" style={{ color: it.color ?? 'var(--fg)' }}>{it.value}</p>
        </div>
      ))}
    </div>
  );
}

export function FindingsList({ strengths, risks }: { strengths: Finding[]; risks: Finding[] }) {
  const col = (title: string, items: Finding[], color: string, bg: string, empty: string) => (
    <div className="rounded-[14px] p-5" style={{ backgroundColor: bg }}>
      <h3 className="font-semibold mb-3" style={{ color }}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((f) => (
            <li key={f.dim} className="flex gap-2.5">
              <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <div>
                <p className="text-sm font-semibold text-[var(--fg)]">{f.title}</p>
                <p className="text-sm text-[var(--fg-muted)] leading-snug">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {col('Styrkor', strengths, '#15803D', '#F0FDF4', 'Ingen dimension ligger under 50 poäng.')}
      {col('Risker', risks, '#B91C1C', '#FEF2F2', 'Ingen dimension ligger på 50 poäng eller mer.')}
    </div>
  );
}

// ── Dimensionskort ──────────────────────────────────────────────────────

export function DimensionCards({ scores }: { scores: CPIResult['scores'] }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {DIM_KEYS.map((k) => {
        const m = DIMS[k];
        const s = scores[k];
        const b = bandFor(s);
        return (
          <Card key={k} className="!p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] mb-1.5">{m.abbr}</span>
                <p className="font-semibold text-[var(--fg)] leading-tight">{m.label}</p>
                <p className="text-xs text-[var(--fg-muted)] mt-0.5">{m.question}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-bold leading-none" style={{ color: b.color }}>{s}</p>
                <span className="inline-block mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{ color: b.color, backgroundColor: b.bg, borderColor: b.border }}>{b.label}</span>
              </div>
            </div>
            <ScaleBar score={s} compact />
            <p className="text-sm text-[var(--fg-muted)] leading-relaxed mt-3">{m.bandText[b.index]}</p>
            <p className="text-[11px] text-[var(--fg-subtle)] mt-2 leading-snug">{m.reading}</p>
          </Card>
        );
      })}
    </div>
  );
}

// ── Fyra budskap ────────────────────────────────────────────────────────

export function MessageGrid({ messages }: { messages: Analysis['messages'] }) {
  const items = [
    { k: 'Styrka', m: messages.strength, c: '#15803D' },
    { k: 'Svaghet', m: messages.weakness, c: '#C2410C' },
    { k: 'Risk', m: messages.risk, c: '#B91C1C' },
    { k: 'Möjlighet', m: messages.opportunity, c: '#2655C4' },
  ];
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map(({ k, m, c }) => (
        <div key={k} className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-[14px] p-5 border-l-[5px]" style={{ borderLeftColor: c }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: c }}>{k}</p>
          <p className="font-bold text-[var(--fg)] leading-snug mb-1.5">{m.title}</p>
          <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{m.body}</p>
        </div>
      ))}
    </div>
  );
}

// ── Organisationens röst ────────────────────────────────────────────────

export function VoiceCards({ voice }: { voice: Analysis['voice'] }) {
  const items = [
    { k: 'Förändringsdrivare', q: 'Vad driver förändringen?', t: voice.drivers, c: '#2655C4' },
    { k: 'Friktion i vardagen', q: 'Vad tar längre tid eller skjuts upp?', t: voice.friction, c: '#B91C1C' },
    { k: 'Kritiska förmågor', q: 'Vad behöver stärkas de närmaste 12–24 månaderna?', t: voice.capabilities, c: '#C2410C' },
    { k: 'Önskade insatser', q: 'Hur vill ni utveckla kompetensen?', t: voice.wishes, c: '#15803D' },
  ];
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((it) => (
        <div key={it.k} className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-[14px] p-5 border-l-[5px]" style={{ borderLeftColor: it.c }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1.5" style={{ color: it.c }}>{it.k}</p>
          <p className="font-semibold text-[var(--fg)] leading-snug mb-2">{it.q}</p>
          <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{it.t}</p>
        </div>
      ))}
    </div>
  );
}

// ── Insatsbehov (SI) ────────────────────────────────────────────────────

export function InitiativeNeedBars({ siScores }: { siScores: CPIResult['siScores'] }) {
  const vals = [siScores.si1, siScores.si2, siScores.si3, siScores.si4];
  return (
    <Card>
      <h3 className="font-semibold text-[var(--fg)] mb-1">Insatsbehov ni själva ser</h3>
      <p className="text-xs text-[var(--fg-muted)] mb-4">Skala 0–100. Högre = större behov av insatsen.</p>
      <div className="space-y-4">
        {SI_LABELS.map((label, i) => {
          const pct = siToPct(vals[i]);
          const b = bandFor(pct);
          return (
            <div key={label}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-[var(--fg)]">{label}</span>
                <span className="font-semibold" style={{ color: b.color }}>{pct}</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--chip-bg)] overflow-hidden">
                <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: b.color, opacity: 0.85 }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Rekommendationer ────────────────────────────────────────────────────

const PRIORITY: Record<Recommendation['priority'], { label: string; color: string; bg: string }> = {
  high: { label: 'Hög prioritet', color: '#B91C1C', bg: '#FEF2F2' },
  medium: { label: 'Medel', color: '#A16207', bg: '#FEFCE8' },
  low: { label: 'Låg', color: '#15803D', bg: '#F0FDF4' },
};

const btnPrimary =
  'inline-flex items-center gap-1.5 px-3.5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-semibold rounded-[10px] transition-colors';
const btnGhost =
  'inline-flex items-center gap-1.5 px-3.5 py-2 border border-[var(--border)] bg-[var(--bg-raised)] hover:bg-[var(--chip-bg)] text-[var(--fg)] text-[13px] font-semibold rounded-[10px] transition-colors';

export function RecommendationCard({
  index, rec, courses, coursesLoading, via, showAdvisory,
}: {
  index: number;
  rec: Recommendation;
  courses: ReportCourse[];
  coursesLoading: boolean;
  via: string | null;
  showAdvisory: boolean;
}) {
  const p = PRIORITY[rec.priority];
  const suffix = via ? `?via=${encodeURIComponent(via)}` : '';
  const offertParams = new URLSearchParams({ q: rec.title.slice(0, 200) });
  if (via) offertParams.set('via', via);

  return (
    <Card className="!p-5">
      <div className="flex gap-4">
        <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white text-sm font-bold flex items-center justify-center shrink-0">{index + 1}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <p className="font-semibold text-[var(--fg)]">{rec.title}</p>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ color: p.color, backgroundColor: p.bg }}>{p.label}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[var(--accent-dim)] text-[var(--accent)]">{rec.dimension}</span>
          </div>
          <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{rec.body}</p>

          <div className="mt-4 pt-4 border-t border-[var(--border-light)] space-y-3">
            {coursesLoading ? (
              <div className="h-12 rounded-[10px] bg-[var(--chip-bg)] animate-pulse" />
            ) : courses.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--fg-subtle)] mb-2">Rekommenderad utbildning</p>
                <ul className="space-y-2">
                  {courses.map((c) => (
                    <li key={c.id}>
                      <Link to={c.slug ? `/kurs/${c.slug}${suffix}` : `/training/${c.id}${suffix}`}
                        className="group flex items-center gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 hover:border-[var(--accent)] transition-colors">
                        <GraduationCap className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-[var(--fg)] truncate group-hover:text-[var(--accent)]">{c.title}</span>
                          {c.providerName && <span className="block text-xs text-[var(--fg-muted)] truncate">{c.providerName}</span>}
                        </span>
                        <ArrowRight className="w-4 h-4 text-[var(--fg-subtle)] group-hover:text-[var(--accent)] shrink-0" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-[var(--fg-muted)]">
                Vi har ingen färdig utbildning som matchar den här rekommendationen. Begär en offert så tar vi fram förslag från lärosäten.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {!coursesLoading && courses.length === 0 && (
                <Link to={`/efterfraga?${offertParams.toString()}`} className={btnPrimary}>
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />Begär offert
                </Link>
              )}
              {!coursesLoading && courses.length > 0 && (
                <Link to={`/efterfraga?${offertParams.toString()}`} className={btnGhost}>
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />Begär offert på anpassad utbildning
                </Link>
              )}
              {showAdvisory && (
                <a href={ADVISORY_BOOKING_URL} target="_blank" rel="noopener noreferrer" className={btnGhost}>
                  <CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" />{ADVISORY_LABEL}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Tidslinje ───────────────────────────────────────────────────────────

export function Roadmap({ steps }: { steps: Analysis['roadmap'] }) {
  return (
    <ol className="relative space-y-6 pl-0">
      <span className="absolute left-[17px] top-3 bottom-3 w-[3px] rounded-full bg-[var(--border)]" aria-hidden="true" />
      {steps.map((s, i) => (
        <li key={s.period} className="relative flex gap-5">
          <span className="relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ backgroundColor: i < 2 ? 'var(--accent)' : 'var(--accent-hover)' }}>{i + 1}</span>
          <div className="pt-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{s.period}</p>
            <p className="font-bold text-[var(--fg)] leading-tight mb-1">{s.title}</p>
            <p className="text-sm text-[var(--fg-muted)] leading-relaxed max-w-xl">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
