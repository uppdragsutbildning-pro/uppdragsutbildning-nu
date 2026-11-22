import { useNavigate } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { Pencil, X, ChevronDown, ChevronUp, RefreshCw, Download } from 'lucide-react';
import type { CPIResult } from '../pages/KompetensindexPage';
import { useMarketplace } from '../../../lib/marketplaceContext';
import {
  DIMS, TOTAL_BAND_TEXT, bandFor, buildRuleAnalysis, computeFindings, mergeAnalysis,
  recommendedStart, selectInitiatives, zoneFor, DIM_KEYS, type Analysis,
} from '../../../lib/kompetensindexReport';
import { loadCoursesForReport, matchRecommendations, type ReportCourse } from '../../../lib/reportCourseMatching';
import { DimensionRadar, PressureQuadrant, PriorityMatrix, ScoreGauge } from './report/ReportCharts';
import {
  Card, DimensionCards, FindingsList, FocusQuestion, InitiativeNeedBars, KeyFacts, MessageGrid,
  RecommendationCard, Roadmap, ScaleLegend, Section, VoiceCards,
} from './report/ReportSections';

interface ResultsViewProps {
  result: CPIResult;
  onReset: () => void;
  onEditStep?: (step: number) => void;
  onReanalyze?: () => void;
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
      label: 'Kompetenspåverkan',
      rows: [
        { q: 'KP1', a: `${answers.pf1}/5` },
        { q: 'KP2', a: `${answers.pf2}/5` },
        { q: 'KP3', a: `${answers.pf3}/5` },
        { q: 'KP4', a: `${answers.pf4}/5` },
        { q: 'KP5', a: answers.pf5 || '—' },
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
      label: 'Strategisk riktning',
      rows: [
        { q: 'SR1', a: `${answers.tr1}/5` },
        { q: 'SR2', a: `${answers.tr2}/5` },
        { q: 'SR3', a: `${answers.tr3}/5` },
        { q: 'SR4', a: answers.tr4 || '—' },
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
    {
      label: 'Lärande & insatser',
      rows: [
        { q: 'LI1', a: answers.li1.join(', ') || '—' },
        { q: 'LI2', a: answers.li2.join(', ') || '—' },
        { q: 'LI3', a: answers.li3.map((o) => o.label).join(', ') || '—' },
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
        <p className="px-4 pt-4 text-xs text-slate-500">Skala: 1 = Inte alls, 5 = Mycket hög grad</p>
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
  const { marketplace, loading: marketplaceLoading } = useMarketplace();
  const { scores, siScores, ssykSkills, occupations, answers } = result;
  const [showDrawer, setShowDrawer] = useState(false);

  const ruleAnalysis = useMemo(() => buildRuleAnalysis(result), [result]);
  const [analysis, setAnalysis] = useState<Analysis>(ruleAnalysis);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiFailed, setAiFailed] = useState(false);

  const [courses, setCourses] = useState<ReportCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  const runAnalysis = async () => {
    setAiLoading(true);
    setAiFailed(false);
    try {
      const res = await fetch('/api/analyze-cpi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: answers?.companyName,
          industry: answers?.industry,
          companySize: answers?.companySize,
          scores,
          freetext: { af4: answers.af4, pf5: answers.pf5, tr4: answers.tr4, li1: answers.li1, li2: answers.li2 },
          siScores,
          occupations: occupations.map((occ) => ({
            label: occ.label,
            definition: occ.definition,
            ssykGroupLabel: occ.ssykGroupLabel,
            skills: occ.skills.map((s) => s.title),
          })),
        }),
      });
      if (!res.ok) throw new Error('API error');
      setAnalysis(mergeAnalysis(ruleAnalysis, await res.json()));
    } catch (err) {
      console.error('Analysfel:', err);
      setAnalysis(ruleAnalysis);
      setAiFailed(true);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    runAnalysis();
  }, []);

  // Kurser hämtas när marknadsplatskontexten är känd, så att urvalet följer en partners kuraterade kurser.
  useEffect(() => {
    if (marketplaceLoading) return;
    let active = true;
    setCoursesLoading(true);
    loadCoursesForReport(marketplace)
      .then((c) => active && setCourses(c))
      .catch((e) => { console.error('Kunde inte hämta kurser:', e); if (active) setCourses([]); })
      .finally(() => active && setCoursesLoading(false));
    return () => { active = false; };
  }, [marketplace?.id, marketplaceLoading]);

  const total = bandFor(scores.total);
  const zone = zoneFor(scores.AF, scores.OK);
  const { strengths, risks } = computeFindings(scores);
  const strongest = DIM_KEYS.reduce((a, b) => (scores[a] <= scores[b] ? a : b));
  const weakest = DIM_KEYS.reduce((a, b) => (scores[a] >= scores[b] ? a : b));
  const initiatives = useMemo(() => selectInitiatives(result), [result]);
  const startHere = recommendedStart(initiatives);

  const courseMap = useMemo(
    () => matchRecommendations(analysis.recommendations, courses, ssykSkills.map((s) => s.id)),
    [analysis.recommendations, courses, ssykSkills]
  );

  const via = marketplace?.slug ?? null;
  // Partnermarknadsplatser är helt vitmärkta: CTC Nordics rådgivning visas bara på den öppna plattformen.
  const showAdvisory = !marketplace;

  return (
    <div className="ub-theme min-h-screen">
      {showDrawer && <AnswerSummaryDrawer result={result} onClose={() => setShowDrawer(false)} onEditStep={onEditStep} />}

      <div className="max-w-4xl mx-auto px-5 sm:px-6 py-10 space-y-14">

        {/* Rubrik */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)] mb-1.5">Strategiskt kompetensindex</p>
            <h1 className="text-[clamp(1.6rem,3.5vw,2.2rem)] font-bold leading-[1.15] tracking-[-0.025em] text-[var(--fg)]">{answers.companyName}</h1>
            <p className="text-sm text-[var(--fg-muted)] mt-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">SNI</span> {answers.industry}
              {answers.companySize ? ` · ${answers.companySize} medarbetare` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled title="PDF-rapporten kommer i nästa version"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border border-[var(--border)] text-[var(--fg-subtle)] text-sm font-medium cursor-not-allowed">
              <Download className="w-3.5 h-3.5" aria-hidden="true" />PDF kommer snart
            </button>
            <button onClick={() => setShowDrawer(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-raised)] hover:bg-[var(--chip-bg)] text-[var(--fg)] text-sm font-medium transition-colors">
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />Ändra svar
            </button>
          </div>
        </div>

        {/* 1. Sammanfattning */}
        <Section eyebrow="01 / Sammanfattning" title="Ledningsöversikt" intro="Det viktigaste på en skärm: var ni står, vad som är starkast och vad som behöver prioriteras.">
          <div className="grid md:grid-cols-[320px_1fr] gap-4 items-stretch">
            <Card className="flex flex-col items-center justify-center text-center">
              <ScoreGauge score={scores.total} />
              <span className="inline-block px-3.5 py-1 rounded-full text-sm font-semibold border mt-1"
                style={{ color: total.color, backgroundColor: total.bg, borderColor: total.border }}>
                {total.label} kompetenstryck
              </span>
              <p className="text-sm text-[var(--fg-muted)] leading-relaxed mt-3">{TOTAL_BAND_TEXT[total.index]}</p>
            </Card>
            <div className="space-y-4">
              <KeyFacts items={[
                { label: 'Index', value: `${scores.total}/100`, color: total.color },
                { label: 'Nivå', value: total.label, color: total.color },
                { label: 'Starkast', value: DIMS[strongest].label },
                { label: 'Prioritet', value: DIMS[weakest].label },
              ]} />
              <Card>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)] mb-2">Övergripande bedömning</p>
                {aiLoading ? <SkeletonLines /> : <p className="text-[15px] text-[var(--fg)] leading-relaxed">{analysis.overallAssessment}</p>}
                {!aiLoading && (
                  <div className="grid sm:grid-cols-2 gap-3 mt-4">
                    <div className="rounded-[10px] bg-[#FEF2F2] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#B91C1C] mb-1">Viktigaste risk</p>
                      <p className="text-sm text-[var(--fg)] leading-snug">{analysis.topRisk}</p>
                    </div>
                    <div className="rounded-[10px] bg-[var(--accent-dim)] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)] mb-1">Högst prioriterade åtgärd</p>
                      <p className="text-sm text-[var(--fg)] leading-snug">{analysis.topAction}</p>
                    </div>
                  </div>
                )}
                {aiFailed && (
                  <button onClick={runAnalysis} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline">
                    <RefreshCw className="w-3 h-3" aria-hidden="true" />Texten är en standardanalys. Försök hämta AI-analysen igen
                  </button>
                )}
              </Card>
            </div>
          </div>
          <FindingsList strengths={strengths} risks={risks} />
          <ScaleLegend />
        </Section>

        {/* 2. Profil */}
        <Section eyebrow="02 / Profil" title="Era fyra dimensioner" intro="Varje dimension visas på skalan 0–100. Markören visar var ni ligger.">
          <Card className="!py-4"><DimensionRadar scores={scores} /></Card>
          <DimensionCards scores={scores} />
          <FocusQuestion>{analysis.focus.profile}</FocusQuestion>
        </Section>

        {/* 3. Tryck mot kapacitet */}
        <Section eyebrow="03 / Förändringstryck" title="Tryck mot omställningskapacitet"
          intro="Visar var genomförandeovisshet uppstår: hur snabbt arbetet förändras (AF) mot hur begränsad organisationens förmåga att ställa om är (OK).">
          <Card>
            <PressureQuadrant AF={scores.AF} OK={scores.OK} zone={zone} />
            <div className="mt-4 rounded-[12px] px-4 py-3.5 border" style={{ borderColor: zone.color + '55', backgroundColor: zone.color + '10' }}>
              <p className="text-sm font-semibold mb-0.5" style={{ color: zone.color }}>Er zon: {zone.label}</p>
              <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{zone.text}</p>
            </div>
          </Card>
          <FocusQuestion>{analysis.focus.quadrant}</FocusQuestion>
        </Section>

        {/* 4. Budskap */}
        <Section eyebrow="04 / Viktigaste insikterna" title="Fyra budskap att ta vidare" intro="Styrka, svaghet, risk och möjlighet sammanfattar vad resultaten betyder.">
          {aiLoading ? <SkeletonGrid /> : <MessageGrid messages={analysis.messages} />}
          <FocusQuestion>{analysis.focus.messages}</FocusQuestion>
        </Section>

        {/* 5. Röst */}
        <Section eyebrow="05 / Organisationens röst" title="Era egna ord"
          intro="Svaren på de öppna frågorna och era val av insatser, sammanfattade. Underlaget är en respondents svar.">
          {aiLoading ? <SkeletonGrid /> : <VoiceCards voice={analysis.voice} />}
        </Section>

        {/* 6. Prioritering */}
        <Section eyebrow="06 / Prioritering" title="Effekt mot genomförandeinsats"
          intro="Insatserna är valda utifrån er profil och placerade efter förväntad effekt och hur mycket arbete de kräver.">
          <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
            <Card><PriorityMatrix items={initiatives} /></Card>
            <InitiativeNeedBars siScores={siScores} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-[14px] p-5 border-l-[5px] border-l-[#15803D]">
              <p className="font-semibold text-[var(--fg)] mb-1">Rekommenderad start</p>
              <p className="text-sm text-[var(--fg-muted)] leading-relaxed">
                {startHere.map((i) => i.label).join(', ')} ger hög effekt med rimlig insats och skapar förutsättningar för mer träffsäkra satsningar.
              </p>
            </div>
            <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-[14px] p-5 border-l-[5px] border-l-[#C2410C]">
              <p className="font-semibold text-[var(--fg)] mb-1">Beslutsprincip</p>
              <p className="text-sm text-[var(--fg-muted)] leading-relaxed">
                Börja med hög effekt och låg till måttlig insats. Starta större program först när målgrupp, behov och effektmått är tydliga.
              </p>
            </div>
          </div>
          <FocusQuestion>{analysis.focus.priority}</FocusQuestion>
        </Section>

        {/* 7. Kompetenser (SSYK) */}
        {ssykSkills.length > 0 && (
          <Section eyebrow="07 / Kompetensfokus" title="Kompetenser kopplade till era yrkesroller"
            intro="Enligt Arbetsförmedlingens yrkestaxonomi SSYK 2012. Kompetenserna används för att matcha rekommendationerna mot utbildningar.">
            <Card>
              <div className="flex flex-wrap gap-2">
                {ssykSkills.map((item) => (
                  <span key={item.id} className="px-3 py-1 rounded-full text-sm bg-[var(--accent-dim)] text-[var(--accent)] font-medium">{item.title}</span>
                ))}
              </div>
            </Card>
          </Section>
        )}

        {/* 8. Rekommendationer */}
        <Section eyebrow={`0${ssykSkills.length > 0 ? 8 : 7} / Rekommendationer`} title="Vad vi rekommenderar"
          intro="Under varje rekommendation visas utbildningar som matchar. Finns ingen färdig utbildning kan ni begära offert eller boka ett rådgivningssamtal.">
          {aiLoading ? (
            <SkeletonGrid rows={3} single />
          ) : (
            <div className="space-y-4">
              {analysis.recommendations.map((rec, i) => (
                <RecommendationCard key={`${rec.title}-${i}`} index={i} rec={rec} courses={courseMap.get(i) ?? []}
                  coursesLoading={coursesLoading} via={via} showAdvisory={showAdvisory} />
              ))}
            </div>
          )}
        </Section>

        {/* 9. 12 månader */}
        <Section eyebrow={`0${ssykSkills.length > 0 ? 9 : 8} / Handlingsplan`} title="Föreslagen väg framåt" intro="En enkel 12-månadersplan från nuläge till effekt.">
          {aiLoading ? <SkeletonGrid rows={2} single /> : <Roadmap steps={analysis.roadmap} />}
        </Section>

        {/* 10. Nästa steg */}
        <section className="rounded-[18px] bg-[var(--accent)] text-white px-6 sm:px-10 py-10 text-center">
          <h2 className="text-[clamp(1.4rem,3vw,1.9rem)] font-bold tracking-[-0.02em] mb-2">Redo att hitta rätt utbildning?</h2>
          <p className="text-white/80 text-[15px] mb-7 max-w-lg mx-auto">Matcha er kompetensprofil mot utbildningar från ledande lärosäten eller begär en offert på anpassad utbildning.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => navigate(`/catalog${via ? `?via=${encodeURIComponent(via)}` : ''}`)}
              className="px-6 py-3 bg-white text-[var(--accent)] rounded-[12px] text-sm font-semibold hover:bg-white/90 transition-colors">
              Sök utbildning
            </button>
            <button onClick={() => navigate(`/efterfraga${via ? `?via=${encodeURIComponent(via)}` : ''}`)}
              className="px-6 py-3 bg-white text-[var(--accent)] rounded-[12px] text-sm font-semibold hover:bg-white/90 transition-colors">
              Begär offert från lärosäten
            </button>
            <button onClick={onReset}
              className="px-6 py-3 border border-white/70 text-white rounded-[12px] text-sm font-semibold hover:bg-white/10 transition-colors">
              Gör en ny analys
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}

function SkeletonLines() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3.5 bg-[var(--chip-bg)] rounded w-full" />
      <div className="h-3.5 bg-[var(--chip-bg)] rounded w-[92%]" />
      <div className="h-3.5 bg-[var(--chip-bg)] rounded w-[70%]" />
    </div>
  );
}

function SkeletonGrid({ rows = 2, single = false }: { rows?: number; single?: boolean }) {
  return (
    <div className={`grid gap-4 ${single ? '' : 'sm:grid-cols-2'}`}>
      {Array.from({ length: single ? rows : 4 }).map((_, i) => (
        <div key={i} className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-raised)] p-5"><SkeletonLines /></div>
      ))}
    </div>
  );
}
