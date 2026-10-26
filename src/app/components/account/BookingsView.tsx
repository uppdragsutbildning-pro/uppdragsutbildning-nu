import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown } from 'lucide-react';
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

export function BookingsView({ orgId, canEditBilling }: { orgId: string; canEditBilling: boolean }) {
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showBilling, setShowBilling] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.rpc('buyer_list_bookings').then(({ data, error: rpcError }) => {
      if (!active) return;
      if (rpcError) setError(rpcError.message);
      else setRows((data ?? []) as BookingRow[]);
    });
    return () => {
      active = false;
    };
  }, []);

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
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
