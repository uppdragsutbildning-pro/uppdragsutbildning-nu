import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { useTrainingRequestUpdates } from '../../../hooks/useTrainingRequestUpdates';
import { CasesView } from './CasesView';
import { BookingsView } from './BookingsView';
import { InvoicesView } from './InvoicesView';
import { useInvoiceUnreadCount } from '../../../hooks/useInvoiceUpdates';
import { normalizeOrganizationNumber, organizationNumberError } from '../../../lib/organizationNumber';

interface Membership {
  display_name: string;
  access_role: string;
  organizations: { id: string; name: string; organization_number: string | null };
}

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
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Samma anrop för nya och befintliga användare. Mejlet innehåller både en kod och en länk.
  async function sendCode() {
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/konto` },
    });
    setSending(false);
    if (error) {
      toast.error('Kunde inte skicka koden', { description: error.message });
      return false;
    }
    setCooldown(60);
    return true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (await sendCode()) setSent(true);
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setVerifying(false);
    // Vid lyckad kontroll får AuthContext en ny session och sidan byter vy av sig själv.
    if (error) setCodeError('Koden stämmer inte eller har gått ut. Kontrollera koden eller skicka en ny.');
  }

  async function handleResend() {
    setCode('');
    setCodeError(null);
    if (await sendCode()) toast.success('Vi har skickat en ny kod');
  }

  function changeEmail() {
    setSent(false);
    setCode('');
    setCodeError(null);
  }

  return (
    <Shell>
      <Card narrow>
        <div className="w-11 h-11 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center mb-5">
          <Mail className="w-5 h-5" aria-hidden="true" />
        </div>
        {sent ? (
          <form onSubmit={handleVerify}>
            <h1 className="text-xl font-bold text-[var(--fg)] mb-2">Ange koden från mejlet</h1>
            <p className="text-sm text-[var(--fg-muted)] leading-relaxed mb-6">
              Vi har skickat en kod till <strong>{email}</strong>. Skriv in den här, eller klicka på länken i mejlet.
            </p>
            <label htmlFor="account-code" className="block text-[13px] font-medium text-[var(--fg)] mb-1.5">
              Kod
            </label>
            <input
              id="account-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              pattern="[0-9]{6,10}"
              maxLength={10}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? 'account-code-error' : undefined}
              className={`${inputClass} mb-2 tracking-[0.3em] text-lg`}
            />
            {codeError && (
              <p id="account-code-error" role="alert" className="text-sm text-red-700 mb-3">
                {codeError}
              </p>
            )}
            <button type="submit" disabled={verifying || code.length < 6} className={`${primaryButton} w-full mt-2`}>
              {verifying ? 'Kontrollerar…' : 'Logga in'}
            </button>
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={handleResend}
                disabled={sending || cooldown > 0}
                className="text-[var(--accent)] hover:underline disabled:opacity-60 disabled:no-underline"
              >
                {cooldown > 0 ? `Skicka ny kod (${cooldown} s)` : 'Skicka ny kod'}
              </button>
              <button type="button" onClick={changeEmail} className="text-[var(--fg-muted)] hover:underline">
                Annan e-postadress
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 className="text-xl font-bold text-[var(--fg)] mb-2">Mitt konto</h1>
            <p className="text-sm text-[var(--fg-muted)] leading-relaxed mb-6">
              Följ era förfrågningar till lärosäten. Ange er arbetsmejl så skickar vi en engångskod — inget
              lösenord behövs, och nytt konto skapas automatiskt.
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
              {sending ? 'Skickar…' : 'Skicka kod'}
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

  const [orgNumberError, setOrgNumberError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const normalizedOrgNumber = normalizeOrganizationNumber(orgNumber);
    if (!normalizedOrgNumber) {
      setOrgNumberError(organizationNumberError(orgNumber));
      return;
    }
    setOrgNumberError(null);
    setSaving(true);
    const { error } = await supabase.rpc('create_my_organization', {
      p_name: orgName,
      p_organization_number: normalizedOrgNumber,
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
              Organisationsnummer
            </label>
            <input
              id="org-number"
              required
              inputMode="numeric"
              value={orgNumber}
              onChange={(e) => setOrgNumber(e.target.value)}
              placeholder="556000-0000"
              aria-invalid={orgNumberError ? true : undefined}
              aria-describedby={orgNumberError ? 'org-number-error' : undefined}
              className={inputClass}
            />
            {orgNumberError && (
              <p id="org-number-error" role="alert" className="text-sm text-red-700 mt-1.5">
                {orgNumberError}
              </p>
            )}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  // "efterfragningar" är den gamla flik-parametern (länkar i tidigare mejl) och ger samma vy.
  const tab: 'cases' | 'bookings' | 'invoices' =
    tabParam === 'bokningar' ? 'bookings' : tabParam === 'fakturor' ? 'invoices' : 'cases';
  const unreadInvoices = useInvoiceUnreadCount('buyer');
  const { unreadCount } = useTrainingRequestUpdates();
  const selectTab = (next: 'cases' | 'bookings' | 'invoices') =>
    setSearchParams(
      next === 'bookings' ? { tab: 'bokningar' } : next === 'invoices' ? { tab: 'fakturor' } : { tab: 'arenden' },
      { replace: true }
    );

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
          <Link to="/efterfraga" className={primaryButton}>
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
            ['cases', 'Mina ärenden'],
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
              {key === 'cases' && unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-green-600 text-white text-[11px] font-medium">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
        {tab === 'cases' && (
          <Link to="/efterfraga" className="text-sm text-[var(--accent)] hover:underline whitespace-nowrap">
            Efterfråga anpassad utbildning
          </Link>
        )}
      </div>

      {tab === 'invoices' && <InvoicesView />}

      {tab === 'bookings' && (
        <BookingsView
          orgId={membership.organizations.id}
          canEditBilling={['owner', 'admin'].includes(membership.access_role)}
          canBook={['owner', 'admin', 'buyer'].includes(membership.access_role)}
        />
      )}

      {tab === 'cases' && <CasesView />}
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
