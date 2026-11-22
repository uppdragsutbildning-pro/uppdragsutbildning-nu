import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Download, Loader2, LogIn, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../contexts/AuthContext';
import { useEmailCodeLogin } from '../../../../hooks/useEmailCodeLogin';
import { useMarketplace } from '../../../../lib/marketplaceContext';
import type { Analysis } from '../../../../lib/kompetensindexReport';
import {
  REPORT_CONSENT_TEXT, buildSnapshot, clearPendingReport, saveReport, storePendingReport,
} from '../../../../lib/skiReports';
import type { CPIResult } from '../../pages/KompetensindexPage';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';

// Spara rapporten på kontot och ladda ner PDF. Båda kräver inloggning, och panelen säger det tydligt.
// Inloggning sker med engångskod via e-post, inline, så att rapporten inte går förlorad. Klickar användaren
// på länken i mejlet i stället lämnar den sidan; då ligger rapporten kvar i webbläsaren och sparas
// automatiskt när Mitt konto öppnas (se useSavePendingReport).

interface Props {
  result: CPIResult;
  analysis: Analysis;
  analysisReady: boolean;
  pdf: { busy: boolean; download: () => void };
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--fg)] text-[15px] outline-none focus:border-[var(--accent)]';
function PdfButton({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[10px] border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-dim)] disabled:opacity-60 text-sm font-semibold transition-colors">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" aria-hidden="true" />}
      {label}
    </button>
  );
}

const primary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white text-sm font-semibold rounded-[10px] transition-colors';

export function SaveReportPanel({ result, analysis, analysisReady, pdf }: Props) {
  const { user, profile } = useAuth();
  const { marketplace } = useMarketplace();
  const clientReportId = useMemo(() => crypto.randomUUID(), []);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [intent, setIntent] = useState<'save' | 'pdf'>('save');

  const via = marketplace?.slug ? `&via=${encodeURIComponent(marketplace.slug)}` : '';
  const isStaff = !!profile; // leverantörer och admin har inte Mitt konto

  async function doSave() {
    if (!consent) { toast.error('Godkänn att rapporten sparas för att fortsätta'); return; }
    setSaving(true);
    try {
      const id = await saveReport(clientReportId, buildSnapshot(result, analysis));
      clearPendingReport();
      setSavedId(id);
      toast.success('Rapporten är sparad i Mitt konto');
    } catch (e: any) {
      toast.error('Kunde inte spara rapporten', { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  // Efter inline-inloggning: spara direkt om samtycke redan getts i dialogen.
  const [saveAfterLogin, setSaveAfterLogin] = useState(false);
  useEffect(() => {
    if (user && saveAfterLogin && !saving && !savedId) {
      setSaveAfterLogin(false);
      doSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, saveAfterLogin]);

  const [pdfAfterLogin, setPdfAfterLogin] = useState(false);
  useEffect(() => {
    if (user && pdfAfterLogin) {
      setPdfAfterLogin(false);
      pdf.download();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pdfAfterLogin]);

  function openPdfLogin() {
    setIntent('pdf');
    setLoginOpen(true);
  }

  function openLogin() {
    if (!consent) { toast.error('Godkänn att rapporten sparas för att fortsätta'); return; }
    // Reservplan om användaren väljer länken i mejlet i stället för koden.
    storePendingReport({ clientReportId, snapshot: buildSnapshot(result, analysis) });
    setIntent('save');
    setLoginOpen(true);
  }

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-raised)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)] mb-1">Spara och ladda ner</p>
          <h3 className="font-bold text-[var(--fg)] leading-snug">Spara rapporten och ladda ner den som PDF</h3>
          <p className="mt-1.5 text-sm text-[var(--fg-muted)] leading-relaxed">
            <strong className="text-[var(--fg)]">Du behöver logga in för att spara rapporten och ladda ner PDF:en.</strong>{' '}
            Det går utan lösenord: vi skickar en engångskod till din e-post. Sparade rapporter hittar du sedan under Mitt konto.
          </p>
        </div>
        {savedId && (
          <Link to={`/konto?tab=rapporter${via}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline">
            Visa i Mitt konto
          </Link>
        )}
      </div>

      {savedId ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#15803D]">
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />Sparad i Mitt konto
          </span>
          <PdfButton onClick={user ? pdf.download : openPdfLogin} busy={pdf.busy} label={user ? "Ladda ner PDF" : "Logga in och ladda ner PDF"} />
        </div>
      ) : isStaff ? (
        <p className="mt-4 text-sm text-[var(--fg-muted)]">
          Du är inloggad som {profile?.role === 'admin' ? 'administratör' : 'leverantör'}. Rapporter sparas på ett köparkonto: logga ut och logga in som köpare för att spara.
          <span className="block mt-3"><PdfButton onClick={pdf.download} busy={pdf.busy} label="Ladda ner PDF" /></span>
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-2.5 text-sm text-[var(--fg-muted)] leading-snug cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-[var(--border)] accent-[var(--accent)]" />
            <span>{REPORT_CONSENT_TEXT}</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {user ? (
              <button type="button" onClick={doSave} disabled={saving || !analysisReady} className={primary}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" aria-hidden="true" />}
                Spara rapporten
              </button>
            ) : (
              <button type="button" onClick={openLogin} disabled={!analysisReady} className={primary}>
                <LogIn className="w-4 h-4" aria-hidden="true" />Logga in för att spara
              </button>
            )}
            <PdfButton onClick={user ? pdf.download : openPdfLogin} busy={pdf.busy} label={user ? "Ladda ner PDF" : "Logga in och ladda ner PDF"} />
            {!analysisReady && <span className="text-xs text-[var(--fg-subtle)]">Väntar på att analysen blir klar…</span>}
          </div>
        </div>
      )}

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} redirectVia={via} intent={intent}
        onLoggedIn={() => { setLoginOpen(false); if (intent === 'pdf') setPdfAfterLogin(true); else setSaveAfterLogin(true); }} />
    </div>
  );
}

function LoginDialog({ open, onOpenChange, onLoggedIn, redirectVia, intent }: {
  open: boolean; onOpenChange: (o: boolean) => void; onLoggedIn: () => void; redirectVia: string; intent: 'save' | 'pdf';
}) {
  const login = useEmailCodeLogin(`/konto?tab=rapporter${redirectVia}`);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim()) return;
    if (await login.sendCode(email)) setSent(true);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const user = await login.verify(email, code);
    if (user) onLoggedIn();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ub-theme sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{intent === 'pdf' ? 'Logga in för att ladda ner PDF' : 'Logga in för att spara'}</DialogTitle>
          <DialogDescription>
            Ange din e-postadress så skickar vi en engångskod. Ingen lösenord behövs, och nya användare skapas automatiskt.
          </DialogDescription>
        </DialogHeader>
        {!sent ? (
          <form onSubmit={send} className="space-y-3">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="namn@foretag.se" className={inputClass} autoFocus />
            <button type="submit" disabled={login.sending} className={`${primary} w-full`}>
              {login.sending ? 'Skickar…' : 'Skicka kod'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm text-[var(--fg-muted)]">Vi har skickat en kod till {email}.{intent === 'save' ? ' Du kan också klicka på länken i mejlet, då hittar du rapporten i Mitt konto.' : ''}</p>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" required value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="Kod från mejlet" className={inputClass} autoFocus />
            {login.error && <p className="text-xs text-red-600">{login.error}</p>}
            <button type="submit" disabled={login.verifying} className={`${primary} w-full`}>
              {login.verifying ? 'Kontrollerar…' : intent === 'pdf' ? 'Logga in och ladda ner' : 'Logga in och spara'}
            </button>
            <button type="button" disabled={login.cooldown > 0 || login.sending} onClick={() => send()}
              className="w-full text-xs text-[var(--fg-muted)] hover:underline disabled:opacity-60">
              {login.cooldown > 0 ? `Skicka ny kod (${login.cooldown} s)` : 'Skicka ny kod'}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
