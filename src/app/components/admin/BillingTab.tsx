import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabaseClient';
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABEL,
  formatSek,
  invoiceStatusBadge,
  invoiceStatusLabel,
  type InvoiceStatus,
} from '../../../lib/invoiceStatus';
import { BillingSettingsPanel } from './BillingSettingsPanel';

// Adminens Fakturering (Fas 1): inkorg över fakturaunderlag, detalj, justering med anledning,
// markeringar för hela livscykeln och hantering av begäran om avbokning. Alla ändringar går via
// admin_*-RPC som kontrollerar roll och giltiga övergångar i databasen.

interface Policy {
  free_until_days_before_start?: number;
  late_fee_percent?: number;
  text?: string;
}

interface Booking {
  id: string;
  title: string;
  participants: number;
  unit_price_ex_vat: number | null;
  start_date: string;
  reference: string | null;
  status: 'confirmed' | 'cancelled' | 'completed';
  source: 'scheduled_start' | 'custom_quote';
  cancellation_policy: Policy | null;
  cancellation_requested_at: string | null;
  cancellation_request_message: string | null;
  providers: { id: string; name: string } | null;
  organizations: {
    id: string;
    name: string;
    organization_number: string | null;
    invoice_address: { street?: string; postal_code?: string; city?: string; co?: string; country?: string } | null;
    invoice_email: string | null;
    vat_number: string | null;
  } | null;
}

interface Basis {
  id: string;
  number: string;
  status: InvoiceStatus;
  total_ex_vat: number;
  vat_rate: number;
  vat_amount: number;
  total_inc_vat: number;
  commission_amount: number;
  payout_amount: number;
  adjusted: boolean;
  invoice_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  payout_due_date: string | null;
  paid_out_at: string | null;
  fortnox_invoice_no: string | null;
  credit_note_no: string | null;
  payout_reference: string | null;
  created_at: string;
  bookings: Booking | null;
}

interface BasisEvent {
  id: string;
  actor_role: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

type Action = 'adjust' | 'invoice' | 'paid' | 'paidout' | 'credit' | 'cancel' | 'decline';

const SELECT =
  'id, number, status, total_ex_vat, vat_rate, vat_amount, total_inc_vat, commission_amount, payout_amount, adjusted, invoice_date, due_date, paid_at, payout_due_date, paid_out_at, fortnox_invoice_no, credit_note_no, payout_reference, created_at, ' +
  'bookings(id, title, participants, unit_price_ex_vat, start_date, reference, status, source, cancellation_policy, cancellation_requested_at, cancellation_request_message, providers(id, name), organizations(id, name, organization_number, invoice_address, invoice_email, vat_number))';

const EVENT_LABEL: Record<string, string> = {
  created: 'Underlag skapat',
  adjusted: 'Justerat',
  ready: 'Klart för fakturering',
  exported: 'Exporterat till Fortnox-fil',
  invoiced: 'Markerat som fakturerat',
  paid: 'Markerat som betalt',
  paid_out: 'Markerat som utbetalt',
  cancelled: 'Avbrutet',
  credited: 'Krediterat',
  cancellation_requested: 'Köparen begärde avbokning',
  cancellation_declined: 'Begäran om avbokning avslogs',
};

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', buyer: 'Köpare', provider: 'Lärosäte', system: 'Systemet' };

const input =
  'mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

function fmtDate(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString('sv-SE') : '–';
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function useBillingAttentionCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      const [ready, requests] = await Promise.all([
        supabase.from('invoice_bases').select('id', { count: 'exact', head: true }).eq('status', 'ready'),
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'confirmed')
          .not('cancellation_requested_at', 'is', null),
      ]);
      if (active) setCount((ready.count ?? 0) + (requests.count ?? 0));
    })();
    return () => {
      active = false;
    };
  }, []);
  return count;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '' || value === '–') return null;
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export function BillingTab() {
  const [view, setView] = useState<'bases' | 'settings'>('bases');
  const [rows, setRows] = useState<Basis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'requests' | InvoiceStatus>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('invoice_bases')
      .select(SELECT)
      .order('created_at', { ascending: false });
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setRows((data ?? []) as unknown as Basis[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasRequest = (r: Basis) => r.bookings?.status === 'confirmed' && !!r.bookings.cancellation_requested_at;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0, requests: 0 };
    for (const s of INVOICE_STATUSES) c[s] = 0;
    for (const r of rows ?? []) {
      c[r.status] += 1;
      if (hasRequest(r)) c.requests += 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(r => {
      if (filter === 'requests' && !hasRequest(r)) return false;
      if (filter !== 'all' && filter !== 'requests' && r.status !== filter) return false;
      if (!q) return true;
      return [r.number, r.fortnox_invoice_no, r.bookings?.title, r.bookings?.organizations?.name, r.bookings?.providers?.name, r.bookings?.reference]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
  }, [rows, filter, search]);

  const selected = rows?.find(r => r.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Fakturering</h2>
          <p className="text-sm text-slate-600">
            Fakturaunderlag skapas automatiskt vid bokning. Fakturan skapas i Fortnox och markeras här.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {([['bases', 'Underlag'], ['settings', 'Inställningar']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-3 py-1.5 text-sm rounded-md ${view === key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'settings' && <BillingSettingsPanel />}

      {view === 'bases' && (
        <>
          <div className="flex flex-wrap gap-2">
            {([['all', 'Alla'], ['requests', 'Begäran om avbokning']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 text-sm rounded-full border ${filter === key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              >
                {label} <span className="opacity-70">{counts[key]}</span>
              </button>
            ))}
            {INVOICE_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 text-sm rounded-full border ${filter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              >
                {INVOICE_STATUS_LABEL[s]} <span className="opacity-70">{counts[s]}</span>
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Sök nummer, Fortnox-nummer, kurs, köpare eller lärosäte…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-700">Kunde inte hämta fakturaunderlag: {error}</p>}
          {!error && rows === null && <p className="text-sm text-slate-500">Laddar…</p>}

          {rows && filtered.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
              {rows.length === 0 ? 'Inga fakturaunderlag ännu. De skapas när en köpare bokar eller accepterar en offert.' : 'Inga underlag matchar filtret.'}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-medium">Underlag</th>
                    <th className="px-4 py-3 font-medium">Köpare</th>
                    <th className="px-4 py-3 font-medium">Lärosäte</th>
                    <th className="px-4 py-3 font-medium">Kurs</th>
                    <th className="px-4 py-3 font-medium">Start</th>
                    <th className="px-4 py-3 font-medium text-right">Exkl. moms</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{r.number}</td>
                      <td className="px-4 py-3 text-slate-700">{r.bookings?.organizations?.name ?? '–'}</td>
                      <td className="px-4 py-3 text-slate-700">{r.bookings?.providers?.name ?? '–'}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-[220px] truncate">{r.bookings?.title ?? '–'}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{fmtDate(r.bookings?.start_date)}</td>
                      <td className="px-4 py-3 text-right text-slate-900 whitespace-nowrap">{formatSek(r.total_ex_vat)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${invoiceStatusBadge(r.status)}`}>
                          {invoiceStatusLabel(r.status)}
                        </span>
                        {r.adjusted && <span className="ml-1.5 text-xs text-slate-500">Justerad</span>}
                        {hasRequest(r) && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-amber-700">
                            <AlertTriangle className="w-3 h-3" /> Avbokning begärd
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selected && (
        <BasisDetail
          basis={selected}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function BasisDetail({ basis, onClose, onChanged }: { basis: Basis; onClose: () => void; onChanged: () => Promise<void> }) {
  const b = basis.bookings;
  const org = b?.organizations;
  const [events, setEvents] = useState<BasisEvent[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  // Formulärfält (delas mellan åtgärderna, nollställs när åtgärden byts)
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'total' | 'unit' | 'qty'>('total');
  const [amount, setAmount] = useState('');
  const [qty, setQty] = useState('');
  const [vatPct, setVatPct] = useState('');
  const [fortnoxNo, setFortnoxNo] = useState('');
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  const [creditNo, setCreditNo] = useState('');
  const [fee, setFee] = useState('');

  const loadEvents = useCallback(async () => {
    const { data } = await supabase
      .from('invoice_basis_events')
      .select('id, actor_role, event_type, payload, created_at')
      .eq('basis_id', basis.id)
      .order('created_at', { ascending: true });
    setEvents((data ?? []) as unknown as BasisEvent[]);
  }, [basis.id]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, basis.status]);

  function open(next: Action) {
    setAction(next);
    setReason('');
    setAmount('');
    setQty('');
    setVatPct('');
    setFortnoxNo('');
    setDate(today());
    setReference('');
    setCreditNo('');
    const pct = b?.cancellation_policy?.late_fee_percent;
    setFee(next === 'cancel' && pct !== undefined ? String(Math.round(basis.total_ex_vat * pct) / 100) : '');
  }

  async function run(label: string, call: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    const { error } = await call();
    setBusy(false);
    if (error) {
      toast.error(`Kunde inte ${label}`, { description: error.message });
      return;
    }
    toast.success(label.charAt(0).toUpperCase() + label.slice(1));
    setAction(null);
    await onChanged();
    await loadEvents();
  }

  const num = (v: string) => Number(v.replace(',', '.'));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!b) return;
    switch (action) {
      case 'adjust': {
        const params: Record<string, unknown> = { p_basis_id: basis.id, p_reason: reason };
        if (mode === 'total') params.p_total_ex_vat = num(amount);
        if (mode === 'unit') {
          params.p_unit_price_ex_vat = num(amount);
          if (qty) params.p_participants = Number(qty);
        }
        if (mode === 'qty') params.p_participants = Number(qty);
        if (vatPct.trim() !== '') params.p_vat_rate = num(vatPct) / 100;
        return run('justera underlaget', () => supabase.rpc('admin_adjust_invoice_basis', params));
      }
      case 'invoice':
        return run('markera som fakturerat', () =>
          supabase.rpc('admin_mark_invoiced', { p_basis_id: basis.id, p_fortnox_invoice_no: fortnoxNo, p_invoice_date: date })
        );
      case 'paid':
        return run('markera som betalt', () => supabase.rpc('admin_mark_paid', { p_basis_id: basis.id, p_paid_at: date }));
      case 'paidout':
        return run('markera som utbetalt', () =>
          supabase.rpc('admin_mark_paid_out', { p_basis_id: basis.id, p_reference: reference || null, p_paid_out_at: date })
        );
      case 'credit':
        return run('markera som krediterat', () =>
          supabase.rpc('admin_mark_credited', { p_basis_id: basis.id, p_credit_note_no: creditNo })
        );
      case 'cancel':
        return run('avboka bokningen', () =>
          supabase.rpc('admin_cancel_booking', {
            p_booking_id: b.id,
            p_reason: reason,
            p_fee_ex_vat: fee.trim() === '' ? null : num(fee),
          })
        );
      case 'decline':
        return run('avslå begäran', () => supabase.rpc('admin_decline_cancellation_request', { p_booking_id: b.id, p_reason: reason }));
    }
  }

  const editable = basis.status === 'preliminary' || basis.status === 'ready';
  const requestOpen = b?.status === 'confirmed' && !!b.cancellation_requested_at;
  const policy = b?.cancellation_policy;
  const needsReason = action === 'adjust' || action === 'cancel' || action === 'decline';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{basis.number}</h3>
            <span className={`inline-block mt-1 px-2.5 py-1 rounded-full text-xs font-medium border ${invoiceStatusBadge(basis.status)}`}>
              {invoiceStatusLabel(basis.status)}
            </span>
            {basis.adjusted && <span className="ml-2 text-xs text-slate-500">Justerad</span>}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {requestOpen && b && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Köparen har begärt avbokning ({fmtDate(b.cancellation_requested_at)})
              </p>
              {b.cancellation_request_message && <p className="mt-1">”{b.cancellation_request_message}”</p>}
              {policy && policy.free_until_days_before_start !== undefined && (
                <p className="mt-1 text-amber-800">
                  Lärosätets regel: fri avbokning till {policy.free_until_days_before_start} dagar före start, därefter {policy.late_fee_percent} % av priset
                  {policy.text ? `. ${policy.text}` : '.'}
                </p>
              )}
              {!policy && <p className="mt-1 text-amber-800">Lärosätet hade ingen registrerad policy vid bokningen.</p>}
            </div>
          )}

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Köpare" value={org?.name} />
            <Field label="Lärosäte" value={b?.providers?.name} />
            <Field label="Kurs" value={b?.title} />
            <Field label="Typ" value={b ? (b.source === 'custom_quote' ? 'Anpassad utbildning' : 'Öppen kursstart') : null} />
            <Field label="Startdatum" value={fmtDate(b?.start_date)} />
            <Field label="Deltagare" value={b?.participants} />
            <Field label="Köparens referens" value={b?.reference} />
            <Field label="Bokning" value={b ? { confirmed: 'Bekräftad', cancelled: 'Avbokad', completed: 'Genomförd' }[b.status] : null} />
            <Field label="Fortnox-fakturanummer" value={basis.fortnox_invoice_no} />
            <Field label="Fakturadatum" value={fmtDate(basis.invoice_date)} />
            <Field label="Förfallodatum" value={fmtDate(basis.due_date)} />
            <Field label="Betald" value={fmtDate(basis.paid_at)} />
            <Field label="Utbetalning planerad" value={basis.status === 'paid' ? fmtDate(basis.payout_due_date) : null} />
            <Field label="Utbetald" value={fmtDate(basis.paid_out_at)} />
            <Field label="Utbetalningsreferens" value={basis.payout_reference} />
            <Field label="Kreditfaktura" value={basis.credit_note_no} />
          </dl>

          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">Belopp</p>
            <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
              <Field label="Exkl. moms" value={formatSek(basis.total_ex_vat)} />
              <Field label={`Moms ${Math.round(basis.vat_rate * 10000) / 100} %`} value={formatSek(basis.vat_amount)} />
              <Field label="Inkl. moms" value={formatSek(basis.total_inc_vat)} />
              <Field label="Provision" value={formatSek(basis.commission_amount)} />
              <Field label="Utbetalning till lärosäte" value={formatSek(basis.payout_amount)} />
            </dl>
          </div>

          {org && (
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500 mb-2">Fakturauppgifter (köparen)</p>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field label="Organisationsnummer" value={org.organization_number} />
                <Field label="E-post för fakturor" value={org.invoice_email} />
                <Field label="Momsregistreringsnummer" value={org.vat_number} />
                <Field
                  label="Fakturaadress"
                  value={
                    org.invoice_address
                      ? [org.invoice_address.street, [org.invoice_address.postal_code, org.invoice_address.city].filter(Boolean).join(' ')]
                          .filter(Boolean)
                          .join(', ')
                      : null
                  }
                />
              </dl>
            </div>
          )}

          {/* Åtgärder */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Åtgärder</p>
            <div className="flex flex-wrap gap-2">
              {basis.status === 'preliminary' && (
                <button
                  disabled={busy}
                  onClick={() => run('markera som klar för fakturering', () => supabase.rpc('admin_mark_ready', { p_basis_id: basis.id }))}
                  className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  Markera klar för fakturering
                </button>
              )}
              {basis.status === 'ready' && (
                <button onClick={() => open('invoice')} className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                  Markera fakturerad
                </button>
              )}
              {basis.status === 'invoiced' && (
                <button onClick={() => open('paid')} className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                  Markera betald
                </button>
              )}
              {basis.status === 'paid' && (
                <button onClick={() => open('paidout')} className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                  Markera utbetald
                </button>
              )}
              {editable && (
                <button onClick={() => open('adjust')} className="px-3 py-2 text-sm border border-slate-200 hover:bg-slate-50 rounded-lg">
                  Justera
                </button>
              )}
              {(basis.status === 'invoiced' || basis.status === 'paid') && (
                <button onClick={() => open('credit')} className="px-3 py-2 text-sm border border-red-200 text-red-700 hover:bg-red-50 rounded-lg">
                  Markera krediterad
                </button>
              )}
              {editable && b?.status === 'confirmed' && (
                <button onClick={() => open('cancel')} className="px-3 py-2 text-sm border border-red-200 text-red-700 hover:bg-red-50 rounded-lg">
                  Avboka bokningen
                </button>
              )}
              {requestOpen && (
                <button onClick={() => open('decline')} className="px-3 py-2 text-sm border border-slate-200 hover:bg-slate-50 rounded-lg">
                  Avslå begäran om avbokning
                </button>
              )}
            </div>
            {requestOpen && !editable && (
              <p className="mt-2 text-xs text-slate-500">
                Fakturan är redan skapad. En avbokning hanteras genom att kreditera fakturan i Fortnox och markera den som krediterad här.
              </p>
            )}
            {basis.status === 'paid_out' || basis.status === 'cancelled' || basis.status === 'credited' ? (
              <p className="mt-2 text-xs text-slate-500">Underlaget är avslutat och kan inte ändras.</p>
            ) : null}
          </div>

          {action && (
            <form onSubmit={submit} className="rounded-lg border border-slate-200 p-4 space-y-3">
              {action === 'adjust' && (
                <>
                  <p className="text-sm font-medium text-slate-900">Justera underlaget</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {([['total', 'Nytt totalpris'], ['unit', 'Nytt à-pris'], ['qty', 'Nytt antal (behåller à-pris)']] as const).map(([k, l]) => (
                      <label key={k} className="flex items-center gap-1.5">
                        <input type="radio" checked={mode === k} onChange={() => setMode(k)} /> {l}
                      </label>
                    ))}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {mode !== 'qty' && (
                      <label className="text-sm text-slate-700">
                        {mode === 'total' ? 'Totalpris exkl. moms' : 'À-pris exkl. moms'}
                        <input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={input} />
                      </label>
                    )}
                    {mode !== 'total' && (
                      <label className="text-sm text-slate-700">
                        Antal deltagare{mode === 'unit' ? ' (valfritt)' : ''}
                        <input required={mode === 'qty'} type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className={input} />
                      </label>
                    )}
                    <label className="text-sm text-slate-700">
                      Moms i procent (valfritt)
                      <input inputMode="decimal" value={vatPct} onChange={e => setVatPct(e.target.value)} placeholder={String(Math.round(basis.vat_rate * 10000) / 100)} className={input} />
                    </label>
                  </div>
                </>
              )}
              {action === 'invoice' && (
                <>
                  <p className="text-sm font-medium text-slate-900">Markera fakturerad</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-sm text-slate-700">
                      Fortnox-fakturanummer *
                      <input required value={fortnoxNo} onChange={e => setFortnoxNo(e.target.value)} className={input} />
                    </label>
                    <label className="text-sm text-slate-700">
                      Fakturadatum *
                      <input required type="date" value={date} onChange={e => setDate(e.target.value)} className={input} />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">Förfallodatum beräknas från betalningsvillkoren. Belopp kan inte ändras efter detta.</p>
                </>
              )}
              {action === 'paid' && (
                <>
                  <p className="text-sm font-medium text-slate-900">Markera betald</p>
                  <label className="block text-sm text-slate-700 max-w-xs">
                    Betaldatum *
                    <input required type="date" value={date} onChange={e => setDate(e.target.value)} className={input} />
                  </label>
                  <p className="text-xs text-slate-500">Utbetalningsdatum till lärosätet beräknas från inställningen för utbetalningstid.</p>
                </>
              )}
              {action === 'paidout' && (
                <>
                  <p className="text-sm font-medium text-slate-900">Markera utbetald</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-sm text-slate-700">
                      Utbetalningsdatum *
                      <input required type="date" value={date} onChange={e => setDate(e.target.value)} className={input} />
                    </label>
                    <label className="text-sm text-slate-700">
                      Referens (t.ex. betalfilens nummer)
                      <input value={reference} onChange={e => setReference(e.target.value)} className={input} />
                    </label>
                  </div>
                </>
              )}
              {action === 'credit' && (
                <>
                  <p className="text-sm font-medium text-slate-900">Markera krediterad</p>
                  <label className="block text-sm text-slate-700 max-w-xs">
                    Kreditfakturans nummer *
                    <input required value={creditNo} onChange={e => setCreditNo(e.target.value)} className={input} />
                  </label>
                </>
              )}
              {action === 'cancel' && (
                <>
                  <p className="text-sm font-medium text-slate-900">Avboka bokningen</p>
                  <label className="block text-sm text-slate-700 max-w-xs">
                    Avbokningsavgift exkl. moms (lämna tomt för ingen avgift)
                    <input inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} className={input} />
                  </label>
                  <p className="text-xs text-slate-500">
                    Med avgift ersätts underlagets belopp av avgiften och underlaget behålls. Utan avgift avbryts underlaget. Platserna återställs i båda fallen.
                    {policy?.late_fee_percent !== undefined && ` Förslag enligt lärosätets regel: ${policy.late_fee_percent} % av ${formatSek(basis.total_ex_vat)}.`}
                  </p>
                </>
              )}
              {action === 'decline' && <p className="text-sm font-medium text-slate-900">Avslå begäran om avbokning</p>}
              {needsReason && (
                <label className="block text-sm text-slate-700">
                  Anledning * (loggas)
                  <textarea required minLength={3} rows={2} value={reason} onChange={e => setReason(e.target.value)} className={input} />
                </label>
              )}
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg">
                  {busy ? 'Sparar…' : 'Bekräfta'}
                </button>
                <button type="button" onClick={() => setAction(null)} disabled={busy} className="px-4 py-2 text-sm border border-slate-200 hover:bg-slate-50 rounded-lg">
                  Avbryt
                </button>
              </div>
            </form>
          )}

          <div>
            <p className="text-xs font-medium text-slate-500 mb-3">Historik</p>
            <ol className="space-y-3 border-l border-slate-200 ml-1.5">
              {events.map(ev => {
                const p = ev.payload ?? {};
                const r = typeof p.reason === 'string' ? p.reason : typeof p.message === 'string' ? p.message : null;
                return (
                  <li key={ev.id} className="pl-4 relative">
                    <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-600" aria-hidden="true" />
                    <p className="text-sm text-slate-900">{EVENT_LABEL[ev.event_type] ?? ev.event_type}</p>
                    {r && <p className="text-sm text-slate-600">{r}</p>}
                    <p className="text-xs text-slate-500">
                      {ROLE_LABEL[ev.actor_role] ?? ev.actor_role} · {new Date(ev.created_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
