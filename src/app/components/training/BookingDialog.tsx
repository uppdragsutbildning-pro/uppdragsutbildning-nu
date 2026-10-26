import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { formatSek } from '../../../lib/invoiceStatus';
import type { AdaptedCourseStart } from '../../../lib/marketplaceAdapters';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  BillingDetailsForm,
  fetchBillingDetails,
  isBillingComplete,
  type BillingDetails,
} from '../account/BillingDetailsForm';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  start: AdaptedCourseStart;
  trainingTitle: string;
  providerId: string;
  providerName: string;
  marketplaceId?: string | null;
}

interface OrgOption {
  id: string;
  name: string;
  access_role: string;
}

interface CancellationPolicy {
  free_until_days_before_start?: number;
  late_fee_percent?: number;
  text?: string;
}

export function policySummary(policy: CancellationPolicy | null): string {
  if (!policy || (policy.free_until_days_before_start === undefined && !policy.text)) {
    return 'Lärosätet har inte registrerat några avbokningsvillkor. Avbokning sker efter begäran till oss.';
  }
  const parts: string[] = [];
  if (policy.free_until_days_before_start !== undefined) {
    parts.push(`Fri avbokning till ${policy.free_until_days_before_start} dagar före start.`);
    if (policy.late_fee_percent !== undefined) parts.push(`Därefter avgift på ${policy.late_fee_percent} % av priset.`);
  }
  if (policy.text) parts.push(policy.text);
  return parts.join(' ');
}

const input =
  'mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function BookingDialog({ open, onOpenChange, start, trainingTitle, providerId, providerName, marketplaceId }: Props) {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgOption[] | null>(null);
  const [orgId, setOrgId] = useState('');
  const [billing, setBilling] = useState<BillingDetails | null | undefined>(undefined);
  const [policy, setPolicy] = useState<CancellationPolicy | null>(null);
  const [participants, setParticipants] = useState(1);
  const [reference, setReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Ett id per bokningsförsök: dubbelklick ger en bokning, inte två.
  const clientBookingId = useRef<string>(crypto.randomUUID());

  const startDate = new Date(start.startDate).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  const unitPrice = Math.round(start.price * 100) / 100;
  const total = Math.round(unitPrice * participants * 100) / 100;
  const org = orgs?.find(o => o.id === orgId);
  const canBook = !!org && ['owner', 'admin', 'buyer'].includes(org.access_role);

  useEffect(() => {
    if (!open || !user || profile) return;
    let active = true;
    supabase
      .from('organization_members')
      .select('access_role, organizations(id, name)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!active) return;
        const list = ((data ?? []) as unknown as { access_role: string; organizations: { id: string; name: string } }[]).map(m => ({
          id: m.organizations.id,
          name: m.organizations.name,
          access_role: m.access_role,
        }));
        setOrgs(list);
        if (list.length > 0) setOrgId(prev => prev || list[0].id);
      });
    supabase
      .from('providers')
      .select('cancellation_policy')
      .eq('id', providerId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setPolicy((data?.cancellation_policy as CancellationPolicy | null) ?? null);
      });
    return () => {
      active = false;
    };
  }, [open, user, profile, providerId]);

  useEffect(() => {
    if (!orgId) return;
    setBilling(undefined);
    fetchBillingDetails(orgId).then(setBilling);
  }, [orgId]);

  async function book(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc('buyer_book_scheduled_start', {
      p_org_id: orgId,
      p_scheduled_start_id: start.id,
      p_client_booking_id: clientBookingId.current,
      p_participants: participants,
      p_reference: reference.trim() || null,
      p_cancellation_accepted: confirmed,
      p_marketplace_id: marketplaceId ?? null,
    });
    setBusy(false);
    if (error) {
      toast.error('Kunde inte genomföra bokningen', { description: error.message });
      return;
    }
    toast.success('Bokningen är bekräftad', { description: 'Fakturan skickas från oss. Du hittar bokningen under Mitt konto.' });
    onOpenChange(false);
    navigate('/konto?tab=bokningar');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Boka {trainingTitle}</DialogTitle>
          <DialogDescription>
            Start {startDate} · {providerName}
          </DialogDescription>
        </DialogHeader>

        {authLoading ? (
          <p className="text-sm text-slate-500">Laddar…</p>
        ) : !user ? (
          <SignInStep startId={start.id} />
        ) : profile ? (
          <p className="text-sm text-slate-600">
            Du är inloggad som {profile.role === 'admin' ? 'administratör' : 'leverantör'}. Bokningar görs av köpande
            organisationer. Logga ut och logga in med en arbetsmejl för att boka.
          </p>
        ) : orgs === null ? (
          <p className="text-sm text-slate-500">Laddar…</p>
        ) : orgs.length === 0 ? (
          <div className="space-y-3 text-sm text-slate-700">
            <p>För att boka behöver ni ett organisationskonto.</p>
            <Link to="/konto" className="inline-block px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">
              Skapa organisationskonto
            </Link>
          </div>
        ) : (
          <form onSubmit={book} className="space-y-4">
            {orgs.length > 1 && (
              <label className="block text-sm text-slate-700">
                Organisation
                <select value={orgId} onChange={e => setOrgId(e.target.value)} className={input}>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
            )}
            {orgs.length === 1 && <p className="text-sm text-slate-600">Bokas för <strong>{org?.name}</strong></p>}

            {!canBook ? (
              <p className="text-sm text-amber-700">
                Din roll i organisationen tillåter inte bokning. Be en ägare, administratör eller inköpare boka.
              </p>
            ) : billing === undefined ? (
              <p className="text-sm text-slate-500">Laddar…</p>
            ) : !isBillingComplete(billing) ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-sm text-slate-700">
                  Fakturauppgifter saknas. Fyll i dem så att vi kan skapa fakturaunderlaget.
                </p>
                <BillingDetailsForm
                  orgId={orgId}
                  canEdit={['owner', 'admin'].includes(org!.access_role)}
                  onSaved={setBilling}
                />
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="text-sm text-slate-700">
                    Antal deltagare
                    <input
                      type="number"
                      min={1}
                      max={Math.max(start.availableSpots, 1)}
                      value={participants}
                      onChange={e => setParticipants(Math.max(1, Number(e.target.value) || 1))}
                      className={input}
                    />
                    <span className="text-xs text-slate-500">{start.availableSpots} lediga platser</span>
                  </label>
                  <label className="text-sm text-slate-700">
                    Er referens (valfri)
                    <input value={reference} onChange={e => setReference(e.target.value)} maxLength={120} className={input} />
                  </label>
                </div>

                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 space-y-1">
                  <div className="flex justify-between"><span>À-pris per deltagare</span><span>{formatSek(unitPrice)}</span></div>
                  <div className="flex justify-between font-semibold text-slate-900"><span>Summa exkl. moms</span><span>{formatSek(total)}</span></div>
                  <p className="text-xs text-slate-500">Moms tillkommer. Fakturan skickas från oss, inte från lärosätet.</p>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-900 mb-1">Avbokningsvillkor</p>
                  <p className="text-sm text-slate-600">{policySummary(policy)}</p>
                </div>

                <label className="flex items-start gap-2 text-sm text-slate-800">
                  <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />
                  Jag har läst avbokningsvillkoren och accepterar dem.
                </label>

                <button
                  type="submit"
                  disabled={busy || !confirmed || participants > start.availableSpots}
                  className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-lg transition-colors"
                >
                  {busy ? 'Bokar…' : 'Bekräfta bokning'}
                </button>
              </>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SignInStep({ startId }: { startId: string }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    // Tillbaka till samma kurssida (med ?via= kvar) och öppna bokningen igen.
    const url = new URL(window.location.href);
    url.searchParams.set('book', startId);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: url.toString() },
    });
    setSending(false);
    if (error) {
      toast.error('Kunde inte skicka inloggningslänk', { description: error.message });
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p className="text-sm text-slate-700">
        Vi har skickat en inloggningslänk till <strong>{email}</strong>. När du har loggat in kommer du tillbaka hit och
        kan slutföra bokningen.
      </p>
    );
  }
  return (
    <form onSubmit={send} className="space-y-3">
      <p className="text-sm text-slate-700">Logga in med din arbetsmejl för att boka. Inget lösenord behövs.</p>
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="namn@organisation.se"
        className={input}
      />
      <button
        type="submit"
        disabled={sending}
        className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg"
      >
        {sending ? 'Skickar…' : 'Skicka inloggningslänk'}
      </button>
    </form>
  );
}
