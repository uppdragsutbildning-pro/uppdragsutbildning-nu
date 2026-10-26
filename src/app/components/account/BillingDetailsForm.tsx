import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';

// Organisationens fakturauppgifter. Krävs för att boka eller acceptera en offert, eftersom
// fakturaunderlaget annars inte kan skapas. Valideringen görs i databasen (buyer_update_billing_details).

export interface BillingDetails {
  organization_number: string | null;
  invoice_address: { street?: string; postal_code?: string; city?: string; co?: string; country?: string } | null;
  invoice_email: string | null;
  e_invoice_id: string | null;
  vat_number: string | null;
  default_reference: string | null;
}

export function isBillingComplete(d: BillingDetails | null): boolean {
  return (
    !!d &&
    !!d.organization_number?.trim() &&
    !!d.invoice_email?.trim() &&
    !!d.invoice_address?.street?.trim() &&
    !!d.invoice_address?.postal_code?.trim() &&
    !!d.invoice_address?.city?.trim()
  );
}

export async function fetchBillingDetails(orgId: string): Promise<BillingDetails | null> {
  const { data } = await supabase
    .from('organizations')
    .select('organization_number, invoice_address, invoice_email, e_invoice_id, vat_number, default_reference')
    .eq('id', orgId)
    .maybeSingle();
  return (data as BillingDetails | null) ?? null;
}

const input =
  'mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

interface Props {
  orgId: string;
  canEdit: boolean;
  onSaved: (details: BillingDetails) => void;
  submitLabel?: string;
}

export function BillingDetailsForm({ orgId, canEdit, onSaved, submitLabel = 'Spara fakturauppgifter' }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    orgNumber: '', street: '', postalCode: '', city: '', co: '',
    invoiceEmail: '', eInvoiceId: '', vatNumber: '', defaultReference: '',
  });

  useEffect(() => {
    let active = true;
    fetchBillingDetails(orgId).then(d => {
      if (!active) return;
      if (d) {
        setF({
          orgNumber: d.organization_number ?? '',
          street: d.invoice_address?.street ?? '',
          postalCode: d.invoice_address?.postal_code ?? '',
          city: d.invoice_address?.city ?? '',
          co: d.invoice_address?.co ?? '',
          invoiceEmail: d.invoice_email ?? '',
          eInvoiceId: d.e_invoice_id ?? '',
          vatNumber: d.vat_number ?? '',
          defaultReference: d.default_reference ?? '',
        });
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [orgId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.rpc('buyer_update_billing_details', {
      p_org_id: orgId,
      p_organization_number: f.orgNumber,
      p_invoice_address: { street: f.street, postal_code: f.postalCode, city: f.city, co: f.co || null },
      p_invoice_email: f.invoiceEmail,
      p_e_invoice_id: f.eInvoiceId || null,
      p_vat_number: f.vatNumber || null,
      p_default_reference: f.defaultReference || null,
    });
    setSaving(false);
    if (error) {
      toast.error('Kunde inte spara fakturauppgifter', { description: error.message });
      return;
    }
    toast.success('Fakturauppgifterna är sparade');
    const d = await fetchBillingDetails(orgId);
    if (d) onSaved(d);
  }

  if (!loaded) return <p className="text-sm text-slate-500">Laddar fakturauppgifter…</p>;

  if (!canEdit) {
    return (
      <p className="text-sm text-slate-600">
        Organisationens fakturauppgifter saknas. En ägare eller administratör i organisationen behöver fylla i dem
        under Mitt konto innan ni kan boka.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm text-slate-700">
          Organisationsnummer *
          <input required value={f.orgNumber} onChange={e => setF({ ...f, orgNumber: e.target.value })} placeholder="556000-0000" className={input} />
        </label>
        <label className="text-sm text-slate-700">
          E-post för fakturor *
          <input required type="email" value={f.invoiceEmail} onChange={e => setF({ ...f, invoiceEmail: e.target.value })} className={input} />
        </label>
        <label className="text-sm text-slate-700 sm:col-span-2">
          Fakturaadress, gata *
          <input required value={f.street} onChange={e => setF({ ...f, street: e.target.value })} className={input} />
        </label>
        <label className="text-sm text-slate-700">
          Postnummer *
          <input required value={f.postalCode} onChange={e => setF({ ...f, postalCode: e.target.value })} className={input} />
        </label>
        <label className="text-sm text-slate-700">
          Ort *
          <input required value={f.city} onChange={e => setF({ ...f, city: e.target.value })} className={input} />
        </label>
        <label className="text-sm text-slate-700">
          Momsregistreringsnummer
          <input value={f.vatNumber} onChange={e => setF({ ...f, vatNumber: e.target.value })} className={input} />
        </label>
        <label className="text-sm text-slate-700">
          E-fakturaadress (valfri)
          <input value={f.eInvoiceId} onChange={e => setF({ ...f, eInvoiceId: e.target.value })} className={input} />
        </label>
        <label className="text-sm text-slate-700 sm:col-span-2">
          Standardreferens (hamnar på fakturan om ni inte anger en annan)
          <input value={f.defaultReference} onChange={e => setF({ ...f, defaultReference: e.target.value })} className={input} />
        </label>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {saving ? 'Sparar…' : submitLabel}
      </button>
    </form>
  );
}
