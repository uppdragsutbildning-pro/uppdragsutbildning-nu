import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { CpiRecord } from '../pages/AdminDashboard';
import { DIMS, DIM_KEYS, bandFor, siToPct } from '../../../lib/kompetensindexReport';
import { ANSWER_LABEL, DIM_QUESTIONS, SI_QUESTIONS } from '../../../lib/skiQuestions';

interface CpiRecordDrawerProps {
  record: CpiRecord;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <span className="font-medium text-slate-900 text-sm">{title}</span>
      </div>
      <div className="px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

function Row({ q, a }: { q: string; a: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-500 shrink-0">{q}</span>
      <span className="text-slate-800 text-right">{a || '—'}</span>
    </div>
  );
}

function BandChip({ score }: { score: number | undefined }) {
  if (score == null) return null;
  const b = bandFor(score);
  return (
    <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border"
      style={{ color: b.color, backgroundColor: b.bg, borderColor: b.border }}>{b.label}</span>
  );
}

function QuestionRow({ id, text, value }: { id: string; text: string; value: number | undefined }) {
  return (
    <div className="text-sm">
      <p className="text-slate-500"><span className="font-semibold text-slate-700">{id}</span> {text}</p>
      <p className="text-slate-900 font-medium">{value ? `${value}/5 · ${ANSWER_LABEL[value] ?? ''}` : '—'}</p>
    </div>
  );
}

export function CpiRecordDrawer({ record, onClose }: CpiRecordDrawerProps) {
  const { scores, si_scores, freetext, li_preferences, ssyk_skills } = record;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-slate-900">{record.company_name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="px-4 pt-4 text-xs text-slate-500">
          Inskickad {new Date(record.created_at).toLocaleString('sv-SE')}
        </p>
        <div className="flex-1 px-4 py-4 space-y-3">
          <Section title="Kontakt & företag">
            <Row q="Namn" a={record.contact_name} />
            <Row q="E-post" a={record.contact_email} />
            <Row q="Företag" a={record.company_name} />
            <Row q="Bransch (SNI)" a={record.industry} />
            <Row q="Antal medarbetare" a={record.company_size} />
            <Row q="Roll" a={record.respondent_role} />
          </Section>

          <Section title="Strategiskt kompetensindex">
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-slate-500 shrink-0">Total</span>
              <span className="text-slate-900 font-semibold text-right">{scores?.total ?? '—'}<BandChip score={scores?.total} /></span>
            </div>
            {DIM_KEYS.map((d) => (
              <div key={d} className="flex justify-between gap-3 text-sm">
                <span className="text-slate-500 shrink-0">{DIMS[d].abbr} — {DIMS[d].label}</span>
                <span className="text-slate-800 text-right">{scores?.[d] ?? '—'}<BandChip score={scores?.[d]} /></span>
              </div>
            ))}
            <p className="text-[11px] text-slate-400 pt-1">Skala 0–100. Högre poäng = större behov eller större begränsning.</p>
          </Section>

          {record.answers ? (
            DIM_KEYS.map((d) => (
              <Section key={d} title={`Svar: ${DIMS[d].abbr} ${DIMS[d].label}`}>
                {DIM_QUESTIONS[d].scale.map((q) => (
                  <QuestionRow key={q.id} id={q.id} text={q.text} value={record.answers?.[q.field]} />
                ))}
                {DIM_QUESTIONS[d].reversed && (
                  <p className="text-[11px] text-slate-400">Positivt formulerade frågor: höga svar ger lågt poängvärde (omvänd skala).</p>
                )}
              </Section>
            ))
          ) : (
            <Section title="Svar per fråga">
              <p className="text-sm text-slate-500">Svaren på skalfrågorna sparades inte för analyser som gjordes innan 22 november 2026. Poängen ovan är beräknade från dem.</p>
            </Section>
          )}

          <Section title="Strategisk insats (SI)">
            {record.answers
              ? SI_QUESTIONS.map((q) => <QuestionRow key={q.id} id={q.id} text={q.text} value={record.answers?.[q.field]} />)
              : (['SI1', 'SI2', 'SI3', 'SI4'] as const).map((k, i) => (
                  <Row key={k} q={`${k} — ${['Rekrytering', 'Kompetensväxling', 'Kompetensutveckling', 'Nya arbetssätt'][i]}`}
                    a={si_scores?.[k] != null ? `${si_scores[k]}/5 (${siToPct(si_scores[k])}/100)` : ''} />
                ))}
          </Section>

          <Section title="Fritextsvar">
            <Row q="AF4 — Förändringsdrivkrafter" a={freetext?.af4} />
            <Row q="KP5 — Kompetensbristens effekt" a={freetext?.pf5} />
            <Row q="SR4 — Kritiska kompetenser framåt" a={freetext?.tr4} />
          </Section>

          <Section title="Lärande & insatser">
            <Row q="LI1 — Kompetensinsats" a={li_preferences?.insatstyp?.join(', ')} />
            <Row q="LI2 — Upplägg" a={li_preferences?.upplägg?.join(', ')} />
            <Row q="LI3 — Yrkesroller" a={li_preferences?.yrkesroller?.map((o) => o.label).join(', ')} />
          </Section>

          {ssyk_skills && ssyk_skills.length > 0 && (
            <Section title="Kompetenser (SSYK) kopplade till valda yrkesroller">
              <div className="flex flex-wrap gap-1.5">
                {ssyk_skills.map((skill) => (
                  <span key={skill.id} className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                    {skill.title}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
