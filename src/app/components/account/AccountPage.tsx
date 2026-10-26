import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, ChevronDown, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { useTrainingRequestUpdates } from '../../../hooks/useTrainingRequestUpdates';
import { TrainingRequestsView } from './TrainingRequestsView';
import { BookingsView } from './BookingsView';
import { InvoicesView } from './InvoicesView';
import { useInvoiceUnreadCount } from '../../../hooks/useInvoiceUpdates';

interface Membership {
  display_name: string;
  access_role: string;
  organizations: { id: string; name: string; organization_number: string | null };
}

interface AccountRequest {
  id: string;
  course_topic: string;
  description: string;
  status: 'new' | 'responded' | 'negotiating' | 'accepted' | 'declined' | 'not_selected';
  budget: string | null;
  timeline: string;
  participants_count: string;
  response: string | null;
  submitted_at: string;
  trainings: { title: string; slug: string } | null;
}

const STATUS: Record<AccountRequest['status'], { label: string; className: string }> = {
  new: { label: 'Skickad', className: 'bg-slate-100 text-slate-700' },
  responded: { label: 'Besvarad', className: 'bg-green-100 text-green-700' },
  negotiating: { label: 'Dialog pågår', className: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepterad', className: 'bg-green-100 text-green-700' },
  declined: { label: 'Avböjd', className: 'bg-red-100 text-red-700' },
  not_selected: { label: 'Ej vald', className: 'bg-slate-100 text-slate-600' },
};

const inputClass =
  'w-full px-3.5 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--fg)] text-[15px] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-dim)] placeholder:text-[var(--fg-subtle)]';
const primaryButton =
  'inline-flex items-center justify-center gap-2 px-5 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white text-sm font-semibold rounded-[10px] transition-colors';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ub-theme px-5 py-[clamp(32px,6vw,64px)] min-h-[60vh]">
      <div className="max-w-[860px] mx-auto">{children}</div>
    </div>
  );
}

function Card({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div
      className={`bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 ${
        narrow ? 'max-w-[460px] mx-auto' : ''
      }`}
    >
      {children}
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/konto` },
    });
    setSending(false);
    if (error) {
      toast.error('Kunde inte skicka inloggningslänk', { description: error.message });
      return;
    }
    setSent(true);
  }

  return (
    <Shell>
      <Card narrow>
        <div className="w-11 h-11 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center mb-5">
          <Mail className="w-5 h-5" aria-hidden="true" />
        </div>
        {sent ? (
          <>
            <h1 className="text-xl font-bold text-[var(--fg)] mb-2">Kolla din e-post</h1>
            <p className="text-sm text-[var(--fg-muted)] leading-relaxed">
              Vi har skickat en inloggningslänk till <strong>{email}</strong>. Länken fungerar en gång och
              tar dig direkt till Mitt konto.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-5 text-sm text-[var(--accent)] hover:underline"
            >
              Använd en annan e-postadress
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 className="text-xl font-bold text-[var(--fg)] mb-2">Mitt konto</h1>
            <p className="text-sm text-[var(--fg-muted)] leading-relaxed mb-6">
              Följ era förfrågningar till lärosäten. Ange er arbetsmejl så skickar vi en inloggningslänk —
              inget lösenord behövs.
            </p>
            <label htmlFor="account-email" className="block text-[13px] font-medium text-[var(--fg)] mb-1.5">
              E-postadress
            </label>
            <input
              id="account-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="namn@organisation.se"
              className={`${inputClass} mb-4`}
            />
            <button type="submit" disabled={sending} className={`${primaryButton} w-full`}>
              {sending ? 'Skickar…' : 'Skicka inloggningslänk'}
            </button>
            <p className="mt-4 text-xs text-[var(--fg-subtle)]">
              Leverantör eller administratör?{' '}
              <Link to="/login" className="text-[var(--accent)] hover:underline">
                Logga in här
              </Link>
            </p>
          </form>
        )}
      </Card>
    </Shell>
  );
}

function OnboardingForm({ onDone }: { onDone: () => void }) {
  const [orgName, setOrgName] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.rpc('create_my_organization', {
      p_name: orgName,
      p_organization_number: orgNumber,
      p_display_name: displayName,
    });
    setSaving(false);
    if (error) {
      toast.error('Kunde inte skapa kontot', { description: error.message });
      return;
    }
    toast.success('Välkommen! Tidigare förfrågningar från er e-postadress har kopplats till kontot.');
    onDone();
  }

  return (
    <Shell>
      <Card narrow>
        <h1 className="text-xl font-bold text-[var(--fg)] mb-2">Berätta vem ni är</h1>
        <p className="text-sm text-[var(--fg-muted)] leading-relaxed mb-6">
          Det här visas i er portal. Förfrågningar ni tidigare skickat med den här e-postadressen kopplas
          automatiskt till organisationen.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="org-name" className="block text-[13px] font-medium text-[var(--fg)] mb-1.5">
              Organisation
            </label>
            <input
              id="org-name"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="T.ex. Region Exempel"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="org-number" className="block text-[13px] font-medium text-[var(--fg)] mb-1.5">
              Organisationsnummer <span className="text-[var(--fg-subtle)] font-normal">(valfritt)</span>
            </label>
            <input
              id="org-number"
              value={orgNumber}
              onChange={(e) => setOrgNumber(e.target.value)}
              placeholder="556000-0000"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="display-name" className="block text-[13px] font-medium text-[var(--fg)] mb-1.5">
              Ditt namn
            </label>
            <input
              id="display-name"
              required
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={saving} className={`${primaryButton} w-full`}>
            {saving ? 'Skapar…' : 'Fortsätt'}
          </button>
        </form>
      </Card>
    </Shell>
  );
}

function RequestsView({ membership, onSignOut }: { membership: Membership; onSignOut: () => void }) {
  const [requests, setRequests] = useState<AccountRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: 'rfp' | 'training' | 'bookings' | 'invoices' =
    tabParam === 'efterfragningar' ? 'training' : tabParam === 'bokningar' ? 'bookings' : tabParam === 'fakturor' ? 'invoices' : 'rfp';
  const unreadInvoices = useInvoiceUnreadCount('buyer');
  const { unreadCount } = useTrainingRequestUpdates();
  const selectTab = (next: 'rfp' | 'training' | 'bookings' | 'invoices') =>
    setSearchParams(
      next === 'training'
        ? { tab: 'efterfragningar' }
        : next === 'bookings'
          ? { tab: 'bokningar' }
          : next === 'invoices'
            ? { tab: 'fakturor' }
            : {},
      { replace: true }
    );

  useEffect(() => {
    let active = true;
    supabase
      .from('custom_requests')
      .select(
        'id, course_topic, description, status, budget, timeline, participants_count, response, submitted_at, trainings(title, slug)'
      )
      .order('submitted_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setRequests((data ?? []) as unknown as AccountRequest[]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[var(--fg-subtle)] mb-1">
            Mitt konto
          </p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[var(--fg)]">
            {membership.organizations.name}
          </h1>
          <p className="text-sm text-[var(--fg-muted)] mt-1">Inloggad som {membership.display_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/request" className={primaryButton}>
            Ny förfrågan <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="px-4 py-3 rounded-[10px] text-sm font-medium text-[var(--fg-muted)] border border-[var(--border)] bg-[var(--bg-raised)] hover:border-[var(--fg-muted)] transition-colors"
          >
            Logga ut
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] mb-5" role="tablist">
        <div className="flex gap-1">
          {([
            ['rfp', 'Förfrågningar'],
            ['training', 'Mina efterfrågningar'],
            ['bookings', 'Bokningar'],
            ['invoices', 'Fakturor'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => selectTab(key)}
              className={`px-4 py-2.5 text-sm -mb-px border-b-2 transition-colors ${
                tab === key
                  ? 'border-[var(--accent)] text-[var(--fg)] font-semibold'
                  : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {label}
              {key === 'invoices' && unreadInvoices > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-green-600 text-white text-[11px] font-medium">
                  {unreadInvoices}
                </span>
              )}
              {key === 'training' && unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-green-600 text-white text-[11px] font-medium">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
        {tab === 'training' && (
          <Link to="/efterfraga" className="text-sm text-[var(--accent)] hover:underline whitespace-nowrap">
            Efterfråga anpassad utbildning
          </Link>
        )}
      </div>

      {tab === 'training' && <TrainingRequestsView />}

      {tab === 'invoices' && <InvoicesView />}

      {tab === 'bookings' && (
        <BookingsView
          orgId={membership.organizations.id}
          canEditBilling={['owner', 'admin'].includes(membership.access_role)}
          canBook={['owner', 'admin', 'buyer'].includes(membership.access_role)}
        />
      )}

      {tab === 'rfp' && (
        <>
      <h2 className="text-[15px] font-semibold text-[var(--fg)] mb-3">Förfrågningar</h2>

      {error && (
        <Card>
          <p className="text-sm text-red-700">Kunde inte hämta förfrågningar: {error}</p>
        </Card>
      )}

      {!error && requests === null && <p className="text-sm text-[var(--fg-muted)]">Laddar…</p>}

      {requests?.length === 0 && (
        <Card>
          <p className="text-[15px] font-medium text-[var(--fg)] mb-1">Inga förfrågningar ännu</p>
          <p className="text-sm text-[var(--fg-muted)] mb-5">
            När ni skickar en förfrågan till lärosäten dyker den upp här med status och svar.
          </p>
          <Link to="/request" className={primaryButton}>
            Beskriv ert behov <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </Card>
      )}

      <ul className="space-y-3">
        {requests?.map((r) => {
          const open = expanded === r.id;
          const status = STATUS[r.status] ?? STATUS.new;
          return (
            <li key={r.id} className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : r.id)}
                aria-expanded={open}
                className="w-full flex items-center gap-4 p-5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-[var(--fg)] truncate">
                    {r.trainings?.title ?? r.course_topic}
                  </p>
                  <p className="text-xs text-[var(--fg-subtle)] mt-0.5">
                    Skickad {new Date(r.submitted_at).toLocaleDateString('sv-SE')}
                  </p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}>
                  {status.label}
                </span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 text-[var(--fg-subtle)] transition-transform ${open ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {open && (
                <div className="px-5 pb-5 border-t border-[var(--border-light)] pt-4 space-y-4">
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--fg-subtle)] mb-1">
                      Ert behov
                    </p>
                    <p className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-line">{r.description}</p>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    {r.timeline && (
                      <div>
                        <dt className="text-xs text-[var(--fg-subtle)]">Tidplan</dt>
                        <dd className="text-[var(--fg)]">{r.timeline}</dd>
                      </div>
                    )}
                    {r.budget && (
                      <div>
                        <dt className="text-xs text-[var(--fg-subtle)]">Budget</dt>
                        <dd className="text-[var(--fg)]">{r.budget}</dd>
                      </div>
                    )}
                    {r.participants_count && (
                      <div>
                        <dt className="text-xs text-[var(--fg-subtle)]">Deltagare</dt>
                        <dd className="text-[var(--fg)]">{r.participants_count}</dd>
                      </div>
                    )}
                  </dl>
                  {r.response && (
                    <div className="rounded-xl bg-[var(--accent-dim)] p-4">
                      <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--accent)] mb-1">
                        Svar från leverantör
                      </p>
                      <p className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-line">{r.response}</p>
                    </div>
                  )}
                  {r.trainings && (
                    <Link
                      to={`/kurs/${r.trainings.slug}`}
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
                    >
                      Visa kursen <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
        </>
      )}
    </Shell>
  );
}

export function AccountPage() {
  const { user, profile, loading, signOut } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);

  const loadMembership = useCallback(async () => {
    if (!user) {
      setMembership(null);
      setMembershipLoading(false);
      return;
    }
    setMembershipLoading(true);
    const { data, error } = await supabase
      .from('organization_members')
      .select('display_name, access_role, organizations(id, name, organization_number)')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) toast.error('Kunde inte hämta ditt konto', { description: error.message });
    setMembership((data as unknown as Membership | null) ?? null);
    setMembershipLoading(false);
  }, [user]);

  useEffect(() => {
    loadMembership();
  }, [loadMembership]);

  useEffect(() => {
    document.title = 'Mitt konto – Uppdragsutbildning.nu';
  }, []);

  if (loading || (user && membershipLoading)) {
    return (
      <Shell>
        <p className="text-sm text-[var(--fg-muted)] text-center">Laddar…</p>
      </Shell>
    );
  }

  if (!user) return <SignInForm />;

  // Leverantörer och administratörer har egna portaler; Mitt konto är för köpare.
  if (profile) {
    return (
      <Shell>
        <Card narrow>
          <h1 className="text-xl font-bold text-[var(--fg)] mb-2">Du är inloggad som {profile.role === 'admin' ? 'administratör' : 'leverantör'}</h1>
          <p className="text-sm text-[var(--fg-muted)] leading-relaxed mb-5">
            Mitt konto är till för organisationer som köper utbildning. Logga ut om du vill logga in som köpare.
          </p>
          <button type="button" onClick={() => signOut()} className={primaryButton}>
            Logga ut
          </button>
        </Card>
      </Shell>
    );
  }

  if (!membership) return <OnboardingForm onDone={loadMembership} />;

  return <RequestsView membership={membership} onSignOut={() => signOut()} />;
}
