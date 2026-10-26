import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabaseClient';

// Faktureringsinställningar (satser, betalningsvillkor, säljarens uppgifter) och lärosätenas
// utbetalningsuppgifter. Båda tabellerna är bara läsbara för admin, och skrivs via RPC.

interface Settings {
  default_vat_rate: number;
  commission_rate: number;
  payment_terms_days: number;
  payout_days_after_payment: number;
  seller_name: string | null;
  seller_org_number: string | null;
  seller_vat_number: string | null;
  seller_bankgiro: string | null;
  seller_address: { street?: string; postal_code?: string; city?: string } | null;
}

interface ProviderRow {
  id: string;
  name: string;
}

interface Payout {
  provider_id: string;
  payout_details: { method?: string; number?: string };
  payout_org_number: string | null;
  vat_registered: boolean | null;
  confirmed_at: string | null;
}

const input =
  'mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

const pct = (fraction: number) => String(Math.round(fraction * 10000) / 100);

export function BillingSettingsPanel() {
  return (
    <div className="space-y-8">
      <SettingsForm />
      <PayoutDetails />
    </div>
  );
}

function SettingsForm() {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    vat: '', commission: '', terms: '', payoutDays: '',
    name: '', orgNo: '', vatNo: '', bankgiro: '', street: '', postal: '', city: '',
  });

  useEffect(() => {
    supabase
      .from('billing_settings')
      .select('*')
      .maybeSingle()
      .then(({ data }) => {
        const s = data as Settings | null;
        if (s) {
          setF({
            vat: pct(s.default_vat_rate),
            commission: pct(s.commission_rate),
            terms: String(s.payment_terms_days),
            payoutDays: String(s.payout_days_after_payment),
            name: s.seller_name ?? '',
            orgNo: s.seller_org_number ?? '',
            vatNo: s.seller_vat_number ?? '',
            bankgiro: s.seller_bankgiro ?? '',
            street: s.seller_address?.street ?? '',
            postal: s.seller_address?.postal_code ?? '',
            city: s.seller_address?.city ?? '',
          });
        }
        setLoaded(true);
      });
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const n = (v: string) => Number(v.replace(',', '.'));
    const hasAddress = f.street.trim() || f.postal.trim() || f.city.trim();
    const { error } = await supabase.rpc('admin_update_billing_settings', {
      p_default_vat_rate: n(f.vat) / 100,
      p_commission_rate: n(f.commission) / 100,
      p_payment_terms_days: Number(f.terms),
      p_payout_days_after_payment: Number(f.payoutDays),
      p_seller: {
        name: f.name,
        org_number: f.orgNo,
        vat_number: f.vatNo,
        bankgiro: f.bankgiro,
        address: hasAddress ? { street: f.street, postal_code: f.postal, city: f.city } : null,
      },
    });
    setSaving(false);
    if (error) {
      toast.error('Kunde inte spara inställningarna', { description: error.message });
      return;
    }
    toast.success('Inställningarna är sparade', { description: 'Satserna gäller nya bokningar. Befintliga bokningar behåller sina värden.' });
  }

  if (!loaded) return <p className="text-sm text-slate-500">Laddar…</p>;

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form onSubmit={save} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Satser och villkor</h3>
        <p className="text-sm text-slate-500">Gäller nya bokningar. Redan gjorda bokningar behåller sina frysta värden.</p>
      </div>
      <div className="grid sm:grid-cols-4 gap-4">
        <label className="text-sm text-slate-700">Moms, procent<input required inputMode="decimal" value={f.vat} onChange={set('vat')} className={input} /></label>
        <label className="text-sm text-slate-700">Provision, procent<input required inputMode="decimal" value={f.commission} onChange={set('commission')} className={input} /></label>
        <label className="text-sm text-slate-700">Betalningsvillkor, dagar<input required type="number" min={0} value={f.terms} onChange={set('terms')} className={input} /></label>
        <label className="text-sm text-slate-700">Utbetalning, dagar efter betalning<input required type="number" min={0} value={f.payoutDays} onChange={set('payoutDays')} className={input} /></label>
      </div>

      <div>
        <h3 className="text-base font-semibold text-slate-900">Säljarens uppgifter</h3>
        <p className="text-sm text-slate-500">Visas på fakturautkastet. Tills de är ifyllda står &quot;Uppgifter saknas&quot; där.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="text-sm text-slate-700">Företagsnamn<input value={f.name} onChange={set('name')} className={input} /></label>
        <label className="text-sm text-slate-700">Organisationsnummer<input value={f.orgNo} onChange={set('orgNo')} className={input} /></label>
        <label className="text-sm text-slate-700">Momsregistreringsnummer<input value={f.vatNo} onChange={set('vatNo')} className={input} /></label>
        <label className="text-sm text-slate-700">Bankgiro<input value={f.bankgiro} onChange={set('bankgiro')} className={input} /></label>
        <label className="text-sm text-slate-700 sm:col-span-2">Adress, gata<input value={f.street} onChange={set('street')} className={input} /></label>
        <label className="text-sm text-slate-700">Postnummer<input value={f.postal} onChange={set('postal')} className={input} /></label>
        <label className="text-sm text-slate-700">Ort<input value={f.city} onChange={set('city')} className={input} /></label>
      </div>
      <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg">
        {saving ? 'Sparar…' : 'Spara inställningar'}
      </button>
    </form>
  );
}

function PayoutDetails() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [payouts, setPayouts] = useState<Record<string, Payout>>({});
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, d] = await Promise.all([
      supabase.from('providers').select('id, name').order('name'),
      supabase.from('provider_payout_details').select('provider_id, payout_details, payout_org_number, vat_registered, confirmed_at'),
    ]);
    setProviders((p.data ?? []) as ProviderRow[]);
    const map: Record<string, Payout> = {};
    for (const row of (d.data ?? []) as Payout[]) map[row.provider_id] = row;
    setPayouts(map);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-base font-semibold text-slate-900">Utbetalningsuppgifter</h3>
      <p className="text-sm text-slate-500 mb-4">
        Bara admin ser och ändrar dem. Lärosätet ser dem inte i Fas 1. Bekräfta när uppgifterna är kontrollerade.
      </p>
      <ul className="divide-y divide-slate-100">
        {providers.map(p => {
          const d = payouts[p.id];
          return (
            <li key={p.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {d?.payout_details?.number
                      ? `${(d.payout_details.method ?? 'bankgiro').toUpperCase()} ${d.payout_details.number}`
                      : 'Inga uppgifter'}
                    {d?.confirmed_at ? ` · bekräftade ${new Date(d.confirmed_at).toLocaleDateString('sv-SE')}` : d ? ' · ej bekräftade' : ''}
                  </p>
                </div>
                <button onClick={() => setEditing(editing === p.id ? null : p.id)} className="px-3 py-1.5 text-sm border border-slate-200 hover:bg-slate-50 rounded-lg">
                  {editing === p.id ? 'Stäng' : 'Redigera'}
                </button>
              </div>
              {editing === p.id && (
                <PayoutForm
                  providerId={p.id}
                  initial={d}
                  onSaved={async () => {
                    setEditing(null);
                    await load();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PayoutForm({ providerId, initial, onSaved }: { providerId: string; initial?: Payout; onSaved: () => Promise<void> }) {
  const [method, setMethod] = useState(initial?.payout_details?.method ?? 'bankgiro');
  const [number, setNumber] = useState(initial?.payout_details?.number ?? '');
  const [orgNo, setOrgNo] = useState(initial?.payout_org_number ?? '');
  const [vatRegistered, setVatRegistered] = useState<'' | 'yes' | 'no'>(
    initial?.vat_registered === true ? 'yes' : initial?.vat_registered === false ? 'no' : ''
  );
  const [confirmed, setConfirmed] = useState(!!initial?.confirmed_at);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_provider_payout_details', {
      p_provider_id: providerId,
      p_payout_details: { method, number: number.trim() },
      p_payout_org_number: orgNo || null,
      p_vat_registered: vatRegistered === '' ? null : vatRegistered === 'yes',
      p_confirmed: confirmed,
    });
    setSaving(false);
    if (error) {
      toast.error('Kunde inte spara utbetalningsuppgifterna', { description: error.message });
      return;
    }
    toast.success('Utbetalningsuppgifterna är sparade');
    await onSaved();
  }

  return (
    <form onSubmit={save} className="mt-3 rounded-lg bg-slate-50 p-4 space-y-3">
      <div className="grid sm:grid-cols-4 gap-3">
        <label className="text-sm text-slate-700">
          Typ
          <select value={method} onChange={e => setMethod(e.target.value)} className={input}>
            <option value="bankgiro">Bankgiro</option>
            <option value="plusgiro">Plusgiro</option>
            <option value="iban">IBAN</option>
          </select>
        </label>
        <label className="text-sm text-slate-700 sm:col-span-2">
          Nummer *
          <input required value={number} onChange={e => setNumber(e.target.value)} className={input} />
        </label>
        <label className="text-sm text-slate-700">
          Organisationsnummer
          <input value={orgNo} onChange={e => setOrgNo(e.target.value)} className={input} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <label className="text-sm text-slate-700">
          Momsregistrerat
          <select value={vatRegistered} onChange={e => setVatRegistered(e.target.value as '' | 'yes' | 'no')} className={`${input} w-40`}>
            <option value="">Okänt</option>
            <option value="yes">Ja</option>
            <option value="no">Nej</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
          Uppgifterna är kontrollerade och bekräftade
        </label>
      </div>
      <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg">
        {saving ? 'Sparar…' : 'Spara'}
      </button>
    </form>
  );
}
