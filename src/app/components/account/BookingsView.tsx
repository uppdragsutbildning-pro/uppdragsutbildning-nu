import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { formatSek } from '../../../lib/invoiceStatus';
import { BillingDetailsForm } from './BillingDetailsForm';
import { policySummary } from '../training/BookingDialog';

interface BookingRow {
  booking_id: string;
  organization_id: string;
  organization_name: string;
  source: 'scheduled_start' | 'custom_quote';
  title: string;
  provider_name: string;
  participants: number;
  unit_price_ex_vat: number | null;
  total_ex_vat: number;
  vat_rate: number;
  start_date: string;
  reference: string | null;
  status: 'confirmed' | 'cancelled' | 'completed';
  confirmed_at: string;
  cancellation_policy: { free_until_days_before_start?: number; late_fee_percent?: number; text?: string } | null;
  cancellation_requested_at: string | null;
}

const BOOKING_STATUS: Record<BookingRow['status'], { label: string; className: string }> = {
  confirmed: { label: 'Bekräftad', className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Avbokad', className: 'bg-slate-100 text-slate-600' },
  completed: { label: 'Genomförd', className: 'bg-slate-100 text-slate-700' },
};

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-xs text-[var(--fg-subtle)]">{label}</dt>
      <dd className="text-sm text-[var(--fg)]">{value}</dd>
    </div>
  );
}

// Visar bara om fri avbokning verkar öppen. Databasen avgör (buyer_cancel_booking).
function freeCancellationOpen(b: BookingRow): boolean {
  const p = b.cancellation_policy;
  if (!p || p.free_until_days_before_start === undefined || p.late_fee_percent === undefined) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(b.start_date + 'T00:00:00').getTime() - today.getTime()) / 86400000);
  return days >= p.free_until_days_before_start;
}

function CancelPanel({ booking, onDone }: { booking: BookingRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const free = freeCancellationOpen(booking);

  async function submit() {
    setBusy(true);
    const { error } = free
      ? await supabase.rpc('buyer_cancel_booking', { p_booking_id: booking.booking_id, p_reason: text.trim() || null })
      : await supabase.rpc('buyer_request_cancellation', { p_booking_id: booking.booking_id, p_message: text.trim() || null });
    setBusy(false);
    if (error) {
      toast.error(free ? 'Kunde inte avboka' : 'Kunde inte skicka begäran', { description: error.message });
      return;
    }
    toast.success(free ? 'Bokningen är avbokad' : 'Begäran om avbokning är skickad', {
      description: free ? 'Platserna frigörs och inget underlag skickas.' : 'Vi hör av oss när vi har tittat på den.',
    });
    onDone();
  }

  if (booking.cancellation_requested_at) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        Avbokning begärd {new Date(booking.cancellation_requested_at).toLocaleDateString('sv-SE')}. Vi återkommer.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2.5 rounded-[10px] text-sm font-medium text-red-700 border border-red-200 bg-white hover:bg-red-50 transition-colors"
      >
        {free ? 'Avboka' : 'Begär avbokning'}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
      <p className="text-sm text-[var(--fg)]">
        {free
          ? 'Avbokningen är kostnadsfri enligt lärosätets villkor. Platserna frigörs direkt.'
          : 'Den fria avbokningstiden har gått ut, eller så finns ingen registrerad policy. Vi tar emot en begäran och återkommer. En avgift kan bli aktuell enligt lärosätets villkor.'}
      </p>
      <textarea
        rows={3}
        value={text}
        onChange={e => setText(e.target.value)}
        maxLength={free ? 1000 : 2000}
        placeholder={free ? 'Anledning (valfri)' : 'Berätta kort varför ni vill avboka (valfritt)'}
        className="w-full px-3.5 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-raised)] text-[15px] outline-none focus:border-[var(--accent)] resize-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="px-4 py-2.5 rounded-[10px] text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-colors"
        >
          {busy ? 'Skickar…' : free ? 'Bekräfta avbokning' : 'Skicka begäran'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="px-4 py-2.5 rounded-[10px] text-sm font-medium border border-[var(--border)] bg-white hover:bg-[var(--bg-raised)]"
        >
          Ångra
        </button>
      </div>
    </div>
  );
}

export function BookingsView({
  orgId,
  canEditBilling,
  canBook,
}: {
  orgId: string;
  canEditBilling: boolean;
  canBook: boolean;
}) {
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showBilling, setShowBilling] = useState(false);

  const load = useCallback(() => {
    supabase.rpc('buyer_list_bookings').then(({ data, error: rpcError }) => {
      if (rpcError) setError(rpcError.message);
      else setRows((data ?? []) as BookingRow[]);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl">
        <button
          type="button"
          onClick={() => setShowBilling(v => !v)}
          aria-expanded={showBilling}
          className="w-full flex items-center justify-between gap-4 p-5 text-left"
        >
          <div>
            <p className="text-[15px] font-semibold text-[var(--fg)]">Fakturauppgifter</p>
            <p className="text-xs text-[var(--fg-subtle)] mt-0.5">Används på fakturaunderlaget för era bokningar.</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-[var(--fg-subtle)] transition-transform ${showBilling ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {showBilling && (
          <div className="px-5 pb-5 border-t border-[var(--border-light)] pt-4">
            <BillingDetailsForm orgId={orgId} canEdit={canEditBilling} onSaved={() => setShowBilling(false)} />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-700">Kunde inte hämta bokningar: {error}</p>}
      {!error && rows === null && <p className="text-sm text-[var(--fg-muted)]">Laddar…</p>}

      {rows?.length === 0 && (
        <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl p-6 sm:p-8">
          <p className="text-[15px] font-medium text-[var(--fg)] mb-1">Inga bokningar ännu</p>
          <p className="text-sm text-[var(--fg-muted)] mb-5">
            När ni bokar en kursstart eller accepterar en offert dyker bokningen upp här.
          </p>
          <Link to="/catalog" className="text-sm text-[var(--accent)] hover:underline">
            Utforska utbildningar
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        {rows?.map(b => {
          const open = expanded === b.booking_id;
          const status = BOOKING_STATUS[b.status];
          return (
            <li key={b.booking_id} className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : b.booking_id)}
                aria-expanded={open}
                className="w-full flex items-center gap-4 p-5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-[var(--fg)] truncate">{b.title}</p>
                  <p className="text-xs text-[var(--fg-subtle)] mt-0.5">
                    {b.provider_name} · start {new Date(b.start_date).toLocaleDateString('sv-SE')} · {formatSek(b.total_ex_vat)} exkl. moms
                  </p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}>{status.label}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-[var(--fg-subtle)] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {open && (
                <div className="px-5 pb-5 border-t border-[var(--border-light)] pt-4 space-y-4">
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Row label="Lärosäte" value={b.provider_name} />
                    <Row label="Organisation" value={b.organization_name} />
                    <Row label="Typ" value={b.source === 'custom_quote' ? 'Anpassad utbildning' : 'Öppen kursstart'} />
                    <Row label="Deltagare" value={b.participants} />
                    <Row label="À-pris exkl. moms" value={b.unit_price_ex_vat !== null ? formatSek(b.unit_price_ex_vat) : null} />
                    <Row label="Summa exkl. moms" value={formatSek(b.total_ex_vat)} />
                    <Row label="Momssats" value={`${Math.round(b.vat_rate * 100)} %`} />
                    <Row label="Er referens" value={b.reference} />
                    <Row label="Bokad" value={new Date(b.confirmed_at).toLocaleDateString('sv-SE')} />
                  </dl>
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--fg-subtle)] mb-1">Avbokningsvillkor</p>
                    <p className="text-sm text-[var(--fg-muted)]">{policySummary(b.cancellation_policy)}</p>
                  </div>
                  {canBook && b.status === 'confirmed' && <CancelPanel booking={b} onDone={load} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
