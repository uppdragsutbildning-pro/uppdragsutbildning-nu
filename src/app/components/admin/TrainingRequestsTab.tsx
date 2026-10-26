import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Building2, Clock, Inbox, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabaseClient';
import { matchProviders, type CourseForMatching } from '../../../lib/trainingRequestMatching';

type RequestStatus = 'submitted' | 'in_review' | 'assigned' | 'offers_received' | 'closed' | 'cancelled' | 'no_match';
type AssignmentStatus = 'assigned' | 'viewed' | 'declined' | 'quoted' | 'withdrawn';

interface Req {
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
  search_query: string | null;
  source: string;
  ssyk_skills: { id: string; title: string }[];
  status: RequestStatus;
  submitted_at: string;
  organizations: { name: string } | null;
}

interface Asg {
  id: string;
  request_id: string;
  provider_id: string;
  status: AssignmentStatus;
  response_deadline: string;
  viewed_at: string | null;
  responded_at: string | null;
  decline_reason: string | null;
  providers: { name: string } | null;
}

interface Ev {
  id: string;
  request_id: string;
  actor_role: string;
  event_type: string;
  visible_to_buyer: boolean;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface Note {
  id: string;
  body: string;
  created_at: string;
}

const STATUS: Record<RequestStatus, { label: string; className: string }> = {
  submitted: { label: 'Ny', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_review: { label: 'Granskas', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  assigned: { label: 'Hos lärosäten', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  offers_received: { label: 'Offerter inkomna', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closed: { label: 'Avslutad', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  cancelled: { label: 'Avbruten', className: 'bg-slate-50 text-slate-500 border-slate-200' },
  no_match: { label: 'Ingen matchning', className: 'bg-red-50 text-red-700 border-red-200' },
};

const ASG_STATUS: Record<AssignmentStatus, string> = {
  assigned: 'Ej öppnad',
  viewed: 'Läst',
  declined: 'Avböjd',
  quoted: 'Offert lämnad',
  withdrawn: 'Återkallad',
};

const FORMAT_LABEL: Record<string, string> = { on_site: 'På plats', remote: 'Distans', hybrid: 'Hybrid', flexible: 'Flexibelt' };
const TERMINAL: RequestStatus[] = ['closed', 'cancelled', 'no_match'];
const ACTIVE_ASG: AssignmentStatus[] = ['assigned', 'viewed', 'quoted'];
const DAY = 86_400_000;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
const ageDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);

const hasActiveAssignment = (asgs: Asg[]) => asgs.some(a => ACTIVE_ASG.includes(a.status));

// "Alla tilldelade lärosäten har passerat deadline utan svar": minst en öppen tilldelning,
// ingen offert, och alla öppna tilldelningar är försenade (övriga har avböjt).
function allOverdue(req: Req, asgs: Asg[]): boolean {
  if (req.status !== 'assigned') return false;
  const live = asgs.filter(a => a.status !== 'withdrawn');
  if (live.length === 0 || live.some(a => a.status === 'quoted')) return false;
  const open = live.filter(a => a.status === 'assigned' || a.status === 'viewed');
  return open.length > 0 && open.every(a => new Date(a.response_deadline).getTime() < Date.now());
}

const needsAttention = (req: Req, asgs: Asg[]) =>
  (['submitted', 'in_review'].includes(req.status) && !hasActiveAssignment(asgs)) || allOverdue(req, asgs);

function describeEvent(e: Ev, providerName: (id: unknown) => string): string {
  const p = e.payload ?? {};
  switch (e.event_type) {
    case 'submitted': return 'Efterfrågan skickad';
    case 'assigned': return e.visible_to_buyer ? `Tilldelning sammanfattad för köparen (${p.count ?? '?'} lärosäten)` : `Tilldelad ${providerName(p.provider_id)}`;
    case 'viewed': return 'Lärosäte öppnade efterfrågan';
    case 'declined': return `Avböjd${p.reason ? `: ${p.reason}` : ''}`;
    case 'quoted': return 'Offert lämnad';
    case 'withdrawn': return `Tilldelning återkallad (${providerName(p.provider_id)})`;
    case 'status_changed': return `Status: ${p.from ?? '?'} → ${p.to ?? '?'}`;
    case 'cancelled': return 'Avbruten av köparen';
    case 'closed': return `Avslutad${p.message ? `: ${p.message}` : ''}`;
    case 'no_match': return `Ingen matchning${p.message ? `: ${p.message}` : ''}`;
    default: return e.event_type;
  }
}

function Badge({ status }: { status: RequestStatus }) {
  const s = STATUS[status];
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${s.className}`}>{s.label}</span>;
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export function useOpenTrainingRequestsCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    supabase
      .from('training_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'submitted')
      .then(({ count: c }) => {
        if (active) setCount(c ?? 0);
      });
    return () => {
      active = false;
    };
  }, []);
  return count;
}

export function TrainingRequestsTab() {
  const [requests, setRequests] = useState<Req[]>([]);
  const [assignments, setAssignments] = useState<Asg[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [minAge, setMinAge] = useState(0);

  const load = useCallback(async () => {
    const [r, a] = await Promise.all([
      supabase.from('training_requests').select('*, organizations(name)').order('submitted_at', { ascending: true }),
      supabase.from('training_request_assignments').select('*, providers(name)'),
    ]);
    if (r.error || a.error) {
      toast.error('Kunde inte ladda efterfrågningar');
    } else {
      setRequests((r.data ?? []) as unknown as Req[]);
      setAssignments((a.data ?? []) as unknown as Asg[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const asgByRequest = useMemo(() => {
    const m = new Map<string, Asg[]>();
    for (const a of assignments) m.set(a.request_id, [...(m.get(a.request_id) ?? []), a]);
    return m;
  }, [assignments]);

  const overdueRequests = requests.filter(r => allOverdue(r, asgByRequest.get(r.id) ?? []));

  const rows = useMemo(() => {
    const filtered = requests.filter(r => {
      const asgs = asgByRequest.get(r.id) ?? [];
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (onlyUnassigned && (TERMINAL.includes(r.status) || hasActiveAssignment(asgs))) return false;
      if (onlyOverdue && !allOverdue(r, asgs)) return false;
      if (minAge > 0 && ageDays(r.submitted_at) < minAge) return false;
      return true;
    });
    // Standard: de som behöver åtgärd först (äldst först), därefter övriga (äldst först), avslutade sist.
    const rank = (r: Req) => (TERMINAL.includes(r.status) ? 2 : needsAttention(r, asgByRequest.get(r.id) ?? []) ? 0 : 1);
    return [...filtered].sort((a, b) => rank(a) - rank(b) || a.submitted_at.localeCompare(b.submitted_at));
  }, [requests, asgByRequest, statusFilter, onlyUnassigned, onlyOverdue, minAge]);

  const selected = requests.find(r => r.id === selectedId) ?? null;

  if (selected) {
    return (
      <RequestDetail
        request={selected}
        assignments={asgByRequest.get(selected.id) ?? []}
        onBack={() => setSelectedId(null)}
        onChanged={load}
      />
    );
  }

  return (
    <div className="space-y-6">
      {overdueRequests.length > 0 && (
        <button
          type="button"
          onClick={() => { setOnlyOverdue(true); setStatusFilter('all'); }}
          className="w-full flex items-center gap-3 text-left bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 hover:bg-red-100 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            <strong>{overdueRequests.length}</strong> {overdueRequests.length === 1 ? 'efterfrågan där' : 'efterfrågningar där'} alla tilldelade lärosäten har passerat deadline utan svar.
          </span>
        </button>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-4">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | RequestStatus)}
          aria-label="Status"
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="all">Alla statusar</option>
          {(Object.keys(STATUS) as RequestStatus[]).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <select value={minAge} onChange={e => setMinAge(Number(e.target.value))} aria-label="Ålder" className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value={0}>Alla åldrar</option>
          <option value={2}>Äldre än 2 dagar</option>
          <option value={5}>Äldre än 5 dagar</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={onlyUnassigned} onChange={e => setOnlyUnassigned(e.target.checked)} /> Utan tilldelning
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={onlyOverdue} onChange={e => setOnlyOverdue(e.target.checked)} /> Deadline passerad
        </label>
      </div>

      {loading ? (
        <p className="text-slate-600">Laddar…</p>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-900 font-semibold">Inga efterfrågningar</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(r => {
            const asgs = asgByRequest.get(r.id) ?? [];
            const active = asgs.filter(a => ACTIVE_ASG.includes(a.status)).length;
            const attention = needsAttention(r, asgs);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left bg-white border rounded-xl p-5 hover:shadow-md transition-shadow ${attention ? 'border-amber-300' : 'border-slate-200'}`}
                >
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <h3 className="text-base font-semibold text-slate-900">{r.title}</h3>
                    <Badge status={r.status} />
                    {attention && !allOverdue(r, asgs) && (
                      <span className="text-xs font-medium text-amber-700">Behöver tilldelas</span>
                    )}
                    {allOverdue(r, asgs) && <span className="text-xs font-medium text-red-700">Alla har passerat deadline</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1.5"><Building2 className="w-4 h-4 text-slate-400" />{r.organizations?.name ?? 'Okänd organisation'}</span>
                    <span className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4 text-slate-400" />{fmtDate(r.submitted_at)} ({ageDays(r.submitted_at)} d)</span>
                    <span>{active} {active === 1 ? 'lärosäte' : 'lärosäten'}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RequestDetail({ request, assignments, onBack, onChanged }: {
  request: Req;
  assignments: Asg[];
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [events, setEvents] = useState<Ev[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState('');
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [courses, setCourses] = useState<CourseForMatching[]>([]);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [noMatchOpen, setNoMatchOpen] = useState(false);
  const [noMatchMessage, setNoMatchMessage] = useState('');

  const terminal = TERMINAL.includes(request.status);

  const loadExtras = useCallback(async () => {
    const [ev, nt] = await Promise.all([
      supabase.from('training_request_events').select('*').eq('request_id', request.id).order('created_at', { ascending: true }),
      supabase.from('training_request_admin_notes').select('id, body, created_at').eq('request_id', request.id).order('created_at', { ascending: false }),
    ]);
    setEvents((ev.data ?? []) as unknown as Ev[]);
    setNotes((nt.data ?? []) as Note[]);
  }, [request.id]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras, request.status, assignments.length]);

  useEffect(() => {
    (async () => {
      const [p, t] = await Promise.all([
        supabase.from('providers').select('id, name').eq('is_active', true).order('name'),
        supabase.from('trainings').select('provider_id, title, description, target_audience, ssyk_skills, categories(name)').eq('is_active', true),
      ]);
      setProviders((p.data ?? []) as { id: string; name: string }[]);
      setCourses(
        ((t.data ?? []) as unknown as (Omit<CourseForMatching, 'category_name'> & { categories: { name: string } | null })[]).map(c => ({
          provider_id: c.provider_id,
          title: c.title,
          description: c.description,
          target_audience: c.target_audience,
          ssyk_skills: c.ssyk_skills,
          category_name: c.categories?.name ?? null,
        }))
      );
    })();
  }, []);

  // Admin har öppnat en ny efterfrågan: submitted → in_review.
  useEffect(() => {
    if (request.status !== 'submitted') return;
    (async () => {
      const { error } = await supabase.rpc('admin_set_request_status', { p_request_id: request.id, p_status: 'in_review' });
      if (!error) await onChanged();
    })();
  }, [request.id, request.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeProviderIds = new Set(assignments.filter(a => a.status !== 'withdrawn' && a.status !== 'declined').map(a => a.provider_id));
  const providerName = (id: unknown) => providers.find(p => p.id === id)?.name ?? assignments.find(a => a.provider_id === id)?.providers?.name ?? 'okänt lärosäte';

  const matches = useMemo(
    () => matchProviders(request, courses, providers.map(p => p.id)),
    [request, courses, providers]
  );

  const q = search.trim().toLowerCase();
  const visibleProviders = providers.filter(p => !q || p.name.toLowerCase().includes(q));
  const suggested = visibleProviders
    .filter(p => matches.has(p.id))
    .sort((a, b) => (matches.get(b.id)!.score - matches.get(a.id)!.score) || a.name.localeCompare(b.name));
  const others = visibleProviders.filter(p => !matches.has(p.id));

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, okMsg: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      toast.error('Åtgärden misslyckades', { description: error.message });
      return false;
    }
    toast.success(okMsg);
    await onChanged();
    await loadExtras();
    return true;
  }

  async function assign() {
    if (picked.size === 0) return;
    const iso = deadline ? new Date(`${deadline}T23:59:00`).toISOString() : null;
    const ok = await run(
      () => supabase.rpc('admin_assign_providers', { p_request_id: request.id, p_provider_ids: [...picked], p_deadline: iso }),
      `Skickat till ${picked.size} ${picked.size === 1 ? 'lärosäte' : 'lärosäten'}`
    );
    if (ok) {
      setPicked(new Set());
      setDeadline('');
    }
  }

  async function addNote() {
    const body = noteText.trim();
    if (!body) return;
    const { data: userData } = await supabase.auth.getUser();
    setBusy(true);
    const { error } = await supabase.from('training_request_admin_notes').insert({ request_id: request.id, author_id: userData.user?.id, body });
    setBusy(false);
    if (error) {
      toast.error('Kunde inte spara anteckningen', { description: error.message });
      return;
    }
    setNoteText('');
    loadExtras();
  }

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderProviderRow(id: string, name: string) {
    const assigned = activeProviderIds.has(id);
    const m = matches.get(id);
    return (
      <label key={id} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${assigned ? 'bg-slate-50 border-slate-200 opacity-70' : picked.has(id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
        <input type="checkbox" className="mt-1" disabled={assigned} checked={picked.has(id)} onChange={() => toggle(id)} />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-slate-900">{name}{assigned && <span className="ml-2 text-xs font-normal text-slate-500">Tilldelad</span>}</span>
          {m && <span className="block text-xs text-slate-600">{m.reason}</span>}
        </span>
      </label>
    );
  }

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Tillbaka till inkorgen
      </button>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-slate-900">{request.title}</h2>
              <Badge status={request.status} />
            </div>
            <p className="text-sm text-slate-600">
              {request.organizations?.name ?? 'Okänd organisation'} · skickad {fmtDate(request.submitted_at)}
              {request.search_query && <> · sökte på "{request.search_query}" ({request.source})</>}
            </p>
          </div>
          {!terminal && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setNoMatchOpen(o => !o)}
                className="px-4 py-2 text-sm border border-red-200 text-red-700 bg-white hover:bg-red-50 rounded-lg disabled:opacity-60"
              >
                Ingen matchning
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Avsluta efterfrågan? Öppna tilldelningar dras tillbaka.')) {
                    run(() => supabase.rpc('admin_set_request_status', { p_request_id: request.id, p_status: 'closed', p_message: null }), 'Efterfrågan avslutad');
                  }
                }}
                className="px-4 py-2 text-sm border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg disabled:opacity-60"
              >
                Avsluta
              </button>
            </div>
          )}
        </div>

        {noMatchOpen && !terminal && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
            <label htmlFor="nomatch-msg" className="block text-sm font-medium text-red-900">Meddelande till köparen</label>
            <textarea
              id="nomatch-msg"
              rows={3}
              value={noMatchMessage}
              onChange={e => setNoMatchMessage(e.target.value)}
              placeholder="Förklara varför vi inte hittade ett lärosäte just nu."
              className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-white"
            />
            <button
              type="button"
              disabled={busy || !noMatchMessage.trim()}
              onClick={async () => {
                const ok = await run(
                  () => supabase.rpc('admin_set_request_status', { p_request_id: request.id, p_status: 'no_match', p_message: noMatchMessage }),
                  'Köparen meddelas: ingen matchning'
                );
                if (ok) { setNoMatchOpen(false); setNoMatchMessage(''); }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg"
            >
              Sätt ingen matchning
            </button>
          </div>
        )}

        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">Behov</h3>
          <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-line">{request.description}</p>
        </div>
        <dl className="grid sm:grid-cols-3 gap-4">
          <Field label="Mål" value={request.learning_goals} />
          <Field label="Målgrupp" value={request.target_group} />
          <Field label="Antal deltagare" value={request.participant_count} />
          <Field label="Genomförande" value={FORMAT_LABEL[request.delivery_format] ?? request.delivery_format} />
          <Field label="Ort" value={request.location} />
          <Field label="Önskad period" value={request.desired_start} />
          <Field label="Budgetram" value={request.budget_range} />
          <Field label="Kompetensområden" value={request.ssyk_skills?.map(s => s.title).join(', ')} />
        </dl>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Tilldelningar</h3>
        {assignments.length === 0 ? (
          <p className="text-sm text-slate-600">Inga tilldelningar än.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {assignments.map(a => {
              const overdue = (a.status === 'assigned' || a.status === 'viewed') && new Date(a.response_deadline).getTime() < Date.now();
              return (
                <li key={a.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{a.providers?.name}</p>
                    <p className="text-xs text-slate-600">
                      {ASG_STATUS[a.status]}
                      {' · '}
                      <span className={overdue ? 'text-red-600 font-medium' : ''}>deadline {fmtDate(a.response_deadline)}{overdue ? ' (passerad)' : ''}</span>
                      {a.decline_reason && <> · anledning: {a.decline_reason}</>}
                    </p>
                  </div>
                  {(a.status === 'assigned' || a.status === 'viewed') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => supabase.rpc('admin_withdraw_assignment', { p_assignment_id: a.id }), 'Tilldelningen är återkallad')}
                      className="px-3 py-1.5 text-sm border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg disabled:opacity-60"
                    >
                      Dra tillbaka
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!terminal && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Skicka till lärosäten</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Sök lärosäte…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>

          {suggested.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500"><Sparkles className="w-3.5 h-3.5" /> Föreslagna matchningar</p>
              {suggested.map(p => renderProviderRow(p.id, p.name))}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{suggested.length > 0 ? 'Övriga lärosäten' : 'Lärosäten'}</p>
            {others.length === 0 && <p className="text-sm text-slate-500">Inga fler träffar.</p>}
            {others.map(p => renderProviderRow(p.id, p.name))}
          </div>

          <div className="flex flex-wrap items-end gap-4 pt-2 border-t border-slate-100">
            <div>
              <label htmlFor="asg-deadline" className="block text-sm font-medium text-slate-900 mb-1">Svarsdeadline</label>
              <input id="asg-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              <p className="text-xs text-slate-500 mt-1">Tomt = 5 arbetsdagar</p>
            </div>
            <button
              type="button"
              disabled={busy || picked.size === 0}
              onClick={assign}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg"
            >
              Skicka till valda lärosäten{picked.size > 0 && ` (${picked.size})`}
            </button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Interna anteckningar</h3>
          <p className="text-xs text-slate-500">Syns bara för administratörer.</p>
          <textarea
            rows={3}
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            aria-label="Ny anteckning"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <button type="button" disabled={busy || !noteText.trim()} onClick={addNote} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg">
            Spara anteckning
          </button>
          <ul className="space-y-3">
            {notes.map(n => (
              <li key={n.id} className="rounded-lg bg-slate-50 p-3">
                <p className="text-sm text-slate-900 whitespace-pre-line">{n.body}</p>
                <p className="text-xs text-slate-500 mt-1">{fmtDateTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Tidslinje</h3>
          <ol className="space-y-3 border-l border-slate-200 ml-1.5">
            {events.map(e => (
              <li key={e.id} className="pl-4 relative">
                <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-600" aria-hidden="true" />
                <p className="text-sm text-slate-900">{describeEvent(e, providerName)}</p>
                <p className="text-xs text-slate-500">
                  {fmtDateTime(e.created_at)} · {e.actor_role} · {e.visible_to_buyer ? 'syns för köparen' : 'internt'}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
