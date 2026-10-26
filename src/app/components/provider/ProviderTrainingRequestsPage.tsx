import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Building2, Calendar, Clock, Inbox, Sparkles, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useProviderContext } from '../../../contexts/ProviderContext';
import { supabase } from '../../../lib/supabaseClient';

type AssignmentStatus = 'assigned' | 'viewed' | 'declined' | 'quoted' | 'withdrawn';

interface Assignment {
  id: string;
  request_id: string;
  status: AssignmentStatus;
  response_deadline: string;
  viewed_at: string | null;
  responded_at: string | null;
  quote_request_id: string | null;
  decline_reason: string | null;
  created_at: string;
  training_requests: {
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
  } | null;
}

const ASSIGNMENTS_CHANGED = 'ub:provider-assignments-changed';

export function notifyAssignmentsChanged() {
  window.dispatchEvent(new Event(ASSIGNMENTS_CHANGED));
}

export const ASSIGNMENTS_CHANGED_EVENT = ASSIGNMENTS_CHANGED;

const FORMAT_LABEL: Record<string, string> = {
  on_site: 'På plats',
  remote: 'Distans',
  hybrid: 'Hybrid',
  flexible: 'Flexibelt',
};

const DECLINE_REASONS = [
  'Passar inte vårt utbud',
  'Ingen kapacitet under önskad period',
  'Fel målgrupp eller nivå',
  'För kort framförhållning',
  'Annat',
];

type Filter = 'all' | 'open' | 'done';

function statusMeta(a: Assignment): { label: string; className: string } {
  switch (a.status) {
    case 'assigned':
      return { label: 'Ny', className: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'viewed':
      return a.quote_request_id
        ? { label: 'Offert påbörjad', className: 'bg-amber-50 text-amber-700 border-amber-200' }
        : { label: 'Läst', className: 'bg-slate-50 text-slate-700 border-slate-200' };
    case 'quoted':
      return { label: 'Offert lämnad', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'declined':
      return { label: 'Avböjd', className: 'bg-red-50 text-red-700 border-red-200' };
    default:
      return { label: a.status, className: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
}

const isOpen = (a: Assignment) => a.status === 'assigned' || a.status === 'viewed';
const isOverdue = (a: Assignment) => isOpen(a) && new Date(a.response_deadline).getTime() < Date.now();
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');
const deadlineText = (a: Assignment) =>
  isOpen(a)
    ? `${isOverdue(a) ? 'Deadline passerad ' : 'Svara senast '}${fmtDate(a.response_deadline)}`
    : a.responded_at
      ? `Besvarad ${fmtDate(a.responded_at)}`
      : '';

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export function ProviderTrainingRequestsPage() {
  const { selectedProviderId, isAdmin } = useProviderContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  const [declining, setDeclining] = useState(false);
  const [reasonPreset, setReasonPreset] = useState(DECLINE_REASONS[0]);
  const [reasonText, setReasonText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!selectedProviderId) {
      setAssignments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [aRes, oRes] = await Promise.all([
      supabase
        .from('training_request_assignments')
        .select(
          'id, request_id, status, response_deadline, viewed_at, responded_at, quote_request_id, decline_reason, created_at, training_requests(title, description, learning_goals, target_group, participant_count, delivery_format, location, desired_start, budget_range, ssyk_skills)'
        )
        .eq('provider_id', selectedProviderId)
        .neq('status', 'withdrawn')
        .order('created_at', { ascending: false }),
      supabase.rpc('provider_assignment_buyers', { p_provider_id: selectedProviderId }),
    ]);
    if (aRes.error) {
      toast.error('Kunde inte ladda efterfrågningar');
    } else {
      setAssignments((aRes.data ?? []) as unknown as Assignment[]);
    }
    const names: Record<string, string> = {};
    for (const row of (oRes.data ?? []) as { assignment_id: string; organization_name: string | null }[]) {
      if (row.organization_name) names[row.assignment_id] = row.organization_name;
    }
    setOrgNames(names);
    setLoading(false);
  }, [selectedProviderId]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(() => assignments.find(a => a.id === selectedId) ?? null, [assignments, selectedId]);

  // Att öppna detaljvyn markerar tilldelningen som läst (no-op för admin).
  useEffect(() => {
    if (!selected || selected.status !== 'assigned' || isAdmin) return;
    let active = true;
    (async () => {
      const { error } = await supabase.rpc('provider_mark_viewed', { p_assignment_id: selected.id });
      if (!active || error) return;
      setAssignments(prev => prev.map(a => (a.id === selected.id ? { ...a, status: 'viewed' } : a)));
      notifyAssignmentsChanged();
    })();
    return () => {
      active = false;
    };
  }, [selected?.id, selected?.status, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = assignments.filter(a => filter === 'all' || (filter === 'open' ? isOpen(a) : !isOpen(a)));

  function openDetail(id: string) {
    setDeclining(false);
    setSearchParams({ id });
  }

  async function handleQuote(a: Assignment) {
    setBusy(true);
    const { data, error } = await supabase.rpc('provider_respond_with_quote', { p_assignment_id: a.id });
    setBusy(false);
    if (error) {
      toast.error('Kunde inte starta offert', { description: error.message });
      return;
    }
    notifyAssignmentsChanged();
    navigate(`/provider/requests?open=${data as string}`);
  }

  async function handleDecline(a: Assignment) {
    const text = reasonText.trim();
    if (reasonPreset === 'Annat' && !text) {
      toast.error('Beskriv anledningen');
      return;
    }
    const reason = reasonPreset === 'Annat' ? text : text ? `${reasonPreset}: ${text}` : reasonPreset;
    setBusy(true);
    const { error } = await supabase.rpc('provider_decline', { p_assignment_id: a.id, p_reason: reason });
    setBusy(false);
    if (error) {
      toast.error('Kunde inte avböja', { description: error.message });
      return;
    }
    toast.success('Du har avböjt efterfrågan');
    setDeclining(false);
    setReasonText('');
    setReasonPreset(DECLINE_REASONS[0]);
    notifyAssignmentsChanged();
    load();
  }

  const newCount = assignments.filter(a => a.status === 'assigned').length;

  if (selected) {
    const r = selected.training_requests;
    const meta = statusMeta(selected);
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setSearchParams({})}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> Tillbaka till efterfrågningar
        </button>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-slate-900">{r?.title}</h1>
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${meta.className}`}>{meta.label}</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                <Sparkles className="w-3 h-3" /> Anpassad efterfrågan
              </span>
            </div>
            <p className="text-sm text-slate-600 flex flex-wrap gap-x-5 gap-y-1">
              {orgNames[selected.id] && (
                <span className="inline-flex items-center gap-1.5"><Building2 className="w-4 h-4 text-slate-400" />{orgNames[selected.id]}</span>
              )}
              <span className={`inline-flex items-center gap-1.5 ${isOverdue(selected) ? 'text-red-600 font-medium' : ''}`}>
                <Clock className="w-4 h-4" />
                {deadlineText(selected)}
              </span>
            </p>
          </div>

          <div>
            <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">Behov</h2>
            <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-line">{r?.description}</p>
          </div>

          <dl className="grid sm:grid-cols-3 gap-4">
            <Field label="Mål" value={r?.learning_goals} />
            <Field label="Målgrupp" value={r?.target_group} />
            <Field label="Antal deltagare" value={r?.participant_count} />
            <Field label="Genomförande" value={r ? FORMAT_LABEL[r.delivery_format] ?? r.delivery_format : null} />
            <Field label="Ort" value={r?.location} />
            <Field label="Önskad period" value={r?.desired_start} />
            <Field label="Budgetram" value={r?.budget_range} />
            <Field label="Kompetensområden" value={r?.ssyk_skills?.map(s => s.title).join(', ')} />
          </dl>

          {selected.status === 'declined' && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-4 text-sm text-red-800">
              Du avböjde {selected.responded_at ? fmtDate(selected.responded_at) : ''}
              {selected.decline_reason ? `: ${selected.decline_reason}` : ''}
            </div>
          )}

          {selected.quote_request_id && (
            <button
              type="button"
              onClick={() => navigate(`/provider/requests?open=${selected.quote_request_id}`)}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg"
            >
              {selected.status === 'quoted' ? 'Visa offert' : 'Fortsätt offert'}
            </button>
          )}

          {isOpen(selected) && !selected.quote_request_id && !isAdmin && !declining && (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleQuote(selected)}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg"
              >
                Lämna offert
              </button>
              <button
                type="button"
                onClick={() => setDeclining(true)}
                className="px-5 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg"
              >
                Avböj
              </button>
            </div>
          )}

          {isAdmin && isOpen(selected) && (
            <p className="text-sm text-slate-500">Som administratör kan du granska men inte svara åt leverantören.</p>
          )}

          {declining && isOpen(selected) && (
            <div className="rounded-lg border border-slate-200 p-4 space-y-4">
              <div>
                <label htmlFor="decline-reason" className="block text-sm font-medium text-slate-900 mb-1.5">Anledning</label>
                <select
                  id="decline-reason"
                  value={reasonPreset}
                  onChange={e => setReasonPreset(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {DECLINE_REASONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="decline-text" className="block text-sm font-medium text-slate-900 mb-1.5">
                  {reasonPreset === 'Annat' ? 'Beskriv anledningen' : 'Kommentar (valfritt)'}
                </label>
                <textarea
                  id="decline-text"
                  rows={3}
                  value={reasonText}
                  onChange={e => setReasonText(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-slate-500">Anledningen visas för administratören, inte för köparen.</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setDeclining(false)} className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm rounded-lg">
                  Avbryt
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDecline(selected)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg"
                >
                  Bekräfta avböjande
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Efterfrågningar</h1>
        <p className="text-slate-600">Anpassade utbildningar som vi har skickat till er. {newCount > 0 && <strong>{newCount} nya.</strong>}</p>
      </div>

      <div className="flex gap-2" role="tablist">
        {([['all', 'Alla'], ['open', 'Att svara på'], ['done', 'Besvarade']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-lg text-sm border transition-colors ${filter === key ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Inga efterfrågningar</h3>
          <p className="text-slate-600">När vi skickar en anpassad efterfrågan till er dyker den upp här.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map(a => {
            const meta = statusMeta(a);
            const isNew = a.status === 'assigned';
            const overdue = isOverdue(a);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => openDetail(a.id)}
                  className={`w-full text-left bg-white border rounded-xl p-5 hover:shadow-md transition-shadow ${isNew ? 'border-blue-300' : 'border-slate-200'}`}
                >
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    {isNew && <span className="w-2 h-2 rounded-full bg-blue-600" aria-label="Oläst" />}
                    <h3 className={`text-base text-slate-900 ${isNew ? 'font-bold' : 'font-semibold'}`}>{a.training_requests?.title}</h3>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${meta.className}`}>{meta.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                    {orgNames[a.id] && <span className="inline-flex items-center gap-1.5"><Building2 className="w-4 h-4 text-slate-400" />{orgNames[a.id]}</span>}
                    {a.training_requests?.participant_count && (
                      <span className="inline-flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-400" />{a.training_requests.participant_count} deltagare</span>
                    )}
                    <span className={`inline-flex items-center gap-1.5 ${overdue ? 'text-red-600 font-medium' : ''}`}>
                      <Calendar className="w-4 h-4" />
                      {deadlineText(a)}
                    </span>
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
