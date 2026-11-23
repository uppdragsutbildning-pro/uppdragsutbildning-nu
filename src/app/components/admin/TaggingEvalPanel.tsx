import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Loader2, Search, Sparkles, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { searchCourseSkills, suggestCourseSkills, type CourseSkillTag } from '../../../lib/courseSkills';
import {
  computeMetrics, judgeAgainstGold, toGold, type EvalCase, type EvalTag, type GoldFile, type Metrics,
} from '../../../lib/taggingEval';

// Verktyg för att mäta hur bra kurstaggningen är. En person bedömer förslagen (rätt/fel) och lägger till rätta
// kompetenser som missades. Resultatet blir ett facit som kan exporteras och användas för att jämföra metoder.
// Inget skrivs till databasen: allt ligger i webbläsaren (och kan exporteras som JSON).

interface CourseRow { id: string; title: string; description: string; target_audience: string | null; learning_outcomes: string[]; is_active: boolean }

const STORAGE_KEY = 'ub.taggingEval.v1';
const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)} %`);

function loadSaved(): EvalCase[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as EvalCase[]; } catch { return []; }
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function MetricsBar({ m }: { m: Metrics }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label="Precision" value={pct(m.precision)} sub={`${m.tp} rätt, ${m.fp} fel`} />
        <Stat label="Täckning (recall)" value={pct(m.recall)} sub={`${m.fn} rätta saknades`} />
        <Stat label="F1" value={pct(m.f1)} />
        <Stat label="Kurser med träff" value={pct(m.hitRate)} sub={`av ${m.casesWithGold} med facit`} />
        <Stat label="Obedömda förslag" value={String(m.unjudged)} sub={`${m.casesWithoutSuggestions} kurser utan förslag`} />
      </div>
      <p className="text-xs text-slate-500">
        Säkra förslag: {pct(m.byConfidence.high.precision)} rätt · Övriga: {pct((() => {
          const tp = m.byConfidence.medium.tp + m.byConfidence.low.tp, fp = m.byConfidence.medium.fp + m.byConfidence.low.fp;
          return tp + fp > 0 ? tp / (tp + fp) : null;
        })())} · SSYK: {pct(m.bySource.ssyk.precision)} · ESCO: {pct(m.bySource.esco.precision)}
      </p>
    </div>
  );
}

function MissingSearch({ onAdd }: { onAdd: (t: EvalTag) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CourseSkillTag[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => searchCourseSkills(q, ctrl.signal).then(setResults).catch(() => setResults([])), 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lägg till rätt kompetens som saknas…"
          className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg divide-y divide-slate-100">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => { onAdd({ id: r.id, title: r.title, source: r.source }); setQ(''); setResults([]); }}
                className="w-full flex justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-slate-50">
                <span>{r.title}</span><span className="text-slate-400 uppercase">{r.source}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TaggingEvalPanel() {
  const [courses, setCourses] = useState<CourseRow[] | null>(null);
  const [cases, setCases] = useState<EvalCase[]>(loadSaved);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cases)); } catch { /* privat läge */ }
  }, [cases]);

  const metrics = useMemo(() => computeMetrics(cases), [cases]);

  async function loadCourses() {
    const { data, error } = await supabase
      .from('trainings')
      .select('id, title, description, target_audience, learning_outcomes, is_active')
      .order('created_at', { ascending: false })
      .limit(150);
    if (error) { toast.error('Kunde inte hämta kurser', { description: error.message }); return; }
    setCourses((data ?? []) as CourseRow[]);
  }

  async function fetchSuggestions(rows: CourseRow[], gold?: GoldFile) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { toast.error('Du är inte inloggad'); return; }
    setBusy({ done: 0, total: rows.length });
    const queue = [...rows];
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        const c = queue.shift()!;
        try {
          const list = await suggestCourseSkills(
            { title: c.title, description: c.description ?? '', targetAudience: c.target_audience ?? '', learningOutcomes: c.learning_outcomes ?? [] }, token
          );
          const base = { courseId: c.id, title: c.title, suggestions: list.map(({ id, title, source, confidence }) => ({ id, title, source, confidence })) };
          const judged = gold ? judgeAgainstGold(base, gold) : null;
          const next: EvalCase = { ...base, judged: judged?.judged ?? {}, missing: judged?.missing ?? [] };
          setCases((prev) => [...prev.filter((x) => x.courseId !== c.id), next]);
        } catch (e: any) {
          toast.error(`Förslag misslyckades för "${c.title}"`, { description: e?.message });
        }
        done += 1;
        setBusy({ done, total: rows.length });
      }
    };
    await Promise.all([worker(), worker()]);
    setBusy(null);
  }

  const toggleSel = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function setJudgement(courseId: string, tagId: string) {
    setCases((prev) => prev.map((c) => {
      if (c.courseId !== courseId) return c;
      const cur = c.judged[tagId];
      const judged = { ...c.judged };
      // obedömd -> rätt -> fel -> obedömd
      if (cur === undefined) judged[tagId] = true; else if (cur === true) judged[tagId] = false; else delete judged[tagId];
      return { ...c, judged };
    }));
  }

  const addMissing = (courseId: string, tag: EvalTag) =>
    setCases((prev) => prev.map((c) => (c.courseId === courseId && !c.missing.some((m) => m.id === tag.id) && !c.suggestions.some((s) => s.id === tag.id)
      ? { ...c, missing: [...c.missing, tag] } : c)));

  const removeMissing = (courseId: string, tagId: string) =>
    setCases((prev) => prev.map((c) => (c.courseId === courseId ? { ...c, missing: c.missing.filter((m) => m.id !== tagId) } : c)));

  function exportGold() {
    const gold = toGold(cases);
    if (gold.cases.length === 0) { toast.error('Inget facit att exportera än. Bedöm några förslag först.'); return; }
    const blob = new Blob([JSON.stringify(gold, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `taggningsfacit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importGold(file: File) {
    try {
      const gold = JSON.parse(await file.text()) as GoldFile;
      if (gold.version !== 1 || !Array.isArray(gold.cases)) throw new Error('Fel format');
      // Bedöm nuvarande förslag mot det importerade facit.
      setCases((prev) => prev.map((c) => {
        const j = judgeAgainstGold(c, gold);
        return j ? { ...c, ...j } : c;
      }));
      toast.success(`Facit importerat: ${gold.cases.length} kurser. Nuvarande förslag har bedömts automatiskt.`);
    } catch (e: any) {
      toast.error('Kunde inte läsa facit-filen', { description: e?.message });
    }
  }

  const selectedRows = (courses ?? []).filter((c) => selected.has(c.id));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">Utvärdera kurstaggning</h3>
        <p className="text-sm text-slate-500 mt-0.5 max-w-3xl">
          Hämta förslag för riktiga kurser och bedöm dem (klicka på ett förslag: rätt, fel, obedömt). Lägg till rätta kompetenser som saknades.
          Resultatet visar precision och täckning, och kan exporteras som facit för att jämföra metoder senare. Inget sparas i databasen.
        </p>
      </div>

      {/* Val av kurser */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {!courses && <button type="button" onClick={loadCourses} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50">Hämta kurser</button>}
          {courses && (
            <>
              <button type="button" onClick={() => setSelected(new Set(courses.slice(0, 30).map((c) => c.id)))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">Välj 30 första</button>
              <button type="button" onClick={() => setSelected(new Set())} className="px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">Rensa val</button>
              <button type="button" disabled={!!busy || selectedRows.length === 0} onClick={() => fetchSuggestions(selectedRows)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {busy ? `Hämtar ${busy.done}/${busy.total}…` : `Hämta förslag för ${selectedRows.length} kurser`}
              </button>
            </>
          )}
          <button type="button" onClick={exportGold} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"><Download className="w-4 h-4" />Exportera facit</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"><Upload className="w-4 h-4" />Importera facit</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importGold(f); e.target.value = ''; }} />
          {cases.length > 0 && (
            <button type="button" onClick={() => { if (confirm('Rensa alla bedömningar i webbläsaren?')) setCases([]); }} className="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50">Rensa allt</button>
          )}
        </div>
        {courses && (
          <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {courses.map((c) => (
              <label key={c.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} />
                <span className="flex-1 truncate">{c.title}</span>
                <span className="text-[11px] text-slate-400">{c.is_active ? 'Publicerad' : 'Utkast'}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {cases.length > 0 && <MetricsBar m={metrics} />}

      {/* Bedömning */}
      <div className="space-y-3">
        {cases.map((c) => (
          <div key={c.courseId} className="rounded-lg border border-slate-200 p-4 space-y-3">
            <p className="font-medium text-slate-900 text-sm">{c.title}</p>
            {c.suggestions.length === 0 ? (
              <p className="text-xs text-slate-400">Inga förslag hittades för kursen.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {c.suggestions.map((s) => {
                  const j = c.judged[s.id];
                  return (
                    <button key={s.id} type="button" onClick={() => setJudgement(c.courseId, s.id)}
                      title="Klicka: rätt, fel, obedömt"
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                        j === true ? 'border-green-300 bg-green-50 text-green-800' : j === false ? 'border-red-300 bg-red-50 text-red-700 line-through' : 'border-slate-200 bg-white text-slate-700'
                      }`}>
                      {j === true && <Check className="w-3 h-3" />}{j === false && <X className="w-3 h-3" />}
                      <span className={`w-1.5 h-1.5 rounded-full ${s.confidence === 'high' ? 'bg-green-500' : 'bg-slate-300'}`} />
                      {s.title}<span className="text-[9px] uppercase text-slate-400">{s.source}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {c.missing.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] text-slate-500 self-center">Saknades:</span>
                {c.missing.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                    {m.title}<span className="text-[9px] uppercase text-amber-600">{m.source}</span>
                    <button type="button" onClick={() => removeMissing(c.courseId, m.id)} aria-label={`Ta bort ${m.title}`}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <MissingSearch onAdd={(t) => addMissing(c.courseId, t)} />
          </div>
        ))}
      </div>
    </div>
  );
}
