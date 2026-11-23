import { BANDS, DIMS, DIM_KEYS, SI_LABELS, bandFor, siToPct } from '../../../lib/kompetensindexReport';
import type { CpiRecord } from '../pages/AdminDashboard';

export interface ReportStats {
  saved_total: number;
  saved_last_30d: number;
  users_with_reports: number;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {note && <p className="text-xs text-slate-500 mt-0.5 mb-3">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-3xl font-bold" style={{ color: color ?? '#0f172a' }}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

// Översikt över de analyser som just nu är filtrerade, med samma nivåer, färger och namn som rapporterna.
export interface CourseCoverage { total: number; tagged: number }

export function CpiDashboard({ records, reportStats, totalCount, courseCoverage }: { records: CpiRecord[]; reportStats: ReportStats | null; totalCount: number; courseCoverage?: CourseCoverage | null }) {
  const totals = records.map((r) => r.scores?.total ?? 0);
  const meanTotal = avg(totals);
  const meanBand = bandFor(meanTotal);

  const bandCounts = BANDS.map((b) => totals.filter((t) => bandFor(t).index === b.index).length);
  const commonest = BANDS[bandCounts.indexOf(Math.max(...bandCounts))];

  const last30 = records.filter((r) => Date.now() - new Date(r.created_at).getTime() < 30 * 24 * 3600 * 1000).length;

  const siMeans = [0, 1, 2, 3].map((i) =>
    avg(records.map((r) => (r.si_scores ? (r.si_scores as Record<string, number>)[`SI${i + 1}`] ?? 0 : 0)).filter((v) => v > 0).map(siToPct))
  );

  return (
    <div className="space-y-4 mb-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label="Analyser i urvalet" value={String(records.length)} sub={`${last30} senaste 30 dagarna · ${totalCount} totalt`} />
        <Kpi label="Snittindex" value={`${meanTotal}`} sub={`${meanBand.label} kompetenstryck`} color={meanBand.color} />
        <Kpi label="Vanligaste nivå" value={commonest.label} sub={`${Math.max(...bandCounts)} av ${records.length} analyser`} color={commonest.color} />
        {courseCoverage && (
          <Kpi
            label="Kurser som kan matchas"
            value={`${courseCoverage.tagged}/${courseCoverage.total}`}
            sub={courseCoverage.total === courseCoverage.tagged ? 'Alla publicerade kurser har kompetenser' : `${courseCoverage.total - courseCoverage.tagged} publicerade kurser saknar kompetenser`}
            color={courseCoverage.total > 0 && courseCoverage.tagged < courseCoverage.total ? '#C2410C' : undefined}
          />
        )}
        <Kpi
          label="Sparade rapporter"
          value={reportStats ? String(reportStats.saved_total) : '–'}
          sub={reportStats ? `${reportStats.saved_last_30d} senaste 30 dagarna · ${reportStats.users_with_reports} användare` : 'Visas när migrationen är körd'}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Genomsnitt per dimension" note="Skala 0–100. Högre poäng = större behov eller större begränsning.">
          <div className="space-y-3">
            {DIM_KEYS.map((d) => {
              const v = avg(records.map((r) => r.scores?.[d] ?? 0));
              const b = bandFor(v);
              return (
                <div key={d}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700"><strong className="text-slate-900">{DIMS[d].abbr}</strong> {DIMS[d].label}</span>
                    <span className="font-semibold" style={{ color: b.color }}>{v}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-2 rounded-full" style={{ width: `${v}%`, backgroundColor: b.color, opacity: 0.85 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Nivåfördelning (totalpoäng)" note="Antal analyser per nivå.">
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
              {BANDS.map((b, i) => (bandCounts[i] > 0 ? (
                <div key={b.index} style={{ width: `${(bandCounts[i] / Math.max(1, records.length)) * 100}%`, backgroundColor: b.color, opacity: 0.85 }} title={`${b.label}: ${bandCounts[i]}`} />
              ) : null))}
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3">
              {BANDS.map((b, i) => (
                <div key={b.index} className="text-center rounded-lg px-2 py-2 border" style={{ backgroundColor: b.bg, borderColor: b.border }}>
                  <p className="text-lg font-bold" style={{ color: b.color }}>{bandCounts[i]}</p>
                  <p className="text-[11px] text-slate-600">{b.label}</p>
                  <p className="text-[10px] text-slate-400">{b.range}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Insatsbehov (SI), snitt" note="Skala 0–100, omräknat från skalan 1–5.">
            <div className="space-y-2.5">
              {SI_LABELS.map((label, i) => {
                const b = bandFor(siMeans[i]);
                return (
                  <div key={label} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 text-slate-700">{label}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-2 rounded-full" style={{ width: `${siMeans[i]}%`, backgroundColor: b.color, opacity: 0.85 }} />
                    </div>
                    <span className="w-8 text-right font-semibold" style={{ color: b.color }}>{siMeans[i]}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
