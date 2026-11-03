import { useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabaseClient';
import {
  DELIVERY_FORMAT_LABEL,
  needItems,
  type BuyerNeed,
  type NeedCheck,
  type NeedKey,
  type OfferModule,
} from '../../../lib/offerProposal';
import type { CustomRequest } from '../../../lib/supabase';

export interface ProposalState {
  deliveryFormat: string;
  durationHours: string;
  modules: { title: string; description: string; hours: string }[];
  fitComment: string;
  needsCheck: Partial<Record<NeedKey, { status: 'meets' | 'deviates' | ''; comment: string }>>;
  reviewed: boolean;
}

export const emptyProposal: ProposalState = {
  deliveryFormat: '',
  durationHours: '',
  modules: [],
  fitComment: '',
  needsCheck: {},
  reviewed: false,
};

// Fyller formuläret från en tidigare skickad offert (revidering).
export function proposalFromRequest(req: CustomRequest): ProposalState {
  const needsCheck: ProposalState['needsCheck'] = {};
  (req.offer_needs_check ?? []).forEach((c) => {
    needsCheck[c.key] = { status: c.status, comment: c.comment ?? '' };
  });
  return {
    deliveryFormat: req.offer_delivery_format ?? '',
    durationHours: req.offer_duration_hours != null ? String(req.offer_duration_hours) : '',
    modules: (req.offer_modules ?? []).map((m) => ({
      title: m.title,
      description: m.description ?? '',
      hours: m.hours != null ? String(m.hours) : '',
    })),
    fitComment: req.offer_fit_comment ?? '',
    needsCheck,
    reviewed: false,
  };
}

export function proposalToRpc(p: ProposalState, need: BuyerNeed | null) {
  const modules: OfferModule[] = p.modules
    .filter((m) => m.title.trim())
    .map((m) => ({
      title: m.title.trim(),
      description: m.description.trim(),
      hours: m.hours.trim() ? Number(m.hours.replace(',', '.')) : null,
    }));
  const keys = need ? needItems(need).map((i) => i.key) : [];
  const needsCheck: NeedCheck[] = keys
    .map((key) => ({ key, row: p.needsCheck[key] }))
    .filter((x): x is { key: NeedKey; row: { status: 'meets' | 'deviates'; comment: string } } => !!x.row?.status)
    .map(({ key, row }) => ({ key, status: row.status, comment: row.comment.trim() || undefined }));
  return {
    p_delivery_format: p.deliveryFormat || null,
    p_duration_hours: p.durationHours.trim() ? Number(p.durationHours.replace(',', '.')) : null,
    p_modules: modules,
    p_fit_comment: p.fitComment.trim() || null,
    p_needs_check: needsCheck,
    p_reviewed: p.reviewed,
  };
}

// Alla behovspunkter ska ha ett svar, avvikelser ska förklaras och granskningen bekräftas.
export function proposalValid(p: ProposalState, need: BuyerNeed | null): boolean {
  if (!p.reviewed) return false;
  const items = need ? needItems(need) : [];
  const checksOk = items.every((i) => {
    const row = p.needsCheck[i.key];
    return !!row?.status && (row.status === 'meets' || row.comment.trim().length > 0);
  });
  const modulesOk = p.modules.every((m) => m.title.trim().length > 0);
  const hoursOk = (v: string) => !v.trim() || Number(v.replace(',', '.')) >= 0;
  return checksOk && modulesOk && hoursOk(p.durationHours) && p.modules.every((m) => hoursOk(m.hours));
}

const inputClass =
  'mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';

export function OfferProposalFields({
  assignmentId,
  need,
  value,
  onChange,
}: {
  assignmentId: string;
  need: BuyerNeed | null;
  value: ProposalState;
  onChange: (next: ProposalState) => void;
}) {
  const [suggesting, setSuggesting] = useState(false);
  const items = need ? needItems(need) : [];

  function setNeed(key: NeedKey, patch: Partial<{ status: 'meets' | 'deviates' | ''; comment: string }>) {
    const current = value.needsCheck[key] ?? { status: '' as const, comment: '' };
    onChange({ ...value, needsCheck: { ...value.needsCheck, [key]: { ...current, ...patch } } });
  }

  function setModule(i: number, patch: Partial<ProposalState['modules'][number]>) {
    onChange({ ...value, modules: value.modules.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) });
  }

  async function suggest() {
    if (value.modules.length > 0 && !window.confirm('Det nuvarande upplägget ersätts av AI-utkastet. Fortsätta?')) return;
    setSuggesting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch('/api/suggest-training-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ assignmentId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Kunde inte ta fram ett förslag');
      onChange({
        ...value,
        deliveryFormat: body.delivery_format ?? value.deliveryFormat,
        durationHours: body.duration_hours != null ? String(body.duration_hours) : value.durationHours,
        modules: (body.modules ?? []).map((m: OfferModule) => ({
          title: m.title,
          description: m.description ?? '',
          hours: m.hours != null ? String(m.hours) : '',
        })),
        fitComment: body.fit_comment || value.fitComment,
      });
      toast.success('Utkast infogat', { description: 'Granska och justera innan du skickar offerten.' });
    } catch (e) {
      toast.error('Kunde inte ta fram ett förslag', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="space-y-6">
      {items.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-900">Granska köparens behov</h3>
          <p className="text-xs text-slate-500">Ange för varje punkt om ert förslag uppfyller den eller avviker.</p>
          <ul className="space-y-3">
            {items.map((i) => {
              const row = value.needsCheck[i.key];
              return (
                <li key={i.key} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-500">{i.label}</p>
                  <p className="text-sm text-slate-900 whitespace-pre-line mb-2">{i.value}</p>
                  <div className="flex gap-2" role="radiogroup" aria-label={`${i.label}: uppfylls eller avviker`}>
                    {(['meets', 'deviates'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={row?.status === s}
                        onClick={() => setNeed(i.key, { status: s })}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          row?.status === s
                            ? s === 'meets'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-amber-50 border-amber-300 text-amber-800'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {s === 'meets' ? 'Uppfylls' : 'Avviker'}
                      </button>
                    ))}
                  </div>
                  {row?.status === 'deviates' && (
                    <input
                      value={row.comment}
                      onChange={(e) => setNeed(i.key, { comment: e.target.value })}
                      maxLength={1000}
                      placeholder="Förklara avvikelsen"
                      aria-label={`Förklara avvikelsen för ${i.label}`}
                      className={inputClass}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-900">Föreslaget upplägg</h3>
          <button
            type="button"
            onClick={suggest}
            disabled={suggesting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            {suggesting ? 'Tar fram utkast…' : 'Föreslå upplägg utifrån behovet'}
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm text-slate-700">
            Genomförande
            <select
              value={value.deliveryFormat}
              onChange={(e) => onChange({ ...value, deliveryFormat: e.target.value })}
              className={inputClass}
            >
              <option value="">Ange inte</option>
              {Object.entries(DELIVERY_FORMAT_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Total omfattning (timmar)
            <input
              inputMode="decimal"
              value={value.durationHours}
              onChange={(e) => onChange({ ...value, durationHours: e.target.value })}
              className={inputClass}
            />
          </label>
        </div>

        <ul className="space-y-3">
          {value.modules.map((m, i) => (
            <li key={i} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  value={m.title}
                  onChange={(e) => setModule(i, { title: e.target.value })}
                  maxLength={200}
                  placeholder={`Modul ${i + 1}, titel`}
                  aria-label={`Modul ${i + 1}, titel`}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  inputMode="decimal"
                  value={m.hours}
                  onChange={(e) => setModule(i, { hours: e.target.value })}
                  placeholder="Tim"
                  aria-label={`Modul ${i + 1}, timmar`}
                  className="w-20 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...value, modules: value.modules.filter((_, idx) => idx !== i) })}
                  aria-label={`Ta bort modul ${i + 1}`}
                  className="p-2 text-slate-500 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <textarea
                rows={2}
                value={m.description}
                onChange={(e) => setModule(i, { description: e.target.value })}
                maxLength={2000}
                placeholder="Innehåll och arbetssätt"
                aria-label={`Modul ${i + 1}, beskrivning`}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </li>
          ))}
        </ul>
        {value.modules.length < 15 && (
          <button
            type="button"
            onClick={() => onChange({ ...value, modules: [...value.modules, { title: '', description: '', hours: '' }] })}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Lägg till modul
          </button>
        )}

        <label className="block text-sm text-slate-700">
          Kommentar till köparen om hur förslaget möter behovet
          <textarea
            rows={4}
            value={value.fitComment}
            onChange={(e) => onChange({ ...value, fitComment: e.target.value })}
            maxLength={4000}
            className={`${inputClass} resize-none`}
          />
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={value.reviewed}
          onChange={(e) => onChange({ ...value, reviewed: e.target.checked })}
          className="mt-0.5"
        />
        <span>Jag har granskat förfrågan och bekräftar att vi kan genomföra detta enligt offerten.</span>
      </label>
    </div>
  );
}
