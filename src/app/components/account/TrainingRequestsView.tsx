import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { markRequestSeen } from '../../../hooks/useTrainingRequestUpdates';
import { NOT_SELECTED_REASONS, formatSek, quoteStatusLabel } from '../../../lib/invoiceStatus';
import { policySummary } from '../training/BookingDialog';
import { BillingDetailsForm, fetchBillingDetails, isBillingComplete } from './BillingDetailsForm';

type RequestStatus = 'submitted' | 'in_review' | 'assigned' | 'offers_received' | 'closed' | 'cancelled' | 'no_match';

export interface TrainingRequest {
  id: string;
  title: string;
  description: string;
  learning_goals: string | null;
  target_group: string;
  participant_count: number | null;
  delivery_format: string;
  location: string | null;
  desired_start: string | null;
  budget_range: string | null;
  ssyk_skills: { id: string; title: string }[];
  status: RequestStatus;
  submitted_at: string;
  buyer_org_id: string | null;
  related_training: { title: string; slug: string } | null;
}

export interface RequestEvent {
  id: string;
  request_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface AssignmentRow {
  provider_id: string;
  provider_name: string;
  simple_status: 'waiting' | 'offer_received';
}

interface OfferRow {
  quote_id: string;
  provider_id: string;
  provider_name: string;
  status: string;
  response: string | null;
  responded_at: string;
  offer_total_ex_vat: number | null;
  offer_participants: number | null;
  offer_start_date: string | null;
  offer_end_date: string | null;
  offer_valid_until: string | null;
  offer_location: string | null;
  offer_terms: string | null;
}

interface Detail {
  assignments: AssignmentRow[];
  offers: OfferRow[];
}

export const TRAINING_STATUS: Record<RequestStatus, { label: string; className: string }> = {
  submitted: { label: 'Skickad', className: 'bg-slate-100 text-slate-700' },
  in_review: { label: 'Granskas', className: 'bg-blue-100 text-blue-700' },
  assigned: { label: 'Hos lärosäten', className: 'bg-blue-100 text-blue-700' },
  offers_received: { label: 'Offerter inkomna', className: 'bg-green-100 text-green-700' },
  closed: { label: 'Avslutad', className: 'bg-slate-100 text-slate-700' },
  cancelled: { label: 'Avbruten', className: 'bg-slate-100 text-slate-600' },
  no_match: { label: 'Ingen matchning', className: 'bg-amber-100 text-amber-700' },
};

const FORMAT_LABEL: Record<string, string> = {
  on_site: 'På plats',
  remote: 'Distans',
  hybrid: 'Hybrid',
  flexible: 'Flexibelt',
};

const CANCELLABLE: RequestStatus[] = ['submitted', 'in_review', 'assigned'];

const primaryButton =
  'inline-flex items-center justify-center gap-2 px-5 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white text-sm font-semibold rounded-[10px] transition-colors';

// Buyer-synliga händelser → text i tidslinjen. Avböjanden och återkallade tilldelningar
// loggas aldrig som buyer-synliga, så de kan inte dyka upp här.
function describeEvent(e: RequestEvent): string {
  const p = e.payload ?? {};
  switch (e.event_type) {
    case 'submitted':
      return 'Efterfrågan skickad';
    case 'assigned': {
      const n = Number(p.count ?? 0);
      return n > 0 ? `Skickad till ${n} ${n === 1 ? 'lärosäte' : 'lärosäten'}` : 'Skickad till lärosäten';
    }
    case 'quoted':
      return 'En offert har kommit in';
    case 'quote_accepted':
      return 'Du accepterade en offert';
    case 'status_changed':
      if (p.to === 'in_review') return 'Granskas av oss';
      if (p.to === 'offers_received') return 'Offerter har kommit in';
      return 'Status uppdaterad';
    case 'cancelled':
      return 'Du avbröt efterfrågan';
    case 'closed':
      return 'Efterfrågan avslutad';
    case 'no_match':
      return 'Vi hittade inget lärosäte som matchar just nu';
    default:
      return 'Uppdatering';
  }
}

function eventMessage(e: RequestEvent): string | null {
  const m = e.payload?.message;
  return typeof m === 'string' && m.trim() ? m : null;
}

function formatDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('sv-SE') : null;
}

function OfferCard({
  offer,
  orgId,
  canAccept,
  onAccepted,
}: {
  offer: OfferRow;
  orgId: string | null;
  canAccept: boolean;
  onAccepted: () => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const [billingOk, setBillingOk] = useState<boolean | null>(null);
  const [policy, setPolicy] = useState<{ free_until_days_before_start?: number; late_fee_percent?: number; text?: string } | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [reference, setReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Samma id för samma accept-försök, så att ett dubbelklick ger en bokning.
  const clientBookingId = useRef<string>(crypto.randomUUID());

  const expired = offer.offer_valid_until !== null && new Date(offer.offer_valid_until + 'T23:59:59') < new Date();
  const acceptable =
    canAccept &&
    ['responded', 'negotiating'].includes(offer.status) &&
    offer.offer_total_ex_vat !== null &&
    !expired;

  function setBilling(d: Parameters<typeof isBillingComplete>[0]) {
    setBillingOk(isBillingComplete(d));
  }

  async function openAccept() {
    setAccepting(true);
    if (orgId) fetchBillingDetails(orgId).then(d => setBilling(d));
    const { data } = await supabase
      .from('providers')
      .select('cancellation_policy')
      .eq('id', offer.provider_id)
      .maybeSingle();
    setPolicy((data?.cancellation_policy as typeof policy) ?? null);
  }

  async function accept() {
    setBusy(true);
    const { error: rpcError } = await supabase.rpc('buyer_accept_quote', {
      p_quote_id: offer.quote_id,
      p_client_booking_id: clientBookingId.current,
      p_reason_code: reasonCode || null,
      p_reason_text: reasonText.trim() || null,
      p_reference: reference.trim() || null,
      p_cancellation_accepted: confirmed,
    });
    setBusy(false);
    if (rpcError) {
      toast.error('Kunde inte acceptera offerten', { description: rpcError.message });
      return;
    }
    toast.success('Offerten är accepterad', { description: 'Ett fakturaunderlag har skapats. Fakturan kommer från oss.' });
    onAccepted();
  }

  return (
    <li className="rounded-xl bg-[var(--accent-dim)] p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-sm font-semibold text-[var(--fg)]">{offer.provider_name}</p>
        <span className="text-xs text-[var(--fg-muted)]">{quoteStatusLabel(offer.status)}</span>
      </div>

      {offer.offer_total_ex_vat !== null && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-3">
          <DetailRow label="Pris exkl. moms" value={formatSek(offer.offer_total_ex_vat)} />
          <DetailRow label="Deltagare" value={offer.offer_participants} />
          <DetailRow label="Start" value={formatDate(offer.offer_start_date)} />
          <DetailRow label="Slut" value={formatDate(offer.offer_end_date)} />
          <DetailRow label="Ort" value={offer.offer_location} />
          <DetailRow label="Offerten gäller till" value={formatDate(offer.offer_valid_until)} />
        </dl>
      )}
      {offer.offer_terms && (
        <p className="text-sm text-[var(--fg-muted)] leading-relaxed whitespace-pre-line mb-2">{offer.offer_terms}</p>
      )}
      {offer.response && <p className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-line">{offer.response}</p>}
      <p className="text-xs text-[var(--fg-subtle)] mt-2">
        {new Date(offer.responded_at).toLocaleDateString('sv-SE')}
        {expired && ' · Offerten har gått ut'}
      </p>

      {acceptable && !accepting && (
        <button type="button" onClick={openAccept} className={`${primaryButton} mt-3`}>
          Acceptera offert
        </button>
      )}

      {accepting && (
        <div className="mt-4 space-y-4 bg-white rounded-xl border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--fg)]">
            Du accepterar {offer.provider_name}s offert på {formatSek(offer.offer_total_ex_vat)} exkl. moms. Övriga
            lärosäten får besked om att ni har valt en annan offert.
          </p>
          <div>
            <label className="block text-xs text-[var(--fg-subtle)] mb-1" htmlFor={`ref-${offer.quote_id}`}>
              Er referens (valfri, hamnar på fakturan)
            </label>
            <input
              id={`ref-${offer.quote_id}`}
              value={reference}
              onChange={e => setReference(e.target.value)}
              maxLength={120}
              className="w-full px-3.5 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-raised)] text-[15px] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--fg-subtle)] mb-1" htmlFor={`why-${offer.quote_id}`}>
              Varför valde ni den här offerten? (valfritt, delas med de lärosäten som inte valdes)
            </label>
            <select
              id={`why-${offer.quote_id}`}
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-raised)] text-[15px] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Ange ingen anledning</option>
              {NOT_SELECTED_REASONS.map(r => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            {reasonCode && (
              <textarea
                rows={2}
                value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                maxLength={1000}
                placeholder="Kommentar (valfri)"
                className="mt-2 w-full px-3.5 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-raised)] text-[15px] outline-none focus:border-[var(--accent)] resize-none"
              />
            )}
          </div>
          {billingOk === false && orgId && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-3 space-y-3">
              <p className="text-sm text-[var(--fg)]">Fakturauppgifter saknas. Fyll i dem så att vi kan skapa fakturaunderlaget.</p>
              <BillingDetailsForm
                orgId={orgId}
                canEdit
                onSaved={d => setBilling(d)}
              />
            </div>
          )}
          <div className="rounded-lg bg-[var(--bg-raised)] p-3">
            <p className="text-xs font-medium text-[var(--fg)] mb-1">Avbokningsvillkor</p>
            <p className="text-sm text-[var(--fg-muted)]">{policySummary(policy)}</p>
          </div>
          <label className="flex items-start gap-2 text-sm text-[var(--fg)]">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />
            Jag har läst avbokningsvillkoren och accepterar dem.
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={accept} disabled={busy || !confirmed || billingOk !== true} className={primaryButton}>
              {busy ? 'Accepterar…' : 'Bekräfta och acceptera'}
            </button>
            <button
              type="button"
              onClick={() => setAccepting(false)}
              disabled={busy}
              className="px-4 py-2.5 rounded-[10px] text-sm font-medium border border-[var(--border)] bg-white hover:bg-[var(--bg-raised)]"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-xs text-[var(--fg-subtle)]">{label}</dt>
      <dd className="text-sm text-[var(--fg)]">{value}</dd>
    </div>
  );
}

export function TrainingRequestItem({
  request: r,
  events: evs,
  unread: isUnread,
  open,
  onToggle,
  onChanged,
  typeLabel,
}: {
  request: TrainingRequest;
  events: RequestEvent[];
  unread: boolean;
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void> | void;
  typeLabel?: string;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const status = TRAINING_STATUS[r.status] ?? TRAINING_STATUS.submitted;
  const offerCount = evs.filter(e => e.event_type === 'quoted').length;

  const loadDetail = useCallback(async () => {
    const [a, o] = await Promise.all([
      supabase.rpc('buyer_request_assignments', { p_request_id: r.id }),
      supabase.rpc('buyer_request_offers', { p_request_id: r.id }),
    ]);
    if (a.error || o.error) {
      toast.error('Kunde inte hämta detaljer', { description: (a.error ?? o.error)?.message });
      return;
    }
    setDetail({ assignments: (a.data ?? []) as AssignmentRow[], offers: (o.data ?? []) as OfferRow[] });
  }, [r.id]);

  useEffect(() => {
    if (open) loadDetail();
  }, [open, loadDetail]);

  async function cancel() {
    if (!window.confirm('Vill du avbryta efterfrågan? Lärosäten som fått den får inte längre läsa den.')) return;
    setCancelling(true);
    const { error: rpcError } = await supabase.rpc('cancel_training_request', { p_request_id: r.id });
    setCancelling(false);
    if (rpcError) {
      toast.error('Kunde inte avbryta efterfrågan', { description: rpcError.message });
      return;
    }
    toast.success('Efterfrågan är avbruten');
    // Den egna avbrytshändelsen ska inte räknas som "nytt".
    const { data: last } = await supabase
      .from('training_request_events')
      .select('created_at')
      .eq('request_id', r.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.created_at) markRequestSeen(r.id, last.created_at);
    await onChanged();
    loadDetail();
  }

  return (
      <li className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="w-full flex items-center gap-4 p-5 text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[var(--fg)] truncate">
              {r.title}
              {isUnread && (
                <span className="ml-2 inline-block align-middle px-2 py-0.5 rounded-full bg-green-600 text-white text-[11px] font-medium">
                  Nytt
                </span>
              )}
            </p>
            <p className="text-xs text-[var(--fg-subtle)] mt-0.5">
              {typeLabel && `${typeLabel} · `}
              Skickad {new Date(r.submitted_at).toLocaleDateString('sv-SE')}
              {' · '}
              {offerCount} {offerCount === 1 ? 'offert' : 'offerter'}
            </p>
          </div>
          <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}>{status.label}</span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-[var(--fg-subtle)] transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div className="px-5 pb-5 border-t border-[var(--border-light)] pt-4 space-y-6">
            <div>
              <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--fg-subtle)] mb-1">Ert behov</p>
              <p className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-line">{r.description}</p>
              {r.related_training && (
                <Link
                  to={`/kurs/${r.related_training.slug}`}
                  className="inline-block mt-2 text-sm text-[var(--accent)] hover:underline"
                >
                  Gäller kursen {r.related_training.title}
                </Link>
              )}
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DetailRow label="Mål" value={r.learning_goals} />
              <DetailRow label="Målgrupp" value={r.target_group} />
              <DetailRow label="Deltagare" value={r.participant_count} />
              <DetailRow label="Genomförande" value={FORMAT_LABEL[r.delivery_format] ?? r.delivery_format} />
              <DetailRow label="Ort" value={r.location} />
              <DetailRow label="Önskad period" value={r.desired_start} />
              <DetailRow label="Budgetram" value={r.budget_range} />
              <DetailRow label="Kompetensområden" value={r.ssyk_skills?.map(s => s.title).join(', ')} />
            </dl>

            <div>
              <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--fg-subtle)] mb-3">Förlopp</p>
              <ol className="space-y-3 border-l border-[var(--border)] ml-1.5">
                {evs.map(e => (
                  <li key={e.id} className="pl-4 relative">
                    <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                    <p className="text-sm text-[var(--fg)]">{describeEvent(e)}</p>
                    {eventMessage(e) && <p className="text-sm text-[var(--fg-muted)] mt-0.5">{eventMessage(e)}</p>}
                    <p className="text-xs text-[var(--fg-subtle)]">
                      {new Date(e.created_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </li>
                ))}
              </ol>
            </div>

            {detail && detail.assignments.length > 0 && (
              <div>
                <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--fg-subtle)] mb-2">Lärosäten</p>
                <ul className="space-y-1.5">
                  {detail.assignments.map(a => (
                    <li key={a.provider_id} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--fg)]">{a.provider_name}</span>
                      <span className={a.simple_status === 'offer_received' ? 'text-green-700 font-medium' : 'text-[var(--fg-muted)]'}>
                        {a.simple_status === 'offer_received' ? 'Offert inkommen' : 'Väntar'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail && detail.offers.length > 0 && (
              <div>
                <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--fg-subtle)] mb-2">Offerter</p>
                <ul className="space-y-3">
                  {detail.offers.map(o => (
                    <OfferCard
                      key={o.quote_id}
                      offer={o}
                      orgId={r.buyer_org_id}
                      canAccept={r.status === 'offers_received'}
                      onAccepted={async () => {
                        await onChanged();
                        loadDetail();
                      }}
                    />
                  ))}
                </ul>
              </div>
            )}

            {CANCELLABLE.includes(r.status) && (
              <button
                type="button"
                onClick={cancel}
                disabled={cancelling}
                className="px-4 py-2.5 rounded-[10px] text-sm font-medium text-red-700 border border-red-200 bg-white hover:bg-red-50 disabled:opacity-60 transition-colors"
              >
                {cancelling ? 'Avbryter…' : 'Avbryt efterfrågan'}
              </button>
            )}
          </div>
        )}
      </li>
  );
}
