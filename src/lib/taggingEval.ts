// Utvärdering av kurstaggning mot ett facit (rätta taggar som en person bedömt).
// Syftet är att kunna mäta hur bra förslagen är, och jämföra olika metoder mot samma facit.

export interface EvalTag { id: string; title: string; source: 'ssyk' | 'esco' }
export interface EvalSuggestion extends EvalTag { confidence: 'high' | 'medium' | 'low' }

export interface EvalCase {
  courseId: string;
  title: string;
  suggestions: EvalSuggestion[];
  // Bedömning per förslag: true = rätt, false = fel, saknas = inte bedömd.
  judged: Record<string, boolean>;
  // Rätta kompetenser som förslagen missade.
  missing: EvalTag[];
}

export interface Metrics {
  cases: number;
  casesWithGold: number;
  tp: number;
  fp: number;
  fn: number;
  unjudged: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  hitRate: number | null; // andel kurser med minst ett rätt förslag
  casesWithoutSuggestions: number;
  byConfidence: Record<'high' | 'medium' | 'low', { tp: number; fp: number; precision: number | null }>;
  bySource: Record<'ssyk' | 'esco', { tp: number; fp: number; precision: number | null }>;
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function computeMetrics(cases: EvalCase[]): Metrics {
  let tp = 0, fp = 0, fn = 0, unjudged = 0, withGold = 0, hits = 0, noSugg = 0;
  const byConf = { high: { tp: 0, fp: 0 }, medium: { tp: 0, fp: 0 }, low: { tp: 0, fp: 0 } };
  const bySrc = { ssyk: { tp: 0, fp: 0 }, esco: { tp: 0, fp: 0 } };

  for (const c of cases) {
    if (c.suggestions.length === 0) noSugg += 1;
    let caseTp = 0;
    for (const s of c.suggestions) {
      const j = c.judged[s.id];
      if (j === undefined) { unjudged += 1; continue; }
      if (j) { tp += 1; caseTp += 1; byConf[s.confidence].tp += 1; bySrc[s.source].tp += 1; }
      else { fp += 1; byConf[s.confidence].fp += 1; bySrc[s.source].fp += 1; }
    }
    fn += c.missing.length;
    if (caseTp + c.missing.length > 0) {
      withGold += 1;
      if (caseTp > 0) hits += 1;
    }
  }

  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  const pr = (x: { tp: number; fp: number }) => ({ ...x, precision: ratio(x.tp, x.tp + x.fp) });

  return {
    cases: cases.length, casesWithGold: withGold, tp, fp, fn, unjudged, precision, recall, f1,
    hitRate: ratio(hits, withGold), casesWithoutSuggestions: noSugg,
    byConfidence: { high: pr(byConf.high), medium: pr(byConf.medium), low: pr(byConf.low) },
    bySource: { ssyk: pr(bySrc.ssyk), esco: pr(bySrc.esco) },
  };
}

// ── Facit ────────────────────────────────────────────────────────────

export interface GoldFile {
  version: 1;
  exportedAt: string;
  cases: { courseId: string; title: string; gold: EvalTag[] }[];
}

export function toGold(cases: EvalCase[]): GoldFile {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    cases: cases
      .map((c) => ({
        courseId: c.courseId,
        title: c.title,
        gold: [
          ...c.suggestions.filter((s) => c.judged[s.id] === true).map(({ id, title, source }) => ({ id, title, source })),
          ...c.missing,
        ],
      }))
      .filter((c) => c.gold.length > 0),
  };
}

// Bedömer nya förslag mot ett befintligt facit: förslag i facit är rätt, övriga fel, och saknade facit-taggar noteras.
export function judgeAgainstGold(c: Pick<EvalCase, 'courseId' | 'suggestions'>, gold: GoldFile): Pick<EvalCase, 'judged' | 'missing'> | null {
  const g = gold.cases.find((x) => x.courseId === c.courseId);
  if (!g) return null;
  const goldIds = new Set(g.gold.map((t) => t.id));
  const judged: Record<string, boolean> = {};
  for (const s of c.suggestions) judged[s.id] = goldIds.has(s.id);
  const suggestedIds = new Set(c.suggestions.map((s) => s.id));
  return { judged, missing: g.gold.filter((t) => !suggestedIds.has(t.id)) };
}
