import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Receipt } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useProviderContext } from '../../../contexts/ProviderContext';
import { formatSek, invoiceStatusBadge, invoiceStatusLabel } from '../../../lib/invoiceStatus';
import { isInvoiceUnread, markInvoiceSeen, readInvoiceSeen } from '../../../hooks/useInvoiceUpdates';

// Lärosätets Fakturering: skrivskyddad. Läser via provider_list_invoicing, som exponerar bara
// de kolumner lärosätet får se. Status, etiketter och belopp kommer från samma källa som Admin.

interface Row {
  basis_id: string;
  number: string;
  status: string;
  booking_status: string;
  source: 'scheduled_start' | 'custom_quote';
  title: string;
  buyer_name: string;
  participants: number;
  unit_price_ex_vat: number | null;
  total_ex_vat: number;
  commission_amount: number;
  payout_amount: number;
  start_date: string;
  due_date: string | null;
  paid_at: string | null;
  payout_due_date: string | null;
  paid_out_at: string | null;
  adjusted: boolean;
  last_event_at: string | null;
}

interface Ev {
  event_type: string;
  created_at: string;
}

const EVENT_LABEL: Record<string, string> = {
  created: 'Underlag skapat vid bokning',
  adjusted: 'Underlaget justerades av plattformen',
  ready: 'Klart för fakturering',
  invoiced: 'Faktura skickad till köparen',
  paid: 'Betalning mottagen',
  paid_out: 'Utbetalning genomförd',
  cancelled: 'Avbruten',
  credited: 'Krediterad',
};

const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('sv-SE') : null);

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export function ProviderBillingPage() {
  const { selectedProviderId } = useProviderContext();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, Ev[]>>({});
  const [, force] = useState(0);

  const load = useCallback(async () => {
    if (!selectedProviderId) return;
    const { data, error: rpcError } = await supabase.rpc('provider_list_invoicing', { p_provider_id: selectedProviderId });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setError(null);
    setRows((data ?? []) as Row[]);
  }, [selectedProviderId]);

  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  const seen = useMemo(() => (user ? readInvoiceSeen('provider', user.id) : {}), [user, rows, expanded]);

  async function toggle(r: Row) {
    if (expanded === r.basis_id) {
      setExpanded(null);
      return;
    }
    setExpanded(r.basis_id);
    if (user) {
      markInvoiceSeen('provider', user.id, r.basis_id, r.last_event_at);
      force(n => n + 1);
    }
    if (!events[r.basis_id]) {
      const { data } = await supabase.rpc('provider_invoicing_events', { p_basis_id: r.basis_id, p_provider_id: selectedProviderId });
      setEvents(prev => ({ ...prev, [r.basis_id]: (data ?? []) as Ev[] }));
    }
  }

  const sums = useMemo(() => {
    const sum = (statuses: string[]) =>
      Math.round((rows ?? []).filter(r => statuses.includes(r.status)).reduce((a, r) => a + Number(r.payout_amount), 0) * 100) / 100;
    return {
      coming: sum(['preliminary', 'ready', 'invoiced']),
      planned: sum(['paid']),
      paidOut: sum(['paid_out']),
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
          <Receipt className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Fakturering</h1>
          <p className="text-sm text-slate-500">
            Era bokningar och deras fakturaunderlag. Sidan är skrivskyddad. Fakturering och utbetalning hanteras av plattformen.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {[
          ['Kommande utbetalning', sums.coming, 'Preliminära, klara och fakturerade underlag (netto)'],
          ['Betalda, utbetalning planerad', sums.planned, 'Köparen har betalat (netto)'],
          ['Utbetalt', sums.paidOut, 'Genomförda utbetalningar (netto)'],
        ].map(([label, value, hint]) => (
          <div key={label as string} className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-2xl font-bold text-slate-900">{formatSek(value as number)}</div>
            <div className="text-sm text-slate-700">{label as string}</div>
            <div className="text-xs text-slate-500 mt-0.5">{hint as string}</div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-700">Kunde inte hämta fakturering: {error}</p>}
      {!error && rows === null && <p className="text-sm text-slate-500">Laddar…</p>}
      {rows?.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
          Inga bokningar ännu. När en köpare bokar eller accepterar er offert dyker underlaget upp här.
        </div>
      )}

      <ul className="space-y-3">
        {rows?.map(r => {
          const open = expanded === r.basis_id;
          const unread = isInvoiceUnread(r.last_event_at, seen[r.basis_id]);
          return (
            <li key={r.basis_id} className="bg-white border border-slate-200 rounded-xl">
              <button type="button" onClick={() => toggle(r)} aria-expanded={open} className="w-full flex items-center gap-4 p-5 text-left">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-slate-900 truncate">
                    {r.title}
                    {unread && <span className="ml-2 inline-block align-middle px-2 py-0.5 rounded-full bg-green-600 text-white text-[11px] font-medium">Nytt</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.number} · {r.buyer_name} · start {date(r.start_date)} · netto {formatSek(r.payout_amount)}
                    {r.status === 'paid' && r.payout_due_date ? ` · utbetalning planerad ${date(r.payout_due_date)}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border ${invoiceStatusBadge(r.status)}`}>
                  {invoiceStatusLabel(r.status)}
                </span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {open && (
                <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-5">
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Item label="Köpare" value={r.buyer_name} />
                    <Item label="Typ" value={r.source === 'custom_quote' ? 'Anpassad utbildning' : 'Öppen kursstart'} />
                    <Item label="Deltagare" value={r.participants} />
                    <Item label="À-pris exkl. moms" value={r.unit_price_ex_vat !== null ? formatSek(r.unit_price_ex_vat) : null} />
                    <Item label="Pris exkl. moms" value={formatSek(r.total_ex_vat)} />
                    <Item label="Provision" value={formatSek(r.commission_amount)} />
                    <Item label="Netto till er" value={formatSek(r.payout_amount)} />
                    <Item label="Förfallodatum för fakturan" value={date(r.due_date)} />
                    <Item label="Utbetalning planerad" value={r.status === 'paid' ? date(r.payout_due_date) : null} />
                    <Item label="Utbetald" value={date(r.paid_out_at)} />
                  </dl>
                  {r.adjusted && (
                    <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
                      Underlaget har justerats av plattformen. Beloppen ovan är de gällande.
                    </p>
                  )}
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-3">Förlopp</p>
                    <ol className="space-y-3 border-l border-slate-200 ml-1.5">
                      {(events[r.basis_id] ?? []).map((e, i) => (
                        <li key={i} className="pl-4 relative">
                          <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-600" aria-hidden="true" />
                          <p className="text-sm text-slate-900">{EVENT_LABEL[e.event_type] ?? 'Uppdatering'}</p>
                          <p className="text-xs text-slate-500">{new Date(e.created_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
