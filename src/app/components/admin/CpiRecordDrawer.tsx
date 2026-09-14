import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { CpiRecord } from '../pages/AdminDashboard';

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

          <Section title="CPI-poäng">
            <Row q="Total" a={String(scores?.total ?? '')} />
            <Row q="AF — Arbetsförändring" a={String(scores?.AF ?? '')} />
            <Row q="LF — Leveransfriktion" a={String(scores?.LF ?? '')} />
            <Row q="OK — Omställningskapacitet" a={String(scores?.OK ?? '')} />
            <Row q="TR — Transformationsriktning" a={String(scores?.TR ?? '')} />
          </Section>

          <Section title="Strategisk insats">
            <Row q="SI1 — Rekrytering" a={si_scores?.SI1 != null ? `${si_scores.SI1}/5` : ''} />
            <Row q="SI2 — Kompetensväxling" a={si_scores?.SI2 != null ? `${si_scores.SI2}/5` : ''} />
            <Row q="SI3 — Kompetensutveckling" a={si_scores?.SI3 != null ? `${si_scores.SI3}/5` : ''} />
            <Row q="SI4 — Nya arbetssätt" a={si_scores?.SI4 != null ? `${si_scores.SI4}/5` : ''} />
          </Section>

          <Section title="Fritextsvar">
            <Row q="AF4 — Förändringsdrivkrafter" a={freetext?.af4} />
            <Row q="LF5 — Kompetensbristens effekt" a={freetext?.pf5} />
            <Row q="TR4 — Kritiska kompetenser framåt" a={freetext?.tr4} />
          </Section>

          <Section title="Lärande & insatser">
            <Row q="LI1 — Kompetensinsats" a={li_preferences?.insatstyp?.join(', ')} />
            <Row q="LI2 — Upplägg" a={li_preferences?.upplägg?.join(', ')} />
            <Row q="LI3 — Yrkesroller" a={li_preferences?.yrkesroller?.map((o) => o.label).join(', ')} />
          </Section>

          {ssyk_skills && ssyk_skills.length > 0 && (
            <Section title="SSYK-kompetenser">
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
