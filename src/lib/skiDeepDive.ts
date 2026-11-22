// Hämtar fördjupad AI-text per dimension till PDF-rapporten. Kräver inloggning (servern kontrollerar token).
// Faller anropet returneras null och PDF:en använder den regelbaserade texten i stället.

import { supabase } from './supabase';
import { DIMS, DIM_KEYS, bandFor, type DimDeepDive, type DimKey } from './kompetensindexReport';
import { ANSWER_LABEL, DIM_QUESTIONS } from './skiQuestions';
import type { CPIResult } from '../app/components/pages/KompetensindexPage';

const ABBR_TO_KEY: Record<string, DimKey> = { AF: 'AF', KP: 'LF', OK: 'OK', SR: 'TR' };

export async function fetchDeepDive(result: CPIResult): Promise<Partial<Record<DimKey, DimDeepDive>> | null> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) return null;
    const a = result.answers as unknown as Record<string, any>;

    const dimensions = DIM_KEYS.map((d) => {
      const q = DIM_QUESTIONS[d];
      return {
        abbr: DIMS[d].abbr,
        label: DIMS[d].label,
        score: result.scores[d],
        band: bandFor(result.scores[d]).label,
        reversed: q.reversed,
        questions: q.scale.map((sq) => ({ id: sq.id, text: sq.text, answer: Number(a[sq.field]) || 0, label: ANSWER_LABEL[Number(a[sq.field]) || 0] ?? '' })),
        free: q.free ? { id: q.free.id, text: q.free.text, answer: String(a[q.free.field] ?? '') } : null,
      };
    });

    const res = await fetch('/api/ski-deep-dive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ dimensions, industry: result.answers.industry, companySize: result.answers.companySize }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out: Partial<Record<DimKey, DimDeepDive>> = {};
    for (const [abbr, v] of Object.entries<any>(data?.deepDive ?? {})) {
      const key = ABBR_TO_KEY[abbr];
      if (!key || !v || typeof v.interpretation !== 'string') continue;
      out[key] = {
        interpretation: v.interpretation,
        drivers: Array.isArray(v.drivers) ? v.drivers.filter((x: unknown) => typeof x === 'string') : [],
        actions: Array.isArray(v.actions) ? v.actions.filter((x: unknown) => typeof x === 'string') : [],
        watchOut: typeof v.watchOut === 'string' ? v.watchOut : '',
      };
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch (e) {
    console.error('Fördjupning kunde inte hämtas:', e);
    return null;
  }
}
