import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft, CheckCircle, Circle, Loader2, X } from 'lucide-react';
import { ScaleButtons } from '../kompetensindex/ScaleButtons';
import { MultiSelectChips } from '../kompetensindex/MultiSelectChips';
import { QuestionCard } from '../kompetensindex/QuestionCard';
import { ResultsView } from '../kompetensindex/ResultsView';
import { supabase } from '../../../lib/supabase';

const STEPS = [
  { id: 'info', label: 'Info' },
  { id: 'af', label: 'AF' },
  { id: 'pf', label: 'PF' },
  { id: 'ok', label: 'OK' },
  { id: 'tr', label: 'TR' },
  { id: 'insats', label: 'Insats' },
];

const SECTION_COLORS: Record<string, string> = {
  af: 'border-blue-600',
  pf: 'border-red-500',
  ok: 'border-green-600',
  tr: 'border-blue-600',
  insats: 'border-amber-500',
};

type ESCOSkill = { title: string; uri: string };

interface Answers {
  companyName: string;
  industry: string;
  companySize: string;
  userRole: string;
  af1: number; af2: number; af3: number; af4: string;
  pf1: number; pf2: number; pf3: number; pf4: number; pf5: string;
  ok1: number; ok2: number; ok3: number; ok4: number;
  tr1: number; tr2: number; tr3: number; tr4: string;
  si1: number; si2: number; si3: number; si4: number;
  li1: string[]; li2: string[]; li3: string[];
}

const initialAnswers: Answers = {
  companyName: '', industry: '', companySize: '', userRole: '',
  af1: 0, af2: 0, af3: 0, af4: '',
  pf1: 0, pf2: 0, pf3: 0, pf4: 0, pf5: '',
  ok1: 0, ok2: 0, ok3: 0, ok4: 0,
  tr1: 0, tr2: 0, tr3: 0, tr4: '',
  si1: 0, si2: 0, si3: 0, si4: 0,
  li1: [], li2: [], li3: [],
};

function dimScore(vals: number[], reversed: boolean): number {
  const filled = vals.filter((v) => v > 0);
  if (!filled.length) return 50;
  const avg = filled.reduce((a, b) => a + b, 0) / filled.length;
  return reversed
    ? Math.round(((5 - avg) / 4) * 100)
    : Math.round(((avg - 1) / 4) * 100);
}

const extractTerms = (tr4: string, af4: string): string[] => {
  const text = (tr4 + ' ' + af4).toLowerCase();
  const map: [string, string][] = [
    ['ai', 'artificiell intelligens'],
    ['data', 'dataanalys'],
    ['digital', 'digital transformation'],
    ['ledarskap', 'ledarskap'],
    ['förändring', 'förändringsledning'],
    ['hållbar', 'hållbarhetsstrategi'],
    ['juridik', 'juridik'],
    ['compliance', 'regulatorisk efterlevnad'],
    ['projekt', 'projektledning'],
    ['kund', 'kundrelationer'],
    ['sälj', 'säljkompetens'],
    ['process', 'processutveckling'],
    ['kommunik', 'kommunikation'],
  ];
  const terms = map.filter(([kw]) => text.includes(kw)).map(([, t]) => t);
  return [...new Set(terms.length ? terms : ['kompetensutveckling'])];
};

const fetchESCOSkills = async (terms: string[]): Promise<ESCOSkill[]> => {
  const results: ESCOSkill[] = [];
  const seen = new Set<string>();
  for (const term of terms.slice(0, 4)) {
    try {
      const res = await fetch(
        `https://ec.europa.eu/esco/api/search?text=${encodeURIComponent(term)}&type=skill&language=sv&limit=3`
      );
      const data = await res.json();
      for (const item of data?._embedded?.results || []) {
        if (!seen.has(item.uri)) {
          seen.add(item.uri);
          results.push({ title: item.title || item.preferredLabel, uri: item.uri });
        }
      }
    } catch (_) { /* fail silently */ }
  }
  return results.slice(0, 8);
};

export interface CPIResult {
  scores: { AF: number; PF: number; OK: number; TR: number; total: number };
  siScores: { si1: number; si2: number; si3: number; si4: number };
  escoSkills: ESCOSkill[];
  answers: Answers;
}

export function KompetensindexPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefillAf4 = (location.state as { af4?: string } | null)?.af4 ?? '';
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({ ...initialAnswers, af4: prefillAf4 });
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<CPIResult | null>(null);
  const [openHint, setOpenHint] = useState<'af4' | 'pf5' | 'tr4' | null>(null);
  const [showExitDialog, setShowExitDialog] = useState(false);

  const toggleHint = (field: 'af4' | 'pf5' | 'tr4') =>
    setOpenHint((prev) => (prev === field ? null : field));

  const HINTS = {
    af4: {
      question: 'Tänk på det senaste halvåret — vad har tvingat er att ändra hur ni arbetar?',
      examples: [
        'AI och automatisering av arbetsflöden',
        'Förändrade kundförväntningar och nya affärsmodeller',
        'Nya regelverk och compliance-krav',
        'Snabbare produkt- eller tjänstecykler',
      ],
    },
    pf5: {
      question: 'Finns det projekt som drar ut på tiden, eller uppgifter som alltid hamnar längst ned på listan?',
      examples: [
        'Dataanalys och rapportering',
        'Kundkommunikation på nya digitala kanaler',
        'Implementering av nya system eller verktyg',
        'Strategisk planering och beslutsunderlag',
      ],
    },
    tr4: {
      question: 'Om ni skulle anställa fem personer imorgon — vilken kompetens saknas mest idag?',
      examples: [
        'Ledarskap i förändring och omställning',
        'Digital kompetens och AI-förståelse',
        'Analytisk förmåga och datadrivet beslutsfattande',
        'Kommunikation och förändringsledning',
      ],
    },
  };

  const HintBox = ({ field }: { field: 'af4' | 'pf5' | 'tr4' }) => {
    const hint = HINTS[field];
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => toggleHint(field)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          💡 Hjälp mig tänka
        </button>
        {openHint === field && (
          <div
            className="mt-2 rounded-lg p-3 text-sm relative"
            style={{ background: '#F0F4FF', border: '1px solid #D0DBFF', borderRadius: 8 }}
          >
            <button
              type="button"
              onClick={() => setOpenHint(null)}
              className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <p className="italic text-slate-500 mb-2 pr-5">{hint.question}</p>
            <p className="text-slate-500 text-xs mb-1">Andra verksamheter nämner ofta:</p>
            <ul className="space-y-0.5">
              {hint.examples.map((ex) => (
                <li key={ex} className="text-slate-600 text-xs flex items-start gap-1.5">
                  <span className="mt-0.5 text-blue-400">•</span>{ex}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const set = (field: keyof Answers, value: number | string | string[]) =>
    setAnswers((prev) => ({ ...prev, [field]: value }));

  const canProceed = (): boolean => {
    if (step === 0) return !!(answers.companyName && answers.industry && answers.companySize && answers.userRole);
    if (step === 1) return answers.af1 > 0 && answers.af2 > 0 && answers.af3 > 0;
    if (step === 2) return answers.pf1 > 0 && answers.pf2 > 0 && answers.pf3 > 0 && answers.pf4 > 0;
    if (step === 3) return answers.ok1 > 0 && answers.ok2 > 0 && answers.ok3 > 0 && answers.ok4 > 0;
    if (step === 4) return answers.tr1 > 0 && answers.tr2 > 0 && answers.tr3 > 0;
    if (step === 5) return answers.si1 > 0 && answers.si2 > 0 && answers.si3 > 0 && answers.si4 > 0;
    return false;
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setLoadingStep(0);

    const AF = dimScore([answers.af1, answers.af2, answers.af3], false);
    const PF = dimScore([answers.pf1, answers.pf2, answers.pf3, answers.pf4], false);
    const OK = dimScore([answers.ok1, answers.ok2, answers.ok3, answers.ok4], true);
    const TR = dimScore([answers.tr1, answers.tr2, answers.tr3], true);
    const total = Math.round((AF + PF + OK + TR) / 4);

    setLoadingStep(1);
    const terms = extractTerms(answers.tr4, answers.af4);
    const escoSkills = await fetchESCOSkills(terms);

    setLoadingStep(2);
    try {
      await supabase.from('cpi_results').insert({
        company_name: answers.companyName,
        industry: answers.industry,
        company_size: answers.companySize,
        respondent_role: answers.userRole,
        scores: { AF, PF, OK, TR, total },
        si_scores: { SI1: answers.si1, SI2: answers.si2, SI3: answers.si3, SI4: answers.si4 },
        freetext: { af4: answers.af4, pf5: answers.pf5, tr4: answers.tr4 },
        esco_skills: escoSkills,
        li_preferences: {
          insatstyp: answers.li1,
          upplägg: answers.li2,
          målgrupp: answers.li3,
        },
        created_at: new Date().toISOString(),
      });
    } catch (_) { /* fail silently if table doesn't exist yet */ }

    setResult({
      scores: { AF, PF, OK, TR, total },
      siScores: { si1: answers.si1, si2: answers.si2, si3: answers.si3, si4: answers.si4 },
      escoSkills,
      answers,
    });
    setLoading(false);
  };

  const reset = () => {
    setAnswers(initialAnswers);
    setStep(0);
    setResult(null);
    setLoadingStep(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const editStep = (targetStep: number) => {
    setResult(null);
    setStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-6" />
          <div className="space-y-3">
            {['Beräknar CPI-index…', 'Söker ESCO-kompetenser…', 'Genererar rekommendationer…'].map(
              (label, i) => (
                <div key={i} className={`flex items-center gap-3 text-sm ${i <= loadingStep ? 'text-green-600' : 'text-slate-400'}`}>
                  {i <= loadingStep ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                  {label}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <ResultsView
        result={result}
        onReset={reset}
        onEditStep={editStep}
        onReanalyze={handleAnalyze}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {showExitDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-slate-900 mb-2">Avbryt analysen?</h3>
            <p className="text-slate-600 text-sm mb-5">Dina svar sparas inte om du lämnar nu.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowExitDialog(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                Fortsätt analysen
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full border border-slate-200 text-slate-600 hover:bg-slate-50 py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                Lämna ändå
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowExitDialog(true)}
              className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 hover:underline transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Avbryt
            </button>
            <div className="flex items-center justify-between flex-1">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                      i < step ? 'bg-green-600 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {i < step ? '✓' : i + 1}
                    </div>
                    <span className={`text-xs mt-1 ${i === step ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`h-px w-8 sm:w-16 mx-1 mb-4 ${i < step ? 'bg-green-400' : 'bg-slate-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">Om er verksamhet</h2>
              <p className="text-slate-500 text-sm">Grundläggande information för att anpassa analysen</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Företagets namn</label>
                <input type="text" value={answers.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Ange företagsnamn" className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Bransch</label>
                <select value={answers.industry} onChange={(e) => set('industry', e.target.value)} className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                  <option value="" disabled>Välj bransch</option>
                  <option>Tillverkning &amp; Industri</option>
                  <option>Handel (detaljhandel &amp; grosshandel)</option>
                  <option>Transport &amp; Logistik</option>
                  <option>Bygg &amp; Fastighet</option>
                  <option>IT &amp; Telekommunikation</option>
                  <option>Finans &amp; Försäkring</option>
                  <option>Vård &amp; Omsorg</option>
                  <option>Utbildning</option>
                  <option>Offentlig förvaltning</option>
                  <option>Hotell, Restaurang &amp; Besöksnäring</option>
                  <option>Energi &amp; Miljö</option>
                  <option>Media &amp; Kommunikation</option>
                  <option>Juridik &amp; Konsulttjänster</option>
                  <option>Ideell sektor &amp; NGO</option>
                  <option>Annat</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Antal medarbetare</label>
                <select value={answers.companySize} onChange={(e) => set('companySize', e.target.value)} className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                  <option value="" disabled>Välj storlek</option>
                  <option>1–9</option>
                  <option>10–49</option>
                  <option>50–99</option>
                  <option>100–249</option>
                  <option>250–499</option>
                  <option>500–999</option>
                  <option>1 000–4 999</option>
                  <option>5 000+</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Din roll</label>
                <select value={answers.userRole} onChange={(e) => set('userRole', e.target.value)} className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                  <option value="" disabled>Välj roll</option>
                  <option>VD / CEO</option>
                  <option>HR-chef / HR-direktör</option>
                  <option>HR-specialist / HR-generalist</option>
                  <option>Utbildningsansvarig / L&amp;D-chef</option>
                  <option>Avdelningschef / Enhetschef</option>
                  <option>Ekonomichef / CFO</option>
                  <option>Operativ chef / COO</option>
                  <option>Inköpsansvarig</option>
                  <option>Medarbetare utan chefsroll</option>
                  <option>Annan chef</option>
                  <option>Styrelseledamot / Ägare</option>
                  <option>Annat</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className={`border-l-4 pl-4 ${SECTION_COLORS.af}`}>
              <h2 className="text-xl font-semibold text-slate-900">Arbetsförändring</h2>
              <p className="text-slate-500 text-sm">I vilken grad förändras er verksamhet?</p>
            </div>
            <QuestionCard id="AF1" question="I vilken grad förändras arbetssätten i er verksamhet idag?">
              <ScaleButtons value={answers.af1} onChange={(v) => set('af1', v)} labelLow="Knappt alls" labelHigh="I mycket hög grad" />
            </QuestionCard>
            <QuestionCard id="AF2" question="I vilken grad förväntas roller och arbetsuppgifter förändras de kommande två åren?">
              <ScaleButtons value={answers.af2} onChange={(v) => set('af2', v)} labelLow="Knappt alls" labelHigh="I mycket hög grad" />
            </QuestionCard>
            <QuestionCard id="AF3" question="I vilken grad har arbetet blivit mer komplext det senaste året?">
              <ScaleButtons value={answers.af3} onChange={(v) => set('af3', v)} labelLow="Knappt alls" labelHigh="I mycket hög grad" />
            </QuestionCard>
            <QuestionCard id="AF4" question="Vilka områden driver störst förändring just nu?" meta="Valfritt — hjälper oss att ge mer träffsäkra rekommendationer">
              <textarea value={answers.af4} onChange={(e) => set('af4', e.target.value)} placeholder="Beskriv de viktigaste förändringsdrivkrafterna, t.ex. AI, digitalisering, regelverk, kundkrav…" className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm min-h-[100px] resize-y focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
              <HintBox field="af4" />
            </QuestionCard>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className={`border-l-4 pl-4 ${SECTION_COLORS.pf}`}>
              <h2 className="text-xl font-semibold text-slate-900">Prestationsfriktion</h2>
              <p className="text-slate-500 text-sm">I vilken grad påverkar kompetensbrist er verksamhet?</p>
            </div>
            <QuestionCard id="PF1" question="I vilken grad påverkar kompetensbrist kvaliteten i arbetet?">
              <ScaleButtons value={answers.pf1} onChange={(v) => set('pf1', v)} labelLow="Ingen påverkan" labelHigh="Stor påverkan" />
            </QuestionCard>
            <QuestionCard id="PF2" question="I vilken grad påverkar kompetensbrist tempo eller produktivitet?">
              <ScaleButtons value={answers.pf2} onChange={(v) => set('pf2', v)} labelLow="Ingen påverkan" labelHigh="Stor påverkan" />
            </QuestionCard>
            <QuestionCard id="PF3" question="I vilken grad påverkar kompetensbrist leveransförmågan?">
              <ScaleButtons value={answers.pf3} onChange={(v) => set('pf3', v)} labelLow="Ingen påverkan" labelHigh="Stor påverkan" />
            </QuestionCard>
            <QuestionCard id="PF4" question="I vilken grad är verksamheten beroende av ett fåtal nyckelpersoner?">
              <ScaleButtons value={answers.pf4} onChange={(v) => set('pf4', v)} labelLow="Lågt beroende" labelHigh="Mycket högt beroende" />
            </QuestionCard>
            <QuestionCard id="PF5" question="Vilka arbetsuppgifter undviks, skjuts upp eller tar längre tid på grund av kompetensbrist?" meta="Valfritt">
              <textarea value={answers.pf5} onChange={(e) => set('pf5', e.target.value)} placeholder="T.ex. offerter dröjer, rapporter fördröjs, tekniska ärenden eskaleras uppåt…" className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm min-h-[100px] resize-y focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
              <HintBox field="pf5" />
            </QuestionCard>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className={`border-l-4 pl-4 ${SECTION_COLORS.ok}`}>
              <h2 className="text-xl font-semibold text-slate-900">Omställningskapacitet</h2>
              <p className="text-slate-500 text-sm">Hur väl rustad är organisationen att lära och ställa om?</p>
            </div>
            <QuestionCard id="OK1" question="I vilken grad har organisationen tid och struktur för lärande i vardagen?">
              <ScaleButtons value={answers.ok1} onChange={(v) => set('ok1', v)} labelLow="Ingen tid/struktur" labelHigh="Tydlig struktur" />
            </QuestionCard>
            <QuestionCard id="OK2" question="I vilken grad har organisationen förmåga att snabbt lära om och anpassa arbetssätt?">
              <ScaleButtons value={answers.ok2} onChange={(v) => set('ok2', v)} labelLow="Mycket låg" labelHigh="Mycket hög" />
            </QuestionCard>
            <QuestionCard id="OK3" question="I vilken grad upplever ni att organisationen är trygg i förändring?">
              <ScaleButtons value={answers.ok3} onChange={(v) => set('ok3', v)} labelLow="Inte alls trygg" labelHigh="Mycket trygg" />
            </QuestionCard>
            <QuestionCard id="OK4" question="I vilken grad utvecklas arbetssätt över team- eller avdelningsgränser?">
              <ScaleButtons value={answers.ok4} onChange={(v) => set('ok4', v)} labelLow="Sällan/aldrig" labelHigh="Systematiskt" />
            </QuestionCard>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className={`border-l-4 pl-4 ${SECTION_COLORS.tr}`}>
              <h2 className="text-xl font-semibold text-slate-900">Transformationsriktning</h2>
              <p className="text-slate-500 text-sm">Hur tydlig är er strategiska riktning för kompetensutveckling?</p>
            </div>
            <QuestionCard id="TR1" question="I vilken grad är det tydligt vilka förmågor organisationen behöver utveckla framåt?">
              <ScaleButtons value={answers.tr1} onChange={(v) => set('tr1', v)} labelLow="Oklart" labelHigh="Mycket tydligt" />
            </QuestionCard>
            <QuestionCard id="TR2" question="I vilken grad är framtida kompetensbehov kopplade till affärs- eller verksamhetsmål?">
              <ScaleButtons value={answers.tr2} onChange={(v) => set('tr2', v)} labelLow="Inte alls" labelHigh="Tydligt kopplade" />
            </QuestionCard>
            <QuestionCard id="TR3" question="I vilken grad finns en tydlig plan för om kompetens ska rekryteras, reskillas eller utvecklas internt?">
              <ScaleButtons value={answers.tr3} onChange={(v) => set('tr3', v)} labelLow="Ingen plan" labelHigh="Tydlig plan" />
            </QuestionCard>
            <QuestionCard id="TR4" question="Vilka förmågor bedömer ni som mest kritiska de kommande 12–24 månaderna?" meta="Valfritt — används för ESCO-matchning">
              <textarea value={answers.tr4} onChange={(e) => set('tr4', e.target.value)} placeholder="T.ex. AI och dataanalys, ledarskap i förändring, hållbarhetsrapportering…" className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm min-h-[100px] resize-y focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
              <HintBox field="tr4" />
            </QuestionCard>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div className={`border-l-4 pl-4 ${SECTION_COLORS.insats}`}>
              <h2 className="text-xl font-semibold text-slate-900">Strategisk insats</h2>
              <p className="text-slate-500 text-sm">Vilka insatser och vilket upplägg passar er bäst?</p>
            </div>
            <QuestionCard id="SI1" question="I vilken grad ser ni behov av rekrytering av ny kompetens?">
              <ScaleButtons value={answers.si1} onChange={(v) => set('si1', v)} labelLow="Inget behov" labelHigh="Stort behov" />
            </QuestionCard>
            <QuestionCard id="SI2" question="I vilken grad ser ni behov av reskilling av befintliga medarbetare?">
              <ScaleButtons value={answers.si2} onChange={(v) => set('si2', v)} labelLow="Inget behov" labelHigh="Stort behov" />
            </QuestionCard>
            <QuestionCard id="SI3" question="I vilken grad ser ni behov av intern kompetenshöjning/upskilling?">
              <ScaleButtons value={answers.si3} onChange={(v) => set('si3', v)} labelLow="Inget behov" labelHigh="Stort behov" />
            </QuestionCard>
            <QuestionCard id="SI4" question="I vilken grad ser ni behov av nya arbetssätt eller processförändringar?">
              <ScaleButtons value={answers.si4} onChange={(v) => set('si4', v)} labelLow="Inget behov" labelHigh="Stort behov" />
            </QuestionCard>
            <div className="border-t border-slate-200 pt-5 space-y-5">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div>
                  <p className="text-slate-900 font-medium mb-3">Vilken typ av kompetensinsats tror ni skulle ge störst effekt?</p>
                  <MultiSelectChips options={['Kort kurs (1–3 dagar)', 'Längre program', 'Workshop', 'Coaching & mentoring', 'Skräddarsydd uppdragsutbildning']} selected={answers.li1} onChange={(v) => set('li1', v)} />
                </div>
                <div>
                  <p className="text-slate-900 font-medium mb-3">Vilket upplägg passar er verksamhet bäst?</p>
                  <MultiSelectChips options={['Digitalt/online', 'Fysiskt/på plats', 'Blended (mix)', 'Cohort-baserat', 'Självstudier i egen takt']} selected={answers.li2} onChange={(v) => set('li2', v)} />
                </div>
                <div>
                  <p className="text-slate-900 font-medium mb-3">Vilka målgrupper är mest prioriterade?</p>
                  <MultiSelectChips options={['Ledare & chefer', 'Specialister', 'Frontlinje/operativ', 'Stödfunktioner', 'Projektledare', 'Hela organisationen']} selected={answers.li3} onChange={(v) => set('li3', v)} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <button onClick={() => setStep((s) => s - 1)} className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
              ← Tillbaka
            </button>
          ) : <div />}
          {step < 5 ? (
            <button onClick={() => { setStep((s) => s + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={!canProceed()} className="px-8 py-3 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Nästa →
            </button>
          ) : (
            <button onClick={handleAnalyze} disabled={!canProceed()} className="px-8 py-3 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Analysera →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}