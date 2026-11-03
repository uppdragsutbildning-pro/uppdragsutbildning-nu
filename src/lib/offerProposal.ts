// Delade typer och hjälpfunktioner för offertens upplägg och behovsgranskning
// (leverantörens formulär och köparens jämförelsevy).

export type NeedKey = 'goals' | 'target_group' | 'participants' | 'format' | 'location' | 'period' | 'budget';

export interface OfferModule {
  title: string;
  description?: string;
  hours?: number | null;
}

export interface NeedCheck {
  key: NeedKey;
  status: 'meets' | 'deviates';
  comment?: string;
}

export const NEED_LABEL: Record<NeedKey, string> = {
  goals: 'Mål',
  target_group: 'Målgrupp',
  participants: 'Antal deltagare',
  format: 'Genomförande',
  location: 'Ort',
  period: 'Önskad period',
  budget: 'Budgetram',
};

export const DELIVERY_FORMAT_LABEL: Record<string, string> = {
  on_site: 'På plats',
  remote: 'Distans',
  hybrid: 'Hybrid',
  flexible: 'Flexibelt',
};

// Köparens behov (fälten från training_requests) som leverantören granskar.
export interface BuyerNeed {
  learning_goals: string | null;
  target_group: string;
  participant_count: number | null;
  delivery_format: string;
  location: string | null;
  desired_start: string | null;
  budget_range: string | null;
}

// Bara de punkter köparen faktiskt har fyllt i går att bocka av.
export function needItems(need: BuyerNeed): { key: NeedKey; label: string; value: string }[] {
  const items: { key: NeedKey; value: string | null }[] = [
    { key: 'goals', value: need.learning_goals },
    { key: 'target_group', value: need.target_group },
    { key: 'participants', value: need.participant_count != null ? String(need.participant_count) : null },
    { key: 'format', value: DELIVERY_FORMAT_LABEL[need.delivery_format] ?? need.delivery_format },
    { key: 'location', value: need.location },
    { key: 'period', value: need.desired_start },
    { key: 'budget', value: need.budget_range },
  ];
  return items
    .filter((i): i is { key: NeedKey; value: string } => !!i.value && i.value.trim() !== '')
    .map((i) => ({ key: i.key, label: NEED_LABEL[i.key], value: i.value }));
}

export function totalModuleHours(modules: OfferModule[] | null | undefined): number {
  return (modules ?? []).reduce((sum, m) => sum + (Number(m.hours) || 0), 0);
}

// Andel behovspunkter som leverantören markerat som uppfyllda, för markering i jämförelsen.
export function needsMatchCount(checks: NeedCheck[] | null | undefined): { meets: number; total: number } {
  const list = checks ?? [];
  return { meets: list.filter((c) => c.status === 'meets').length, total: list.length };
}
