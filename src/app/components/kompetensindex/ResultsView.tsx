import { useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { Sparkles, ExternalLink, Pencil, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { CPIResult } from '../pages/KompetensindexPage';
import { fetchESCOTerm } from '../../../lib/escoCache';

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
const DIM_DESCRIPTIONS: Record<string, string> = {
  AF: 'Mäter hur snabbt och djupt arbetsuppgifter, roller och processer förändras i er verksamhet — drivet av teknik, marknad eller omvärldsförändringar.',
  PF: 'Mäter i vilken grad kompetensbrist skapar friktion, förseningar och ineffektivitet i det dagliga arbetet och påverkar leveransförmågan.',
  OK: 'Mäter organisationens förmåga att anpassa sig, lära nytt och ställa om när verksamhetens krav förändras.',
  TR: 'Mäter hur tydlig riktning och strategi ni har för hur kompetens ska förnyas, rekryteras och utvecklas på 1–3 års sikt.',
};
const SI_LABELS = ['BRA', 'Kompetensväxling', 'Kompetensutveckling', 'Nya arbetssätt'];
const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};
const PRIORITY_LABELS: Record<string, string> = { high: 'Hög', medium: 'Medel', low: 'Låg' };

interface AnalysisResult {
  overallAssessment: string;
  topRisk: string;
  topAction: string;
  orgVoice: string;
  recommendations: { title: string; body: string; priority: 'high' | 'medium' | 'low' }[];
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
  onEditStep?: (step: number) => void;
  onReanalyze?: () => void;
}

function buildAnalysis(result: CPIResult): AnalysisResult {
  const { scores, siScores, answers } = result;
  const { AF, PF, OK, TR, total } = scores;

  const dims = ['AF', 'PF', 'OK', 'TR'] as const;
  const weakest = dims.reduce((a, b) => (scores[a] < scores[b] ? a : b));
  const strongest = dims.reduce((a, b) => (scores[a] > scores[b] ? a : b));

  const dimName: Record<string, string> = {
    AF: 'arbetsförändring', PF: 'prestationsfriktion', OK: 'omställningskapacitet', TR: 'transformationsriktning',
  };
  const dimNameCap: Record<string, string> = {
    AF: 'Arbetsförändring', PF: 'Prestationsfriktion', OK: 'Omställningskapacitet', TR: 'Transformationsriktning',
  };

  const pressureDesc = total < 25 ? 'lågt' : total < 50 ? 'måttligt' : total < 75 ? 'högt' : 'kritiskt';
  const pressureLevel = total < 25 ? 'low' : total < 50 ? 'medium' : 'high';

  const overallAssessment =
    `${answers.companyName} visar ett ${pressureDesc} kompetensstryck (${total}/100) inom ${answers.industry}. ` +
    `Starkast inom ${dimName[strongest]} (${scores[strongest]}p) — er tydligaste tillgång i kompetensarbetet. ` +
    `Svagast inom ${dimName[weakest]} (${scores[weakest]}p), vilket är det område som kräver mest uppmärksamhet framåt.`;

  const riskMap: Record<string, string> = {
    AF: `Arbetsförändringen går snabbt och riskerar att lämna medarbetare utan rätt förutsättningar. Om roller och processer förändras utan att kompetensen hänger med ökar prestationsgapet successivt.`,
    PF: `Prestationsfriktionen är hög — kompetensbrist skapar redan märkbara hinder i det dagliga arbetet. Utan riktade insatser riskerar leveransförmågan att försämras ytterligare.`,
    OK: `Omställningskapaciteten är låg, vilket gör organisationen sårbar när förutsättningarna ändras. Bristen på adaptiv förmåga kan fördröja nödvändiga omställningar och öka omställningskostnaden.`,
    TR: `Transformationsriktningen är otydlig — det saknas en sammanhållen strategi för hur kompetens ska förnyas. Utan tydlig riktning riskerar insatser att bli fragmenterade och ge begränsad effekt.`,
  };
  const topRisk = riskMap[weakest] ?? `${dimNameCap[weakest]}-dimensionen (${scores[weakest]}p) utgör den viktigaste risken och bör adresseras skyndsamt.`;

  const actionMap: Record<string, string> = {
    AF: `Genomför en strukturerad analys av vilka roller och kompetenser som förändras mest. Inled riktade insatser inom förändringsledning och digital kompetens för berörda team.`,
    PF: `Kartlägg de arbetsuppgifter som stannar upp eller tar längre tid på grund av kompetensbrist. Prioritera snabba kompetensinsatser — korta kurser eller workshops — inom de mest kritiska processerna.`,
    OK: `Bygg lärande strukturer in i vardagen: lärcirklar, intern mentoring och korta intensivutbildningar. Mät och följ upp omställningsförmågan regelbundet för att synliggöra framsteg.`,
    TR: `Ta fram en kompetensförsörjningsplan på 1–3 år som kopplar lärande direkt till verksamhetsmålen. Definiera tydliga prioriteringar kring rekrytering, kompetensväxling och kompetensutveckling.`,
  };
  const topAction = actionMap[weakest] ?? `Fokusera insatser på att stärka ${dimName[weakest]} — detta ger störst effekt på det totala kompetensindexet.`;

  const freetextParts: string[] = [];
  if (answers.af4) freetextParts.push(`Förändringsdrivkrafter: "${answers.af4}"`);
  if (answers.pf5) freetextParts.push(`Kompetensbristens effekt: "${answers.pf5}"`);
  if (answers.tr4) freetextParts.push(`Kritiska förmågor framåt: "${answers.tr4}"`);

  let orgVoice = '';
  if (freetextParts.length > 0) {
    orgVoice =
      freetextParts.join('. ') + '. ' +
      (answers.af4 && answers.af4.toLowerCase().includes('ai')
        ? 'AI och automatisering är centralt i er omställning — satsa på att bygga AI-litteracitet brett i organisationen. '
        : '') +
      `Sammantaget visar era svar på en organisation med ${pressureLevel === 'high' ? 'högt förändringstempo och tydliga kompetensgap' : 'medvetna kompetensbehov och god självkännedom'}. ` +
      `Ambitionsnivån indikerar att ni är redo för ${pressureLevel === 'high' ? 'riktade och skyndsamma' : 'proaktiva och strategiska'} kompetensinsatser.`;
  } else {
    orgVoice = 'Inga fritextsvar registrerades. Fyll i frågorna AF4, PF5 och TR4 för en mer personaliserad analys av organisationens röst och behov.';
  }

  const recommendations: AnalysisResult['recommendations'] = [];

  if (PF >= 50) {
    recommendations.push({
      title: 'Minska prestationsfriktion med riktad kompetensutveckling',
      body: `Med ett PF-värde på ${PF} finns tydliga hinder för effektiv prestation. Strukturerade kompetensprogram inom kärnprocesser kan snabbt minska friktion och förbättra leveransförmågan.`,
      priority: PF >= 70 ? 'high' : 'medium',
    });
  }

  if (AF >= 50) {
    recommendations.push({
      title: 'Stärk förändringsförmågan inför framtida omställning',
      body: `Arbetsförändringsdimensionen (${AF}p) signalerar att era roller och processer förändras snabbt. Utbildning i förändringsledning och digitala verktyg bör prioriteras för berörda team.`,
      priority: AF >= 70 ? 'high' : 'medium',
    });
  }

  if (OK < 50) {
    recommendations.push({
      title: 'Bygg intern omställningskapacitet',
      body: `Omställningskapaciteten på ${OK}p är lägre än önskat. Investera i lärande strukturer — t.ex. lärande i arbetet, mentorskap och korta intensivutbildningar — för att höja organisationens adaptiva förmåga.`,
      priority: OK < 30 ? 'high' : 'medium',
    });
  }

  if (TR < 60) {
    recommendations.push({
      title: 'Tydliggör transformationsriktningen',
      body: `Med TR-värde ${TR}p saknas delvis tydlig färdriktning för kompetensförsörjningen. Ta fram en kompetensförsörjningsplan som kopplar lärande till verksamhetsmålen på 1–3 års sikt.`,
      priority: TR < 40 ? 'high' : 'medium',
    });
  }

  if (siScores.si2 >= 4) {
    recommendations.push({
      title: 'Prioritera kompetensväxling framför rekrytering',
      body: 'Era svar indikerar högt behov av kompetensväxling. Att vidareutbilda befintlig personal är ofta snabbare och mer kostnadseffektivt än extern rekrytering, särskilt i ett tight kompetensläge.',
      priority: 'medium',
    });
  }

  if (siScores.si4 >= 4) {
    recommendations.push({
      title: 'Implementera nya arbetssätt och agila metoder',
      body: 'Behovet av nya arbetssätt är markant. Satsa på tvärfunktionella team, snabbare beslutscykler och kontinuerligt lärande som en del av det dagliga arbetet.',
      priority: 'medium',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: 'Fortsätt det goda arbetet med kompetensutveckling',
      body: `${answers.companyName} visar balanserade kompetensindexvärden. Fokusera på att upprätthålla nuvarande insatser och följa upp kompetensgapen kontinuerligt.`,
      priority: 'low',
    });
  }

  const escoMap: Record<string, string[]> = {
    teknik: ['mjukvaruutveckling', 'cybersäkerhet', 'molntjänster', 'AI och maskininlärning', 'DevOps'],
    vård: ['patientvård', 'medicinsk dokumentation', 'omvårdnad', 'hälsoinformatik', 'rehabilitering'],
    handel: ['kundservice', 'e-handel', 'supply chain management', 'merchandising', 'försäljningsstrategi'],
    utbildning: ['pedagogik', 'digitalt lärande', 'kursdesign', 'bedömning och utvärdering', 'mentorskap'],
    finans: ['finansiell analys', 'riskhantering', 'regelefterlevnad', 'redovisning', 'investeringsstrategi'],
    industri: ['processteknik', 'kvalitetsledning', 'lean produktion', 'underhållsteknik', 'produktionsstyrning'],
  };

  const industryLower = answers.industry.toLowerCase();
  const matchedKey = Object.keys(escoMap).find((k) => industryLower.includes(k));
  const escoTerms = matchedKey
    ? escoMap[matchedKey]
    : ['ledarskap och förändringsledning', 'digital kompetens', 'dataanalys', 'projektledning', 'agila arbetsmetoder'];

  return { overallAssessment, topRisk, topAction, orgVoice, recommendations, escoTerms };
}

function AnswerSummaryDrawer({
  result,
  onClose,
  onEditStep,
}: {
  result: CPIResult;
  onClose: () => void;
  onEditStep?: (step: number) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const { answers } = result;

  const stepAnswers = [
    {
      label: 'Info',
      rows: [
        { q: 'Företag', a: answers.companyName },
        { q: 'Bransch (SNI)', a: answers.industry },
        { q: 'Antal medarbetare', a: answers.companySize },
        { q: 'Din roll', a: answers.userRole },
      ],
    },
    {
      label: 'Arbetsförändring',
      rows: [
        { q: 'AF1', a: `${answers.af1}/5` },
        { q: 'AF2', a: `${answers.af2}/5` },
        { q: 'AF3', a: `${answers.af3}/5` },
        { q: 'AF4', a: answers.af4 || '—' },
      ],
    },
    {
      label: 'Prestationsfriktion',
      rows: [
        { q: 'PF1', a: `${answers.pf1}/5` },
        { q: 'PF2', a: `${answers.pf2}/5` },
        { q: 'PF3', a: `${answers.pf3}/5` },
        { q: 'PF4', a: `${answers.pf4}/5` },
        { q: 'PF5', a: answers.pf5 || '—' },
      ],
    },
    {
      label: 'Omställningskapacitet',
      rows: [
        { q: 'OK1', a: `${answers.ok1}/5` },
        { q: 'OK2', a: `${answers.ok2}/5` },
        { q: 'OK3', a: `${answers.ok3}/5` },
        { q: 'OK4', a: `${answers.ok4}/5` },
      ],
    },
    {
      label: 'Transformationsriktning',
      rows: [
        { q: 'TR1', a: `${answers.tr1}/5` },
        { q: 'TR2', a: `${answers.tr2}/5` },
        { q: 'TR3', a: `${answers.tr3}/5` },
        { q: 'TR4', a: answers.tr4 || '—' },
      ],
    },
    {
      label: 'Strategisk insats',
      rows: [
        { q: 'SI1', a: `${answers.si1}/5` },
        { q: 'SI2', a: `${answers.si2}/5` },
        { q: 'SI3', a: `${answers.si3}/5` },
        { q: 'SI4', a: `${answers.si4}/5` },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-slate-900">Dina svar</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 px-4 py-4 space-y-2">
          {stepAnswers.map((s, i) => (
            <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="font-medium text-slate-900 text-sm">{s.label}</span>
                </div>
                {expanded === i ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {expanded === i && (
                <div className="px-4 py-3 space-y-2">
                  {s.rows.map((row, j) => (
                    <div key={j} className="flex justify-between gap-3 text-sm">
                      <span className="text-slate-500 shrink-0">{row.q}</span>
                      <span className="text-slate-800 text-right">{row.a}</span>
                    </div>
                  ))}
                  {onEditStep && (
                    <button
                      onClick={() => { onEditStep(i); onClose(); }}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Ändra {s.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResultsView({ result, onReset, onEditStep }: ResultsViewProps) {
  const navigate = useNavigate();
  const { scores, siScores, escoSkills, answers } = result;
  const level = cpiLevel(scores.total);
  const siVals = [siScores.si1, siScores.si2, siScores.si3, siScores.si4];
  const [showDrawer, setShowDrawer] = useState(false);

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [escoResolved, setEscoResolved] = useState<EscoResolved[]>([]);

const runAnalysis = async () => {
    setLoading(true);
    setAnalysis(null);
    try {
      const res = await fetch('/api/analyze-cpi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: result.answers?.companyName,
          industry: result.answers?.industry,
          companySize: result.answers?.companySize,
          scores,
          freetext: result.answers,
          siScores,
        }),
      });
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setAnalysis(data);
    } catch (err) {
      console.error('Gemini-fel:', err);
      setAnalysis(buildAnalysis(result));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAnalysis();
  }, []);

  useEffect(() => {
    if (!analysis?.escoTerms?.length) return;
    Promise.allSettled(
      analysis.escoTerms.map(async (term): Promise<EscoResolved> => {
        try {
          const items = await fetchESCOTerm(term);
          const hit = items[0];
          return hit ? { title: hit.title, uri: hit.uri, term } : { title: term, uri: null, term };
        } catch (e) {
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
  }, [analysis]);

  const escoDisplay: EscoResolved[] =
    escoResolved.length > 0
      ? escoResolved
      : escoSkills.map((s) => ({ title: s.title, uri: (s as any).uri ?? null, term: s.title }));

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      {showDrawer && (
        <AnswerSummaryDrawer
          result={result}
          onClose={() => setShowDrawer(false)}
          onEditStep={onEditStep}
        />
      )}

      <div className="max-w-3xl mx-auto px-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Strategisk kompetensindex ®</h1>
            <p className="text-slate-500 text-sm mt-1">
              {answers.companyName} · <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">SNI</span> {answers.industry}
            </p>
          </div>
          <button
            onClick={() => setShowDrawer(true)}
            className="shrink-0 flex items-center gap-1.5 border border-blue-300 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Ändra svar
          </button>
        </div>

        {/* CPI Score card */}
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

        {/* Dimension scores */}
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
                <div className="h-1.5 rounded-full bg-slate-200 mt-3 mb-3">
                  <div className={`h-1.5 rounded-full ${DIM_COLORS[dim]}`} style={{ width: `${s}%` }} />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{DIM_DESCRIPTIONS[dim]}</p>
              </div>
            );
          })}
        </div>

        {/* Strategic profile */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Prioriterade kompetensinsatser</h3>
          <div className="space-y-3">
            {SI_LABELS.map((label, i) => {
              const val = siVals[i];
              const pct = Math.round(((val - 1) / 4) * 100);
              return (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-40 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200">
                    <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 w-6 text-right">{val}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI-analys */}
        <div className="bg-white rounded-xl border-l-4 border-blue-600 border border-slate-200 shadow-sm p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            AI-analys
          </h3>
          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
                <div className="h-3 bg-gray-200 rounded w-40 mb-2" />
                <div className="h-5 bg-gray-200 rounded w-[90%]" />
              </div>
              <div className="space-y-2">
                <div className="h-[14px] bg-gray-200 rounded w-full" />
                <div className="h-[14px] bg-gray-200 rounded w-[95%]" />
                <div className="h-[14px] bg-gray-200 rounded w-[70%]" />
              </div>
            </div>
          ) : analysis ? (
            <div style={{ animation: 'fadeIn 300ms ease-in' }} className="space-y-4">

              {/* Chefssammanfattning */}
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Chefssammanfattning</p>

              <div className="space-y-3">
                {/* 1. Övergripande bedömning */}
                <div className="bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Övergripande bedömning</p>
                  <p className="text-slate-800 text-sm leading-relaxed">{analysis.overallAssessment}</p>
                </div>

                {/* 2. Viktigaste risk */}
                <div className="bg-red-50 rounded-lg px-4 py-3 border border-red-100">
                  <p className="text-xs text-red-500 font-semibold uppercase tracking-wide mb-1">Viktigaste risk</p>
                  <p className="text-slate-800 text-sm leading-relaxed">{analysis.topRisk}</p>
                </div>

                {/* 3. Högst prioriterade åtgärd */}
                <div className="bg-amber-50 rounded-lg px-4 py-3 border border-amber-100">
                  <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-1">Högst prioriterade åtgärd</p>
                  <p className="text-slate-800 text-sm leading-relaxed">{analysis.topAction}</p>
                </div>

                {/* 4. Organisationens röst */}
                <div className="bg-blue-50 rounded-lg px-4 py-3 border border-blue-100">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Organisationens röst</p>
                  <p className="text-slate-800 text-sm leading-relaxed">{analysis.orgVoice}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-slate-600 text-sm">Analysen kunde inte genereras.</p>
              <button
                onClick={runAnalysis}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Försök igen
              </button>
            </div>
          )}
        </div>

        {/* ESCO skills */}
        {escoDisplay.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <span>🎯</span> Identifierade kompetenser enligt ESCO
            </h3>
            <p className="text-xs text-slate-500 mb-3">EU:s officiella kompetensstandard</p>
            <div className="flex flex-wrap gap-2">
              {escoDisplay.map((item) =>
                item.uri ? (
                  <a key={item.uri} href={item.uri} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm hover:bg-green-200 transition-colors flex items-center gap-1">
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

        {/* Recommendations */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Rekommendationer</h3>
          {loading ? (
            <div className="animate-pulse space-y-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4 pb-5 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="w-10 h-10 rounded-full bg-gray-200 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-[14px] bg-gray-200 rounded w-2/3" />
                    <div className="h-[14px] bg-gray-200 rounded w-full" />
                    <div className="h-[14px] bg-gray-200 rounded w-[85%]" />
                    <div className="h-[14px] bg-gray-200 rounded w-36 mt-1" />
                  </div>
                </div>
              ))}
            </div>
          ) : analysis?.recommendations?.length ? (
            <div className="space-y-4" style={{ animation: 'fadeIn 300ms ease-in' }}>
              {analysis.recommendations.map((rec, i) => (
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
                    <p className="text-slate-600 text-sm leading-relaxed mb-2">{rec.body}</p>
                    <button
                      onClick={() => navigate('/catalog')}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
                    >
                      Utforska utbildningar →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 space-y-3">
              <p className="text-slate-600 text-sm">Rekommendationer kunde inte laddas.</p>
              <button
                onClick={runAnalysis}
                className="inline-flex items-center gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Försök igen
              </button>
            </div>
          )}
        </div>

        {/* CTA */}
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
