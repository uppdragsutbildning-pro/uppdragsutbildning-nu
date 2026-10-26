import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { formatSek, invoiceStatusBadge, invoiceStatusLabel } from '../../../lib/invoiceStatus';
import { isInvoiceUnread, markInvoiceSeen, readInvoiceSeen } from '../../../hooks/useInvoiceUpdates';

// Köparens Fakturor i Mitt konto. Läser via buyer_list_invoices (provision, netto och utbetalning
// exponeras aldrig). Status och belopp kommer från samma källa som Admin och lärosätet ser.

interface Row {
  basis_id: string;
  number: string;
  status: string;
  organization_name: string;
  title: string;
  provider_name: string;
  participants: number;
  start_date: string;
  reference: string | null;
  total_ex_vat: number;
  vat_rate: number;
  vat_amount: number;
  total_inc_vat: number;
  fortnox_invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  last_event_at: string | null;
}

const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('sv-SE') : null);

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-xs text-[var(--fg-subtle)]">{label}</dt>
      <dd className="text-sm text-[var(--fg)]">{value}</dd>
    </div>
  );
}

export function InvoicesView() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [, force] = useState(0);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('buyer_list_invoices');
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setError(null);
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  const seen = useMemo(() => (user ? readInvoiceSeen('buyer', user.id) : {}), [user, rows, expanded]);

  function toggle(r: Row) {
    if (expanded === r.basis_id) {
      setExpanded(null);
      return;
    }
    setExpanded(r.basis_id);
    if (user) {
      markInvoiceSeen('buyer', user.id, r.basis_id, r.last_event_at);
      force(n => n + 1);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--fg-muted)]">
        Här ser ni status och belopp för era bokningar. Fakturan skickas från oss till organisationens fakturamejl.
      </p>

      {error && <p className="text-sm text-red-700">Kunde inte hämta fakturor: {error}</p>}
      {!error && rows === null && <p className="text-sm text-[var(--fg-muted)]">Laddar…</p>}

      {rows?.length === 0 && (
        <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl p-6 sm:p-8">
          <p className="text-[15px] font-medium text-[var(--fg)] mb-1">Inga fakturor ännu</p>
          <p className="text-sm text-[var(--fg-muted)] mb-5">När ni bokar en utbildning skapas ett underlag som följs upp här.</p>
          <Link to="/catalog" className="text-sm text-[var(--accent)] hover:underline">
            Utforska utbildningar
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        {rows?.map(r => {
          const open = expanded === r.basis_id;
          const unread = isInvoiceUnread(r.last_event_at, seen[r.basis_id]);
          return (
            <li key={r.basis_id} className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl">
              <button type="button" onClick={() => toggle(r)} aria-expanded={open} className="w-full flex items-center gap-4 p-5 text-left">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-[var(--fg)] truncate">
                    {r.title}
                    {unread && <span className="ml-2 inline-block align-middle px-2 py-0.5 rounded-full bg-green-600 text-white text-[11px] font-medium">Nytt</span>}
                  </p>
                  <p className="text-xs text-[var(--fg-subtle)] mt-0.5">
                    {r.number} · {r.provider_name} · {formatSek(r.total_inc_vat)} inkl. moms
                    {r.due_date && r.status === 'invoiced' ? ` · förfaller ${date(r.due_date)}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border ${invoiceStatusBadge(r.status)}`}>
                  {invoiceStatusLabel(r.status)}
                </span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-[var(--fg-subtle)] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {open && (
                <div className="px-5 pb-5 border-t border-[var(--border-light)] pt-4">
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Item label="Lärosäte" value={r.provider_name} />
                    <Item label="Organisation" value={r.organization_name} />
                    <Item label="Start" value={date(r.start_date)} />
                    <Item label="Deltagare" value={r.participants} />
                    <Item label="Er referens" value={r.reference} />
                    <Item label="Summa exkl. moms" value={formatSek(r.total_ex_vat)} />
                    <Item label={`Moms ${Math.round(r.vat_rate * 10000) / 100} %`} value={formatSek(r.vat_amount)} />
                    <Item label="Att betala" value={formatSek(r.total_inc_vat)} />
                    <Item label="Fakturanummer" value={r.fortnox_invoice_no} />
                    <Item label="Fakturadatum" value={date(r.invoice_date)} />
                    <Item label="Förfallodatum" value={date(r.due_date)} />
                    <Item label="Betald" value={date(r.paid_at)} />
                  </dl>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
