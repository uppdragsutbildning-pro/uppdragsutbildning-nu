import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, CheckCircle2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { useMarketplace } from '../../../lib/marketplaceContext';
import {
  EMPTY_FORM,
  clearDraft,
  loadDraft,
  newClientRequestId,
  saveDraft,
  type DeliveryFormat,
  type RequestFormValues,
  type RequestSource,
  type SkillChip,
  type TrainingRequestDraft,
} from '../../../lib/trainingRequestDraft';
import { OccupationPicker } from '../kompetensindex/OccupationPicker';

// Konfigurerbar text i bekräftelsevyn.
const RESPONSE_TIME_TEXT = 'Vi återkommer inom 2 arbetsdagar';

const SOURCES: RequestSource[] = ['search_no_results', 'search_weak_results', 'direct'];
const FORMATS: { value: DeliveryFormat; label: string }[] = [
  { value: 'on_site', label: 'På plats' },
  { value: 'remote', label: 'Distans' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'flexible', label: 'Flexibelt' },
];
const STEP_TITLES = ['Behovet', 'Genomförande', 'Granska och skicka'];

const MAX = { title: 200, description: 5000, learningGoals: 5000, targetGroup: 1000 };

type Errors = Partial<Record<keyof RequestFormValues, string>>;

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-[15px] outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400';
const primaryButton =
  'inline-flex items-center justify-center gap-2 px-5 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors';
const secondaryButton =
  'inline-flex items-center justify-center gap-2 px-5 py-3 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors';

// Startvärden: sökkontexten från katalogen (q, source, format) vinner över ett äldre utkast
// från en annan sökning; annars återställs utkastet. En ny sökning får ett nytt klient-id.
function initDraft(params: URLSearchParams): TrainingRequestDraft {
  const q = params.get('q')?.trim() ?? '';
  const sourceParam = params.get('source') as RequestSource | null;
  const source: RequestSource = sourceParam && SOURCES.includes(sourceParam) ? sourceParam : 'direct';
  const contextKey = q || sourceParam ? `${q}|${source}` : '';

  const stored = loadDraft();
  if (stored && (contextKey === '' || stored.contextKey === contextKey)) return stored;

  const formats = params.get('format')?.split(',').filter(Boolean) ?? [];
  const format = formats.length === 1 && FORMATS.some(f => f.value === formats[0]) ? (formats[0] as DeliveryFormat) : '';
  return {
    clientRequestId: newClientRequestId(),
    source,
    searchQuery: q,
    contextKey,
    step: 1,
    form: { ...EMPTY_FORM, title: q, deliveryFormat: format },
    skills: [],
    pendingSubmit: false,
  };
}

function validate(form: RequestFormValues, step: 1 | 2 | 3 | 'all'): Errors {
  const e: Errors = {};
  const check1 = step === 1 || step === 'all';
  const check2 = step === 2 || step === 'all';
  if (check1) {
    if (!form.title.trim()) e.title = 'Ange en rubrik';
    else if (form.title.length > MAX.title) e.title = `Max ${MAX.title} tecken`;
    if (!form.description.trim()) e.description = 'Beskriv behovet och bakgrunden';
    else if (form.description.length > MAX.description) e.description = `Max ${MAX.description} tecken`;
    if (form.learningGoals.length > MAX.learningGoals) e.learningGoals = `Max ${MAX.learningGoals} tecken`;
  }
  if (check2) {
    if (!form.targetGroup.trim()) e.targetGroup = 'Ange vilka som ska delta';
    else if (form.targetGroup.length > MAX.targetGroup) e.targetGroup = `Max ${MAX.targetGroup} tecken`;
    if (!form.deliveryFormat) e.deliveryFormat = 'Välj genomförandeformat';
    if (form.participantCount && !(Number.isInteger(Number(form.participantCount)) && Number(form.participantCount) > 0)) {
      e.participantCount = 'Ange ett heltal större än 0';
    }
  }
  return e;
}

function Field({ label, optional, error, children, htmlFor }: { label: string; optional?: boolean; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-900 mb-1.5">
        {label}
        {optional && <span className="text-slate-400 font-normal"> (valfritt)</span>}
      </label>
      {children}
      {error && <p className="text-sm text-red-600 mt-1.5" role="alert">{error}</p>}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">{children}</div>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-slate-50 min-h-[70vh] px-4 py-10">
      <div className="max-w-2xl mx-auto">{children}</div>
    </div>
  );
}

function SignInPanel({ onBack }: { onBack: () => void }) {
  const { marketplace } = useMarketplace();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    const via = marketplace?.slug ? `&via=${encodeURIComponent(marketplace.slug)}` : '';
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/efterfraga?resume=1${via}` },
    });
    setSending(false);
    if (error) {
      toast.error('Kunde inte skicka inloggningslänk', { description: error.message });
      return;
    }
    setSent(true);
  }

  return (
    <Card>
      <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5">
        <Mail className="w-5 h-5" aria-hidden="true" />
      </div>
      {sent ? (
        <>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Kolla din e-post</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Vi har skickat en inloggningslänk till <strong>{email}</strong>. Din efterfrågan är sparad och
            skickas automatiskt när du har loggat in.
          </p>
          <button type="button" onClick={() => setSent(false)} className="mt-5 text-sm text-blue-600 hover:underline">
            Använd en annan e-postadress
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Logga in för att skicka</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            Din efterfrågan är sparad. Ange din arbetsmejl så skickar vi en inloggningslänk, inget lösenord behövs.
            Efter inloggningen skickas efterfrågan automatiskt.
          </p>
          <Field label="E-postadress" htmlFor="req-email">
            <input
              id="req-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="namn@organisation.se"
              className={inputClass}
            />
          </Field>
          <div className="flex gap-3 mt-5">
            <button type="button" onClick={onBack} className={secondaryButton}>Tillbaka</button>
            <button type="submit" disabled={sending} className={`${primaryButton} flex-1`}>
              {sending ? 'Skickar…' : 'Skicka inloggningslänk'}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

function OrganizationPanel({ onDone }: { onDone: () => void }) {
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
    onDone();
  }

  return (
    <Card>
      <h2 className="text-xl font-bold text-slate-900 mb-2">Berätta vem ni är</h2>
      <p className="text-sm text-slate-600 leading-relaxed mb-6">
        Din efterfrågan är sparad. Lärosätena behöver veta vilken organisation den kommer från. Efter det här
        steget skickas den automatiskt.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Organisation" htmlFor="org-name">
          <input id="org-name" required value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="T.ex. Region Exempel" className={inputClass} />
        </Field>
        <Field label="Organisationsnummer" optional htmlFor="org-number">
          <input id="org-number" value={orgNumber} onChange={e => setOrgNumber(e.target.value)} placeholder="556000-0000" className={inputClass} />
        </Field>
        <Field label="Ditt namn" htmlFor="display-name">
          <input id="display-name" required autoComplete="name" value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputClass} />
        </Field>
        <button type="submit" disabled={saving} className={`${primaryButton} w-full`}>
          {saving ? 'Skapar…' : 'Fortsätt och skicka'}
        </button>
      </form>
    </Card>
  );
}

function Confirmation() {
  const steps = [
    { title: 'Granskning', text: 'Vi går igenom din efterfrågan och förtydligar vid behov.' },
    { title: 'Skickas till lärosäten', text: 'Vi väljer ut lärosäten som passar och skickar vidare.' },
    { title: 'Offerter', text: 'Lärosätena svarar med offerter som du följer under Mitt konto.' },
  ];
  return (
    <Shell>
      <Card>
        <div className="w-11 h-11 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Din efterfrågan är skickad</h1>
        <p className="text-slate-600 mb-8">{RESPONSE_TIME_TEXT}.</p>
        <ol className="space-y-5 mb-8">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold ${i === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {i + 1}
              </span>
              <div>
                <p className="font-medium text-slate-900">{s.title}</p>
                <p className="text-sm text-slate-600">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link to="/konto" className={primaryButton}>
          Gå till Mitt konto <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </Card>
    </Shell>
  );
}

export function RequestCustomTrainingPage() {
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, signOut } = useAuth();
  const { marketplace } = useMarketplace();

  const [draft, setDraft] = useState<TrainingRequestDraft>(() => initDraft(searchParams));
  const [errors, setErrors] = useState<Errors>({});
  const [view, setView] = useState<'form' | 'signin' | 'organization' | 'not_buyer' | 'done'>('form');
  const [submitting, setSubmitting] = useState(false);

  // Ref-lås: stoppar ett andra submit-anrop direkt (state hinner inte uppdateras);
  // tillsammans med client_request_id i RPC:n ger det ingen dubbelsändning.
  const submitLockRef = useRef(false);
  const autoSubmitTriedRef = useRef(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    document.title = 'Efterfråga anpassad utbildning – Uppdragsutbildning.nu';
  }, []);

  // Spara löpande. Efter lyckad inskickning rensas utkastet och sparas inte igen.
  useEffect(() => {
    if (!submittedRef.current) saveDraft(draft);
  }, [draft]);

  const setForm = (patch: Partial<RequestFormValues>) => setDraft(d => ({ ...d, form: { ...d.form, ...patch } }));
  const setSkills = (skills: SkillChip[]) => setDraft(d => ({ ...d, skills }));
  const goToStep = (step: 1 | 2 | 3) => setDraft(d => ({ ...d, step }));

  const submit = useCallback(async () => {
    if (!user || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const all = validate(draft.form, 'all');
      if (Object.keys(all).length > 0) {
        setErrors(all);
        goToStep(Object.keys(validate(draft.form, 1)).length > 0 ? 1 : 2);
        setView('form');
        setDraft(d => ({ ...d, pendingSubmit: false }));
        toast.error('Komplettera de obligatoriska fälten');
        return;
      }

      // Kontrollera roll och organisation direkt mot databasen. Köpare saknar rad i
      // profiles, så AuthContext.profile = null är inte en tillförlitlig signal medan
      // profilen laddas.
      const [{ data: profileRow }, { data: memberRow, error: memberError }] = await Promise.all([
        supabase.from('profiles').select('id').eq('id', user.id).maybeSingle(),
        supabase.from('organization_members').select('organization_id').eq('user_id', user.id).maybeSingle(),
      ]);
      if (memberError) throw memberError;
      if (profileRow) {
        setView('not_buyer');
        setDraft(d => ({ ...d, pendingSubmit: false }));
        return;
      }
      if (!memberRow) {
        setView('organization');
        return;
      }

      const f = draft.form;
      const { error } = await supabase.rpc('submit_training_request', {
        p_client_request_id: draft.clientRequestId,
        p_title: f.title,
        p_description: f.description,
        p_target_group: f.targetGroup,
        p_delivery_format: f.deliveryFormat,
        p_search_query: draft.searchQuery || null,
        p_source: draft.source,
        p_learning_goals: f.learningGoals || null,
        p_participant_count: f.participantCount ? Number(f.participantCount) : null,
        p_location: f.location || null,
        p_desired_start: f.desiredStart || null,
        p_budget_range: f.budgetRange || null,
        p_ssyk_skills: draft.skills.map(s => ({ id: s.id, title: s.label })),
        p_marketplace_id: marketplace?.id ?? null,
      });
      if (error) throw error;

      submittedRef.current = true;
      clearDraft();
      setView('done');
    } catch (err) {
      setDraft(d => ({ ...d, pendingSubmit: false }));
      setView('form');
      toast.error('Kunde inte skicka efterfrågan', { description: err instanceof Error ? err.message : undefined });
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, draft, marketplace]);

  // Auto-submit efter inloggning: körs en gång, först när AuthContext har laddat klart.
  useEffect(() => {
    if (authLoading || !user || !draft.pendingSubmit || autoSubmitTriedRef.current || submittedRef.current) return;
    autoSubmitTriedRef.current = true;
    submit();
  }, [authLoading, user, draft.pendingSubmit, submit]);

  function handleNext() {
    const e = validate(draft.form, draft.step);
    setErrors(e);
    if (Object.keys(e).length === 0) goToStep((draft.step + 1) as 2 | 3);
  }

  function handleSend() {
    const e = validate(draft.form, 'all');
    setErrors(e);
    if (Object.keys(e).length > 0) {
      goToStep(Object.keys(validate(draft.form, 1)).length > 0 ? 1 : 2);
      return;
    }
    if (!user) {
      setDraft(d => ({ ...d, pendingSubmit: true }));
      setView('signin');
      return;
    }
    submit();
  }

  if (view === 'done') return <Confirmation />;

  const f = draft.form;
  const err = (key: keyof RequestFormValues) => errors[key];

  return (
    <Shell>
      <p className="text-xs font-medium tracking-wider uppercase text-slate-500 mb-1">Anpassad utbildning</p>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Efterfråga anpassad utbildning</h1>

      {view === 'signin' && <SignInPanel onBack={() => { setView('form'); setDraft(d => ({ ...d, pendingSubmit: false })); }} />}

      {view === 'organization' && (
        <OrganizationPanel
          onDone={() => {
            setView('form');
            setDraft(d => ({ ...d, pendingSubmit: true }));
            autoSubmitTriedRef.current = false;
          }}
        />
      )}

      {view === 'not_buyer' && (
        <Card>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Du är inloggad som leverantör eller administratör</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-5">
            Efterfrågningar skickas av organisationer som köper utbildning. Logga ut och logga in som köpare för att
            skicka. Ditt utkast är sparat.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setView('form')} className={secondaryButton}>Tillbaka</button>
            <button type="button" onClick={() => signOut()} className={primaryButton}>Logga ut</button>
          </div>
        </Card>
      )}

      {view === 'form' && (
        <>
          <ol className="flex items-center gap-3 mb-6 text-sm" aria-label="Steg">
            {STEP_TITLES.map((t, i) => {
              const n = (i + 1) as 1 | 2 | 3;
              const active = n === draft.step;
              return (
                <li key={t} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${active ? 'bg-blue-600 text-white' : n < draft.step ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
                    {n}
                  </span>
                  <span className={`hidden sm:inline ${active ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>{t}</span>
                  {i < STEP_TITLES.length - 1 && <span className="w-6 h-px bg-slate-300" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>

          <Card>
            {draft.step === 1 && (
              <div className="space-y-5">
                <Field label="Rubrik" htmlFor="req-title" error={err('title')}>
                  <input id="req-title" value={f.title} maxLength={MAX.title} onChange={e => setForm({ title: e.target.value })} placeholder="T.ex. Ledarskap i en förändringsorganisation" className={inputClass} />
                </Field>
                <Field label="Beskriv behovet och bakgrunden" htmlFor="req-description" error={err('description')}>
                  <textarea id="req-description" rows={6} value={f.description} maxLength={MAX.description} onChange={e => setForm({ description: e.target.value })} placeholder="Vad vill ni uppnå, och vad är bakgrunden?" className={inputClass} />
                </Field>
                <Field label="Vad ska deltagarna kunna efteråt?" optional htmlFor="req-goals" error={err('learningGoals')}>
                  <textarea id="req-goals" rows={3} value={f.learningGoals} maxLength={MAX.learningGoals} onChange={e => setForm({ learningGoals: e.target.value })} className={inputClass} />
                </Field>
                <div>
                  <p className="block text-sm font-medium text-slate-900 mb-1.5">
                    Yrkesroller och kompetensområden <span className="text-slate-400 font-normal">(valfritt)</span>
                  </p>
                  <OccupationPicker selected={draft.skills} onChange={setSkills} />
                </div>
              </div>
            )}

            {draft.step === 2 && (
              <div className="space-y-5">
                <Field label="Målgrupp" htmlFor="req-target" error={err('targetGroup')}>
                  <input id="req-target" value={f.targetGroup} maxLength={MAX.targetGroup} onChange={e => setForm({ targetGroup: e.target.value })} placeholder="T.ex. mellanchefer inom kommunens omsorgsförvaltning" className={inputClass} />
                </Field>
                <Field label="Antal deltagare" optional htmlFor="req-count" error={err('participantCount')}>
                  <input id="req-count" inputMode="numeric" value={f.participantCount} onChange={e => setForm({ participantCount: e.target.value })} className={inputClass} />
                </Field>
                <fieldset>
                  <legend className="block text-sm font-medium text-slate-900 mb-1.5">Genomförande</legend>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {FORMATS.map(o => (
                      <label key={o.value} className={`cursor-pointer text-center px-3 py-2.5 rounded-lg border text-sm transition-colors ${f.deliveryFormat === o.value ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                        <input type="radio" name="delivery" value={o.value} checked={f.deliveryFormat === o.value} onChange={() => setForm({ deliveryFormat: o.value })} className="sr-only" />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  {err('deliveryFormat') && <p className="text-sm text-red-600 mt-1.5" role="alert">{err('deliveryFormat')}</p>}
                </fieldset>
                <Field label="Ort" optional htmlFor="req-location">
                  <input id="req-location" value={f.location} onChange={e => setForm({ location: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Önskad period" optional htmlFor="req-start">
                  <input id="req-start" value={f.desiredStart} onChange={e => setForm({ desiredStart: e.target.value })} placeholder="T.ex. hösten 2027" className={inputClass} />
                </Field>
              </div>
            )}

            {draft.step === 3 && (
              <div className="space-y-5">
                <Field label="Budgetram" optional htmlFor="req-budget">
                  <input id="req-budget" value={f.budgetRange} onChange={e => setForm({ budgetRange: e.target.value })} placeholder="T.ex. 100 000–150 000 kr" className={inputClass} />
                </Field>
                <dl className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3 text-sm">
                  {[
                    ['Rubrik', f.title],
                    ['Behov', f.description],
                    ['Målgrupp', f.targetGroup],
                    ['Genomförande', FORMATS.find(o => o.value === f.deliveryFormat)?.label ?? ''],
                    ['Antal deltagare', f.participantCount],
                    ['Ort', f.location],
                    ['Önskad period', f.desiredStart],
                    ['Kompetensområden', draft.skills.map(s => s.label).join(', ')],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <dt className="w-32 shrink-0 text-slate-500">{k}</dt>
                      <dd className="text-slate-900 whitespace-pre-line break-words min-w-0 line-clamp-3">{v}</dd>
                    </div>
                  ))}
                </dl>
                {!user && !authLoading && (
                  <p className="text-sm text-slate-500">Du loggar in när du skickar. Din efterfrågan sparas under tiden.</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 mt-8">
              {draft.step > 1 ? (
                <button type="button" onClick={() => goToStep((draft.step - 1) as 1 | 2)} className={secondaryButton}>Tillbaka</button>
              ) : <span />}
              {draft.step < 3 ? (
                <button type="button" onClick={handleNext} className={primaryButton}>
                  Nästa <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              ) : (
                <button type="button" onClick={handleSend} disabled={submitting || authLoading} className={primaryButton}>
                  {submitting ? 'Skickar…' : 'Skicka efterfrågan'}
                </button>
              )}
            </div>
          </Card>
          <p className="text-xs text-slate-500 mt-4">Ditt utkast sparas automatiskt i den här webbläsaren.</p>
        </>
      )}
    </Shell>
  );
}
