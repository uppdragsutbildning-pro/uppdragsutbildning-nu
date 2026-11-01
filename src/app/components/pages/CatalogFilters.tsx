import type { AdaptedCategory, AdaptedProvider } from '../../../lib/marketplaceAdapters';

export type StartPeriod = 'all' | '3' | '6' | '12';

// Filter på kursnivå (kategori, format, lärosäte, typ) och på kursstartsnivå (period, platser,
// ort, språk, pris). En kurs matchar kursstartsfiltren när minst en kommande start uppfyller dem alla.
export interface CatalogFilters {
  categories: string[];
  formats: string[];
  providers: string[];
  hasUpcomingStart: boolean;
  customizable: boolean;
  period: StartPeriod;
  availableSpots: boolean;
  locations: string[];
  languages: string[];
  maxPrice: number | null;
}

export const EMPTY_FILTERS: CatalogFilters = {
  categories: [],
  formats: [],
  providers: [],
  hasUpcomingStart: false,
  customizable: false,
  period: 'all',
  availableSpots: false,
  locations: [],
  languages: [],
  maxPrice: null,
};

export interface StartFilterOptions {
  locations: string[];
  languages: string[];
}

const FORMAT_LABELS: Record<string, string> = { online: 'Online', onsite: 'På plats', hybrid: 'Hybrid' };
const PERIOD_OPTIONS: { value: StartPeriod; label: string }[] = [
  { value: 'all', label: 'Alla kommande' },
  { value: '3', label: 'Inom 3 månader' },
  { value: '6', label: 'Inom 6 månader' },
  { value: '12', label: 'Inom 12 månader' },
];
const PRICE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Alla priser' },
  { value: 10000, label: 'Upp till 10 000 kr' },
  { value: 25000, label: 'Upp till 25 000 kr' },
  { value: 50000, label: 'Upp till 50 000 kr' },
  { value: 100000, label: 'Upp till 100 000 kr' },
];

export function isStartFilterActive(f: CatalogFilters): boolean {
  return (
    f.hasUpcomingStart ||
    f.period !== 'all' ||
    f.availableSpots ||
    f.locations.length > 0 ||
    f.languages.length > 0 ||
    f.maxPrice !== null
  );
}

export function countActiveFilters(f: CatalogFilters): number {
  return (
    f.categories.length +
    f.formats.length +
    f.providers.length +
    f.locations.length +
    f.languages.length +
    (f.hasUpcomingStart ? 1 : 0) +
    (f.customizable ? 1 : 0) +
    (f.period !== 'all' ? 1 : 0) +
    (f.availableSpots ? 1 : 0) +
    (f.maxPrice !== null ? 1 : 0)
  );
}

export interface ActiveChip {
  id: string;
  label: string;
  remove: (f: CatalogFilters) => CatalogFilters;
}

// Valda filter som chips ovanför träfflistan, med ett klick för att ta bort var och en.
export function buildActiveChips(
  f: CatalogFilters,
  categories: AdaptedCategory[],
  providers: AdaptedProvider[]
): ActiveChip[] {
  const chips: ActiveChip[] = [];
  for (const id of f.categories) {
    chips.push({
      id: `cat-${id}`,
      label: categories.find(c => c.id === id)?.name ?? 'Kategori',
      remove: s => ({ ...s, categories: s.categories.filter(x => x !== id) }),
    });
  }
  for (const v of f.formats) {
    chips.push({ id: `fmt-${v}`, label: FORMAT_LABELS[v] ?? v, remove: s => ({ ...s, formats: s.formats.filter(x => x !== v) }) });
  }
  for (const id of f.providers) {
    chips.push({
      id: `prov-${id}`,
      label: providers.find(p => p.id === id)?.name ?? 'Lärosäte',
      remove: s => ({ ...s, providers: s.providers.filter(x => x !== id) }),
    });
  }
  if (f.hasUpcomingStart) chips.push({ id: 'start', label: 'Har kommande start', remove: s => ({ ...s, hasUpcomingStart: false }) });
  if (f.customizable) chips.push({ id: 'custom', label: 'Kan anpassas', remove: s => ({ ...s, customizable: false }) });
  if (f.period !== 'all') {
    chips.push({ id: 'period', label: PERIOD_OPTIONS.find(o => o.value === f.period)?.label ?? '', remove: s => ({ ...s, period: 'all' }) });
  }
  if (f.availableSpots) chips.push({ id: 'spots', label: 'Lediga platser', remove: s => ({ ...s, availableSpots: false }) });
  for (const v of f.locations) {
    chips.push({ id: `loc-${v}`, label: v, remove: s => ({ ...s, locations: s.locations.filter(x => x !== v) }) });
  }
  for (const v of f.languages) {
    chips.push({ id: `lang-${v}`, label: v, remove: s => ({ ...s, languages: s.languages.filter(x => x !== v) }) });
  }
  if (f.maxPrice !== null) {
    chips.push({ id: 'price', label: PRICE_OPTIONS.find(o => o.value === f.maxPrice)?.label ?? 'Pris', remove: s => ({ ...s, maxPrice: null }) });
  }
  return chips;
}

const checkboxClass =
  'rounded border-slate-300 text-[var(--marketplace-primary)] focus:ring-[var(--marketplace-primary)]';
const selectClass =
  'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--marketplace-primary)]';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter(x => x !== value) : [...list, value];
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-6 pb-6 border-b border-slate-200 last:border-b-0 last:mb-0 last:pb-0">
      <legend className="text-sm font-medium text-slate-900 mb-3">{title}</legend>
      <div className="space-y-2">{children}</div>
    </fieldset>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className={checkboxClass} />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

interface FilterGroupsProps {
  filters: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
  categories: AdaptedCategory[];
  providers: AdaptedProvider[];
  startOptions: StartFilterOptions;
  // Marknadsplatser: bara de filter som kan ge träffar visas av anroparen (jfr scopade kategorier).
}

// Används både i sidokolumnen (desktop) och i filterpanelen (mobil).
export function CatalogFilterGroups({ filters: f, onChange, categories, providers, startOptions }: FilterGroupsProps) {
  const set = (patch: Partial<CatalogFilters>) => onChange({ ...f, ...patch });
  return (
    <div>
      <Group title="Typ">
        <Check checked={f.hasUpcomingStart} onChange={() => set({ hasUpcomingStart: !f.hasUpcomingStart })} label="Har kommande start" />
        <Check checked={f.customizable} onChange={() => set({ customizable: !f.customizable })} label="Kan anpassas till er organisation" />
      </Group>

      <Group title="Startperiod">
        <select
          aria-label="Startperiod"
          value={f.period}
          onChange={e => set({ period: e.target.value as StartPeriod })}
          className={selectClass}
        >
          {PERIOD_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Check checked={f.availableSpots} onChange={() => set({ availableSpots: !f.availableSpots })} label="Endast lediga platser" />
      </Group>

      {categories.length > 0 && (
        <Group title="Kategori">
          {categories.map(c => (
            <Check key={c.id} checked={f.categories.includes(c.id)} onChange={() => set({ categories: toggle(f.categories, c.id) })} label={c.name} />
          ))}
        </Group>
      )}

      <Group title="Format">
        {Object.entries(FORMAT_LABELS).map(([value, label]) => (
          <Check key={value} checked={f.formats.includes(value)} onChange={() => set({ formats: toggle(f.formats, value) })} label={label} />
        ))}
      </Group>

      <Group title="Kostnad per deltagare">
        <select
          aria-label="Kostnad per deltagare"
          value={f.maxPrice ?? ''}
          onChange={e => set({ maxPrice: e.target.value === '' ? null : Number(e.target.value) })}
          className={selectClass}
        >
          {PRICE_OPTIONS.map(o => (
            <option key={o.label} value={o.value ?? ''}>{o.label}</option>
          ))}
        </select>
      </Group>

      {startOptions.locations.length > 0 && (
        <Group title="Ort">
          {startOptions.locations.map(l => (
            <Check key={l} checked={f.locations.includes(l)} onChange={() => set({ locations: toggle(f.locations, l) })} label={l} />
          ))}
        </Group>
      )}

      {startOptions.languages.length > 0 && (
        <Group title="Språk">
          {startOptions.languages.map(l => (
            <Check key={l} checked={f.languages.includes(l)} onChange={() => set({ languages: toggle(f.languages, l) })} label={l} />
          ))}
        </Group>
      )}

      {providers.length > 0 && (
        <Group title="Lärosäte">
          {providers.map(p => (
            <Check key={p.id} checked={f.providers.includes(p.id)} onChange={() => set({ providers: toggle(f.providers, p.id) })} label={p.name} />
          ))}
        </Group>
      )}
    </div>
  );
}
