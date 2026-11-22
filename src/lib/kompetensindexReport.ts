// Logik och texter för rapporten i slutet av Strategiskt kompetensindex.
//
// Allt som går att räkna ut utan AI ligger här (nivåer, rangordning, zoner, insatsbibliotek) så att
// rapporten alltid kan visas, även om AI-anropet faller. AI skriver bara berättande text och
// slås ihop fält för fält med reservtexterna (mergeAnalysis).
//
// Lagringsnycklarna LF och TR är oförändrade i databasen, men visas som KP och SR.
// Alla fyra dimensioner har samma riktning: högre poäng = större behov / större begränsning.

import type { CPIResult } from '../app/components/pages/KompetensindexPage';

export type DimKey = 'AF' | 'LF' | 'OK' | 'TR';
export const DIM_KEYS: DimKey[] = ['AF', 'LF', 'OK', 'TR'];

// ── Nivåer ──────────────────────────────────────────────────────────────

export interface Band {
  index: 0 | 1 | 2 | 3;
  label: string;
  range: string;
  from: number;
  to: number;
  color: string;
  bg: string;
  border: string;
}

export const BANDS: Band[] = [
  { index: 0, label: 'Lågt', range: '0–24', from: 0, to: 25, color: '#15803D', bg: '#F0FDF4', border: '#86EFAC' },
  { index: 1, label: 'Måttligt', range: '25–49', from: 25, to: 50, color: '#A16207', bg: '#FEFCE8', border: '#FDE047' },
  { index: 2, label: 'Högt', range: '50–74', from: 50, to: 75, color: '#C2410C', bg: '#FFF7ED', border: '#FDBA74' },
  { index: 3, label: 'Kritiskt', range: '75–100', from: 75, to: 101, color: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5' },
];

export function bandFor(score: number): Band {
  return BANDS[score < 25 ? 0 : score < 50 ? 1 : score < 75 ? 2 : 3];
}

export const TOTAL_BAND_TEXT: string[] = [
  'Er verksamhet upplever lågt kompetenstryck. Det finns goda förutsättningar att arbeta proaktivt med kompetensutveckling.',
  'Er verksamhet upplever ett måttligt kompetenstryck. Det finns tydliga områden att stärka för att möta framtida behov.',
  'Er verksamhet upplever högt kompetenstryck. Riktade insatser rekommenderas för att kompetensgapet inte ska öka.',
  'Er verksamhet upplever kritiskt kompetenstryck. Omedelbara och strategiska insatser behövs.',
];

// ── Dimensioner ─────────────────────────────────────────────────────────

export interface DimMeta {
  key: DimKey;
  abbr: string;
  label: string;
  question: string;
  // Hur man läser poängen för just den här dimensionen.
  reading: string;
  // En text per nivå (Lågt, Måttligt, Högt, Kritiskt).
  bandText: [string, string, string, string];
  // Kort rekommenderad riktning per nivå ≥ Högt.
  direction: string;
}

export const DIMS: Record<DimKey, DimMeta> = {
  AF: {
    key: 'AF', abbr: 'AF', label: 'Arbetsförändring',
    question: 'Hur snabbt och djupt förändras arbetet?',
    reading: 'Hög poäng = arbetet förändras snabbt, vilket skapar ett stort kompetensbehov.',
    bandText: [
      'Arbetet förändras långsamt. Roller och processer är i stort sett stabila.',
      'Vissa roller och arbetssätt förändras, men i en hanterbar takt.',
      'Arbetet förändras snabbt. Många roller och processer påverkas samtidigt.',
      'Arbetet förändras mycket snabbt och djupgående. Kompetensbehovet förskjuts löpande.',
    ],
    direction: 'Kartlägg vilka roller som förändras mest och sätt förändringsledning och digital kompetens först.',
  },
  LF: {
    key: 'LF', abbr: 'KP', label: 'Kompetenspåverkan',
    question: 'Hur mycket påverkar kompetensbrist kvalitet, tempo och leverans?',
    reading: 'Hög poäng = kompetensbrist påverkar redan det dagliga arbetet.',
    bandText: [
      'Kompetensbrist påverkar sällan kvalitet, tempo eller leverans.',
      'Kompetensbrist märks ibland, men verksamheten fungerar i stort sett som planerat.',
      'Kompetensbrist påverkar regelbundet kvalitet, tempo eller leveransförmåga.',
      'Kompetensbrist är ett allvarligt hinder. Uppgifter skjuts upp eller utförs med lägre kvalitet.',
    ],
    direction: 'Identifiera de arbetsmoment som stannar upp och sätt in korta, riktade kompetensinsatser där.',
  },
  OK: {
    key: 'OK', abbr: 'OK', label: 'Omställningskapacitet',
    question: 'Hur väl kan organisationen lära nytt och ställa om?',
    reading: 'Omvänd skala: hög poäng = begränsad omställningskapacitet (mindre tid, struktur och stöd för lärande).',
    bandText: [
      'God förmåga att lära nytt och ställa om. Tid, struktur och stöd för lärande finns.',
      'Förmågan finns, men begränsas ibland av tid, struktur eller chefsstöd.',
      'Omställningsförmågan är begränsad. Lärande får ofta stå tillbaka för det löpande arbetet.',
      'Stora hinder för omställning. Lärande saknar tid, struktur och stöd i vardagen.',
    ],
    direction: 'Skapa tid, struktur och chefsstöd för lärande i vardagen innan större program startas.',
  },
  TR: {
    key: 'TR', abbr: 'SR', label: 'Strategisk riktning',
    question: 'Hur tydlig är riktningen för kompetensförsörjningen?',
    reading: 'Omvänd skala: hög poäng = otydlig riktning och plan för kompetensförsörjningen.',
    bandText: [
      'Tydlig riktning. Framtida kompetensbehov är kopplade till verksamhetsmålen och det finns en plan.',
      'Riktningen är i huvudsak tydlig, men planen kan konkretiseras.',
      'Riktningen är delvis otydlig. Kompetensbehov och planer är inte fullt kopplade till målen.',
      'Riktning och plan saknas i stort. Insatser riskerar att bli spridda och ge liten effekt.',
    ],
    direction: 'Ta fram en kompetensförsörjningsplan på 1–3 år som kopplar lärande till verksamhetsmålen.',
  },
};

export const SI_LABELS = ['Rekrytering', 'Kompetensväxling', 'Kompetensutveckling', 'Nya arbetssätt'];

// SI svaras på skalan 1–5 och visas som 0–100, samma skala som övriga värden.
export function siToPct(v: number): number {
  return v > 0 ? Math.round(((v - 1) / 4) * 100) : 0;
}

// ── Styrkor och risker ──────────────────────────────────────────────────

export interface Finding {
  dim: DimKey;
  title: string;
  text: string;
  score: number;
}

export function computeFindings(scores: CPIResult['scores']): { strengths: Finding[]; risks: Finding[] } {
  const rows = DIM_KEYS.map((dim) => ({ dim, score: scores[dim] }));
  const mk = (r: { dim: DimKey; score: number }): Finding => ({
    dim: r.dim,
    score: r.score,
    title: `${DIMS[r.dim].label} (${DIMS[r.dim].abbr} ${r.score})`,
    text: DIMS[r.dim].bandText[bandFor(r.score).index],
  });
  const strengths = rows.filter((r) => r.score < 50).sort((a, b) => a.score - b.score).slice(0, 3).map(mk);
  const risks = rows.filter((r) => r.score >= 50).sort((a, b) => b.score - a.score).slice(0, 3).map(mk);
  return { strengths, risks };
}

// ── Tryck mot kapacitet (AF mot OK) ─────────────────────────────────────

export interface Zone {
  id: 'stable' | 'equipped' | 'vulnerable' | 'critical';
  label: string;
  text: string;
  color: string;
}

export const ZONES: Record<Zone['id'], Zone> = {
  stable: {
    id: 'stable', label: 'Stabil', color: '#15803D',
    text: 'Lågt förändringstryck och god omställningskapacitet. Fortsätt arbeta proaktivt och följ upp regelbundet.',
  },
  equipped: {
    id: 'equipped', label: 'Rustad', color: '#A16207',
    text: 'Arbetet förändras snabbt, men organisationen har kapacitet att ställa om. Rikta insatserna mot de roller som berörs mest.',
  },
  vulnerable: {
    id: 'vulnerable', label: 'Sårbar', color: '#C2410C',
    text: 'Förändringstrycket är måttligt, men kapaciteten att lära och ställa om är begränsad. Bygg struktur för lärande innan trycket ökar.',
  },
  critical: {
    id: 'critical', label: 'Kritisk zon', color: '#B91C1C',
    text: 'Arbetet förändras snabbt samtidigt som kapaciteten att ställa om är begränsad. Det är här genomförandeovisshet uppstår: ambitionen är högre än vardagens utrymme för lärande.',
  },
};

export function zoneFor(AF: number, OK: number): Zone {
  if (AF >= 50 && OK >= 50) return ZONES.critical;
  if (AF >= 50) return ZONES.equipped;
  if (OK >= 50) return ZONES.vulnerable;
  return ZONES.stable;
}

// ── Insatsbibliotek (effekt mot insats) ─────────────────────────────────
// Koordinaterna är fasta så att matrisen blir konsekvent mellan analyser. Regler väljer vilka insatser som
// visas utifrån profilen; AI sätter aldrig koordinater.

export interface Initiative {
  id: string;
  label: string;
  effect: number; // 0–100, förväntad verksamhetseffekt
  effort: number; // 0–100, genomförandeinsats
  why: string;
  // Hur starkt en hög poäng i respektive dimension talar för insatsen.
  weights: Partial<Record<DimKey | 'si1' | 'si2' | 'si3' | 'si4', number>>;
}

export const INITIATIVES: Initiative[] = [
  { id: 'kunskapsdelning', label: 'Kunskapsdelning', effect: 68, effort: 22, why: 'Sprider befintlig kunskap snabbt och minskar beroendet av enskilda nyckelpersoner.', weights: { LF: 1, OK: 0.8 } },
  { id: 'chefsstod', label: 'Chefens lärstöd', effect: 74, effort: 34, why: 'Chefer som skapar utrymme för lärande är den starkaste faktorn för att insatser ger effekt.', weights: { OK: 1.2, AF: 0.4 } },
  { id: 'kartlaggning', label: 'Kompetenskartläggning', effect: 52, effort: 38, why: 'Ger underlag för träffsäkra insatser och synliggör var gapen finns.', weights: { TR: 1.1, LF: 0.5 } },
  { id: 'kompetensplan', label: 'Kompetensförsörjningsplan', effect: 80, effort: 44, why: 'Knyter kompetensbehoven till verksamhetsmålen och ger insatserna en gemensam riktning.', weights: { TR: 1.4 } },
  { id: 'larcirklar', label: 'Lärande i arbetet', effect: 56, effort: 28, why: 'Bygger in lärande i vardagen med lärcirklar, mentorskap och korta pass.', weights: { OK: 1, si3: 0.6 } },
  { id: 'digital', label: 'Digital kompetens och AI', effect: 76, effort: 52, why: 'Möter snabb förändring i arbetssätt och verktyg med riktad kompetensutveckling.', weights: { AF: 1.2, si3: 0.5 } },
  { id: 'processutveckling', label: 'Processutveckling', effect: 60, effort: 64, why: 'Kombinerar lärande med nya arbetssätt så att kompetensen kommer till användning.', weights: { si4: 1.2, AF: 0.6 } },
  { id: 'kompetensvaxling', label: 'Kompetensväxlingsprogram', effect: 86, effort: 76, why: 'Skolar om befintlig personal mot nya roller, ofta snabbare än extern rekrytering.', weights: { si2: 1.4, AF: 0.6 } },
  { id: 'nyrekrytering', label: 'Nyrekrytering', effect: 64, effort: 90, why: 'Tillför kompetens som saknas helt, men tar tid och är resurskrävande.', weights: { si1: 1.4, LF: 0.5 } },
];

export function selectInitiatives(result: CPIResult, count = 6): Initiative[] {
  const { scores, siScores } = result;
  const values: Record<string, number> = {
    AF: scores.AF, LF: scores.LF, OK: scores.OK, TR: scores.TR,
    si1: siToPct(siScores.si1), si2: siToPct(siScores.si2), si3: siToPct(siScores.si3), si4: siToPct(siScores.si4),
  };
  return INITIATIVES
    .map((i) => ({
      i,
      rel: Object.entries(i.weights).reduce((s, [k, w]) => s + (w ?? 0) * (values[k] ?? 0), 0),
    }))
    .sort((a, b) => b.rel - a.rel)
    .slice(0, count)
    .map((x) => x.i);
}

// Rekommenderad start: hög effekt i förhållande till insats.
export function recommendedStart(initiatives: Initiative[]): Initiative[] {
  return [...initiatives].sort((a, b) => b.effect - b.effort - (a.effect - a.effort)).slice(0, 3);
}

// ── Analys (AI + reserv) ────────────────────────────────────────────────

export type Priority = 'high' | 'medium' | 'low';
export type RecDim = 'AF' | 'KP' | 'OK' | 'SR' | 'SI';

export interface Recommendation {
  title: string;
  body: string;
  priority: Priority;
  dimension: RecDim;
  searchTerms: string[];
}

export interface Message { title: string; body: string }

export interface Analysis {
  overallAssessment: string;
  topRisk: string;
  topAction: string;
  messages: { strength: Message; weakness: Message; risk: Message; opportunity: Message };
  voice: { drivers: string; friction: string; capabilities: string; wishes: string };
  recommendations: Recommendation[];
  roadmap: { period: string; title: string; text: string }[];
  focus: { profile: string; quadrant: string; messages: string; priority: string };
}

// Söktermer per rekommendationsområde som alltid läggs till (även ovanpå AI:ns egna) när rekommendationer
// kopplas till kurser. Specifika ord, inte breda: "digital" ensamt ger träff på alla digitala kurser.
export const REC_TERMS: Record<RecDim, string[]> = {
  AF: ['förändringsledning', 'förändringshantering', 'omställning', 'transformation', 'artificiell intelligens', 'maskininlärning'],
  KP: ['produktivitet', 'effektivitet', 'processförbättring', 'verksamhetsutveckling', 'lean'],
  OK: ['mentorskap', 'coachning', 'coachande', 'chefsstöd', 'ledarutveckling', 'chefsutveckling', 'ledarskapsprogram'],
  SR: ['kompetensförsörjning', 'kompetensplanering', 'talangutveckling', 'talangförsörjning', 'organisationsutveckling'],
  SI: ['kompetensväxling', 'omskolning', 'karriärväxling', 'talangutveckling'],
};

export function withRecTerms(rec: Recommendation): Recommendation {
  const all = [...rec.searchTerms, ...REC_TERMS[rec.dimension]];
  return { ...rec, searchTerms: [...new Set(all.map((t) => t.toLowerCase()))] };
}

const lc = (d: DimKey) => DIMS[d].label.toLowerCase();

export function buildRuleAnalysis(result: CPIResult): Analysis {
  const { scores, siScores, answers } = result;
  const strongest = DIM_KEYS.reduce((a, b) => (scores[a] <= scores[b] ? a : b));
  const weakest = DIM_KEYS.reduce((a, b) => (scores[a] >= scores[b] ? a : b));
  const total = scores.total;
  const level = bandFor(total).label.toLowerCase();

  const overallAssessment =
    `${answers.companyName} har ett ${level} kompetenstryck (${total}/100) inom ${answers.industry}. ` +
    `Den största tillgången är ${lc(strongest)} (${scores[strongest]} p) och det område som kräver mest uppmärksamhet är ` +
    `${lc(weakest)} (${scores[weakest]} p).`;

  const riskMap: Record<DimKey, string> = {
    AF: 'Arbetet förändras snabbare än medarbetarna hinner följa med. Om roller och processer ändras utan att kompetensen hänger med växer prestationsgapet successivt.',
    LF: 'Kompetensbrist skapar redan märkbara hinder i det dagliga arbetet. Utan riktade insatser riskerar leveransförmågan att försämras ytterligare.',
    OK: 'Begränsad omställningskapacitet gör organisationen sårbar när förutsättningarna ändras. Omställningar fördröjs och blir dyrare.',
    TR: 'Otydlig riktning gör att insatser blir fragmenterade. Utan en sammanhållen plan för kompetens ger utbildningsinsatser begränsad effekt.',
  };
  const topRisk = riskMap[weakest];
  const topAction = DIMS[weakest].direction;

  // Möjlighet: den kompetensinsats organisationen själv ser störst behov av.
  const siRows = [
    { v: siScores.si1, text: 'Rekrytering av ny kompetens kan fylla luckor som inte går att utbilda bort, särskilt för kritiska roller.' },
    { v: siScores.si2, text: 'Kompetensväxling kopplar utveckling till faktiska arbetsflöden och är ofta snabbare än extern rekrytering.' },
    { v: siScores.si3, text: 'Riktad kompetensutveckling av befintliga medarbetare stärker både kompetens, arbetssätt och leveransförmåga.' },
    { v: siScores.si4, text: 'Nya arbetssätt tillsammans med lärande gör att kompetensen faktiskt kommer till användning.' },
  ];
  const topSi = siRows.reduce((a, b) => (b.v > a.v ? b : a));

  const messages = {
    strength: { title: `${DIMS[strongest].label} är er starkaste sida`, body: DIMS[strongest].bandText[bandFor(scores[strongest]).index] },
    weakness: { title: `${DIMS[weakest].label} behöver stärkas`, body: DIMS[weakest].bandText[bandFor(scores[weakest]).index] },
    risk: { title: 'Risken om inget görs', body: topRisk },
    opportunity: { title: 'Möjligheten att ta vara på', body: topSi.text },
  };

  const none = 'Inget angavs i enkäten.';
  const voice = {
    drivers: answers.af4?.trim() || none,
    friction: answers.pf5?.trim() || none,
    capabilities: answers.tr4?.trim() || none,
    wishes:
      [answers.li1?.length ? `Insatstyp: ${answers.li1.join(', ')}.` : '', answers.li2?.length ? `Upplägg: ${answers.li2.join(', ')}.` : '']
        .filter(Boolean).join(' ') || none,
  };

  const recommendations: Recommendation[] = [];
  const prio = (s: number): Priority => (s >= 65 ? 'high' : s >= 40 ? 'medium' : 'low');

  if (scores.LF >= 40)
    recommendations.push({
      title: 'Minska kompetensbristens påverkan med riktad kompetensutveckling',
      body: `Med KP ${scores.LF} finns hinder för effektiv prestation. Strukturerade kompetensprogram inom kärnprocesserna kan snabbt minska friktion och förbättra leveransförmågan.`,
      priority: prio(scores.LF), dimension: 'KP', searchTerms: ['kompetensutveckling', 'kvalitet', 'produktivitet', 'leverans'],
    });
  if (scores.AF >= 40)
    recommendations.push({
      title: 'Stärk förändringsförmågan inför fortsatt omställning',
      body: `Med AF ${scores.AF} förändras roller och processer snabbt. Förändringsledning och digitala verktyg bör prioriteras för de team som berörs mest.`,
      priority: prio(scores.AF), dimension: 'AF', searchTerms: ['förändringsledning', 'digital', 'omställning', 'ledarskap'],
    });
  if (scores.OK >= 40)
    recommendations.push({
      title: 'Bygg intern omställningskapacitet',
      body: `Med OK ${scores.OK} är kapaciteten att lära och ställa om begränsad. Investera i lärande i arbetet, mentorskap och chefsstöd så att utbildning får utrymme i vardagen.`,
      priority: prio(scores.OK), dimension: 'OK', searchTerms: ['lärande', 'mentorskap', 'coachande ledarskap', 'chefsstöd'],
    });
  if (scores.TR >= 40)
    recommendations.push({
      title: 'Tydliggör den strategiska riktningen',
      body: `Med SR ${scores.TR} saknas delvis en tydlig riktning. Ta fram en kompetensförsörjningsplan som kopplar lärande till verksamhetsmålen på 1–3 års sikt.`,
      priority: prio(scores.TR), dimension: 'SR', searchTerms: ['strategisk kompetensförsörjning', 'kompetensplanering', 'strategi'],
    });
  if (siScores.si2 >= 4)
    recommendations.push({
      title: 'Prioritera kompetensväxling framför rekrytering',
      body: 'Era svar visar ett högt behov av kompetensväxling. Att vidareutbilda befintlig personal är ofta snabbare och mer kostnadseffektivt än extern rekrytering.',
      priority: 'medium', dimension: 'SI', searchTerms: ['kompetensväxling', 'omskolning', 'karriärväxling'],
    });
  if (siScores.si4 >= 4)
    recommendations.push({
      title: 'Inför nya arbetssätt med lärande som stöd',
      body: 'Behovet av nya arbetssätt är tydligt. Tvärfunktionella team, snabbare beslutscykler och kontinuerligt lärande gör att förändringen fastnar.',
      priority: 'medium', dimension: 'SI', searchTerms: ['agila arbetssätt', 'processutveckling', 'verksamhetsutveckling'],
    });
  if (recommendations.length === 0)
    recommendations.push({
      title: 'Fortsätt det goda arbetet med kompetensutveckling',
      body: `${answers.companyName} har balanserade värden. Behåll nuvarande insatser och följ upp kompetensbehoven regelbundet.`,
      priority: 'low', dimension: 'SI', searchTerms: ['kompetensutveckling'],
    });
  recommendations.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));

  const roadmap = [
    { period: '0–3 mån', title: 'Diagnos', text: `Validera resultatet, kartlägg kritiska roller och välj 2–3 prioriterade förmågor med start i ${lc(weakest)}.` },
    { period: '3–6 mån', title: 'Design', text: 'Ta fram målgruppsanpassad utveckling och stöd till chefer. Begär offert eller välj färdiga utbildningar.' },
    { period: '6–9 mån', title: 'Genomför', text: 'Pilotera insatserna, träna interna nyckelpersoner och justera arbetssätt.' },
    { period: '9–12 mån', title: 'Effekt', text: 'Mät förändring i arbetssätt och leveransförmåga och gör ett nytt kompetensindex.' },
  ];

  const focus = {
    profile: `Vilken av era fyra dimensioner vill ni förflytta först, och vad ska ha förändrats om ett år?`,
    quadrant: 'Hur kan ni möta förändringstakten utan att öka belastningen på medarbetarna?',
    messages: 'Vilken kombination av styrka, svaghet, risk och möjlighet bör styra nästa prioritering?',
    priority: 'Vilka insatser ger tillräcklig effekt för att motivera genomförandeinsatsen?',
  };

  return { overallAssessment, topRisk, topAction, messages, voice, recommendations, roadmap, focus };
}

// Slår ihop AI-svaret med reservtexterna fält för fält. Allt som saknas eller har fel typ ersätts.
const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function mergeAnalysis(rule: Analysis, ai: unknown): Analysis {
  if (!ai || typeof ai !== 'object') return rule;
  const a = ai as Record<string, any>;
  const msg = (v: any, fb: Message): Message => (v && str(v.title) && str(v.body) ? { title: v.title, body: v.body } : fb);

  const recs: Recommendation[] = Array.isArray(a.recommendations)
    ? a.recommendations
        .filter((r: any) => r && str(r.title) && str(r.body))
        .slice(0, 6)
        .map((r: any): Recommendation => ({
          title: r.title,
          body: r.body,
          priority: ['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'medium',
          dimension: ['AF', 'KP', 'OK', 'SR', 'SI'].includes(r.dimension) ? r.dimension : 'SI',
          searchTerms: Array.isArray(r.searchTerms) ? r.searchTerms.filter(str).slice(0, 5) : [],
        }))
    : [];

  const road = Array.isArray(a.roadmap) && a.roadmap.length === 4 && a.roadmap.every((s: any) => s && str(s.text) && str(s.title))
    ? a.roadmap.map((s: any, i: number) => ({ period: rule.roadmap[i].period, title: s.title, text: s.text }))
    : rule.roadmap;

  return {
    overallAssessment: str(a.overallAssessment) ? a.overallAssessment : rule.overallAssessment,
    topRisk: str(a.topRisk) ? a.topRisk : rule.topRisk,
    topAction: str(a.topAction) ? a.topAction : rule.topAction,
    messages: {
      strength: msg(a.messages?.strength, rule.messages.strength),
      weakness: msg(a.messages?.weakness, rule.messages.weakness),
      risk: msg(a.messages?.risk, rule.messages.risk),
      opportunity: msg(a.messages?.opportunity, rule.messages.opportunity),
    },
    voice: {
      drivers: str(a.voice?.drivers) ? a.voice.drivers : rule.voice.drivers,
      friction: str(a.voice?.friction) ? a.voice.friction : rule.voice.friction,
      capabilities: str(a.voice?.capabilities) ? a.voice.capabilities : rule.voice.capabilities,
      wishes: str(a.voice?.wishes) ? a.voice.wishes : rule.voice.wishes,
    },
    recommendations: recs.length >= 2 ? recs : rule.recommendations,
    roadmap: road,
    focus: {
      profile: str(a.focus?.profile) ? a.focus.profile : rule.focus.profile,
      quadrant: str(a.focus?.quadrant) ? a.focus.quadrant : rule.focus.quadrant,
      messages: str(a.focus?.messages) ? a.focus.messages : rule.focus.messages,
      priority: str(a.focus?.priority) ? a.focus.priority : rule.focus.priority,
    },
  };
}
