import { useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { Loader2, Sparkles, ExternalLink } from 'lucide-react';
import { CPIResult } from '../pages/KompetensindexPage';

const cpiLevel = (score: number) => {
  if (score < 25) return { label: 'Lågt tryck', bg: '#F0FDF4', border: '#86EFAC', text: '#16A34A', desc: 'Er verksamhet upplever lågt kompetensstryck. Det finns goda förutsättningar att arbeta proaktivt med kompetensutveckling.' };
  if (score < 50) return { label: 'Måttligt tryck', bg: '#EFF6FF', border: '#93C5FD', text: '#2563EB', desc: 'Er verksamhet upplever ett måttligt kompetensstryck. Det finns tydliga områden att stärka för att möta framtida behov.' };
  if (score < 75) return { label: 'Högt tryck', bg: '#FFFBEB', border: '#FCD34D', text: '#D97706', desc: 'Er verksamhet upplever högt kompetensstryck. Riktade insatser rekommenderas för att undvika att kompetensgapet ökar.' };
  return { label: 'Kritiskt tryck', bg: '#FEF2F2', border: '#FCA5A5', text: '#DC2626', desc: 'Er verksamhet upplever kritiskt kompetensstryck. Omedelbara och strategiska insatser behövs för att hantera situationen.' };
};

const DIM_COLORS: Record<string, string> = {
  AF: 'bg-blue-500', PF: 'bg-red-500', OK: 'bg-green-500', TR: 'bg-amber-500',
};
const DIM_LABELS: Record<string, string> = {
  AF: 'Arbetsförändring', PF: 'Prestationsfriktion', OK: 'Omställningskapacitet', TR: 'Transformationsriktning',
};
const SI_LABELS = ['Rekrytering', 'Reskilling', 'Upskilling', 'Nya arbetssätt'];
const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};
const PRIORITY_LABELS: Record<string, string> = { high: 'Hög', medium: 'Medel', low: 'Låg' };

interface GeminiResult {
  summary: string;
  recommendations: { title: string; body: string; priority: 'high' | 'medium' | 'low' }[];
  chiefBriefing: string;
  escoTerms: string[];
}

interface EscoResolved {
  title: string;
  uri: string | null;
  term: string;
}

interface ResultsViewProps {
  result: CPIResult;
  onReset: () => void;
}

export function ResultsView({ result, onReset }: ResultsViewProps) {
  const navigate = useNavigate();
  const { scores, siScores, escoSkills, answers } = result;
  const level = cpiLevel(scores.total);
  const siVals = [siScores.si1, siScores.si2, siScores.si3, siScores.si4];

  const [gemini, setGemini] = useState<GeminiResult | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(true);
  const [geminiError, setGeminiError] = useState(false);
  const [escoResolved, setEscoResolved] = useState<EscoResolved[]>([]);

  useEffect(() => {
    const fetchGemini = async () => {
      try {
        const res = await fetch('/api/analyze-cpi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: answers.companyName,
            industry: answers.industry,
            companySize: answers.companySize,
            scores: { AF: scores.AF, PF: scores.PF, OK: scores.OK, TR: scores.TR, total: scores.total },
            siScores: { SI1: siScores.si1, SI2: siScores.si2, SI3: siScores.si3, SI4: siScores.si4 },
            freetext: { af4: answers.af4, pf5: answers.pf5, tr4: answers.tr4 },
          }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setGemini(data);
      } catch {
        setGeminiError(true);
      } finally {
        setGeminiLoading(false);
      }
    };
    fetchGemini();
  }, []);

  useEffect(() => {
    if (!gemini?.escoTerms?.length) return;
    Promise.allSettled(
      gemini.escoTerms.map(async (term): Promise<EscoResolved> => {
        try {
          const res = await fetch(
            `https://ec.europa.eu/esco/api/search?text=${encodeURIComponent(term)}&type=skill&language=sv`
          );
          if (!res.ok) return { title: term, uri: null, term };
          const data = await res.json();
          const hit = data._embedded?.results?.[0];
          return hit ? { title: hit.title, uri: hit.uri, term } : { title: term, uri: null, term };
        } catch {
          return { title: term, uri: null, term };
        }
      })
    ).then((results) => {
      setEscoResolved(
        results
          .filter((r) => r.status === 'fulfilled')
          .map((r) => (r as PromiseFulfilledResult<EscoResolved>).value)
      );
    });
  }, [gemini]);

  const escoDisplay: EscoResolved[] =
    escoResolved.length > 0
      ? escoResolved
      : escoSkills.map((s) => ({ title: s.title, uri: (s as any).uri ?? null, term: s.title }));

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="max-w-3xl mx-auto px-6 space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kompetensindex — Resultat</h1>
          <p className="text-slate-500 text-sm mt-1">{answers.companyName} · {answers.industry}</p>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-8 text-center"
          style={{ borderColor: level.border, backgroundColor: level.bg }}>
          <div className="text-7xl font-bold mb-2" style={{ color: level.text }}>
            {scores.total}<span className="text-3xl text-slate-400 font-normal"> / 100</span>
          </div>
          <span className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-3"
            style={{ backgroundColor: level.bg, color: level.text, border: `1px solid ${level.border}` }}>
            {level.label}
          </span>
          <p className="text-slate-600 text-sm max-w-md mx-auto">{level.desc}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {(['AF', 'PF', 'OK', 'TR'] as const).map((dim) => {
            const s = scores[dim];
            const dimLevel = cpiLevel(s);
            return (
              <div key={dim} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full mb-1">{dim}</span>
                    <p className="text-sm font-semibold text-slate-900">{DIM_LABELS[dim]}</p>
                  </div>
                  <span className="text-2xl font-bold" style={{ color: dimLevel.text }}>{s}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 mt-3">
                  <div className={`h-1.5 rounded-full ${DIM_COLORS[dim]}`} style={{ width: `${s}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Strategisk insatsprofil</h3>
          <div className="space-y-3">
            {SI_LABELS.map((label, i) => {
              const val = siVals[i];
              const pct = Math.round(((val - 1) / 4) * 100);
              return (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-36 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200">
                    <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 w-6 text-right">{val}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border-l-4 border-blue-600 border border-slate-200 shadow-sm p-6">
          <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            AI-analys
          </h3>
          {geminiLoading ? (
            <div className="flex items-center gap-3 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              Gemini analyserar era svar…
            </div>
          ) : geminiError || !gemini ? (
            <p className="text-slate-500 text-sm italic">Analys ej tillgänglig just nu.</p>
          ) : (
            <>
              {gemini.chiefBriefing && (
                <div className="bg-slate-50 rounded-lg px-4 py-3 mb-3 border border-slate-200">
                  <p className="text-xs text-slate-500 mb-1 font-medium">CHEFSBRIEFING</p>
                  <p className="text-slate-800 text-sm font-medium">{gemini.chiefBriefing}</p>
                </div>
              )}
              <p className="text-slate-700 text-sm leading-relaxed">{gemini.summary}</p>
            </>
          )}
        </div>

        {escoDisplay.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <span>🎯</span> Matchade ESCO-kompetenser
            </h3>
            <p className="text-xs text-slate-500 mb-3">EU:s officiella kompetensstandard</p>
            <div className="flex flex-wrap gap-2">
              {escoDisplay.map((item) =>
                item.uri ? (
                  <a
                    key={item.uri}
                    href={item.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm hover:bg-green-200 transition-colors flex items-center gap-1"
                  >
                    {item.title}
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                ) : (
                  <span key={item.term} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                    {item.title}
                  </span>
                )
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Rekommendationer</h3>
          {geminiLoading ? (
            <div className="flex items-center gap-3 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              Genererar rekommendationer…
            </div>
          ) : (
            <div className="space-y-4">
              {(gemini?.recommendations ?? []).map((rec, i) => (
                <div key={i} className="flex gap-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-slate-900 text-sm">{rec.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[rec.priority]}`}>
                        {PRIORITY_LABELS[rec.priority]}
                      </span>
                    </div>
                    <p className="text-slate-600 text-sm leading-relaxed">{rec.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-blue-600 rounded-xl p-8 text-center">
          <h3 className="text-xl font-bold text-white mb-2">Redo att hitta rätt utbildning?</h3>
          <p className="text-blue-100 text-sm mb-6">Matcha er kompetensprofil mot utbildningar från ledande lärosäten</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onReset}
              className="px-6 py-3 border border-white text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Gör en ny analys
            </button>
            <button
              onClick={() => navigate('/request?cpi=true')}
              className="px-6 py-3 bg-white text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors"
            >
              Begär offert från lärosäten →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}