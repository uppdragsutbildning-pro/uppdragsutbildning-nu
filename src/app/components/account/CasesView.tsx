import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { markRequestSeen, readSeen, unreadRequestIds } from '../../../hooks/useTrainingRequestUpdates';
import { QuoteRequestItem, type AccountRequest } from './QuoteRequestItem';
import { TrainingRequestItem, type RequestEvent, type TrainingRequest } from './TrainingRequestsView';

const primaryButton =
  'inline-flex items-center justify-center gap-2 px-5 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white text-sm font-semibold rounded-[10px] transition-colors';

type Case =
  | { kind: 'quote'; id: string; submittedAt: string; data: AccountRequest }
  | { kind: 'custom'; id: string; submittedAt: string; data: TrainingRequest };

// Samlad lista över köparens ärenden: offertförfrågningar på en kurs (custom_requests)
// och efterfrågan på anpassad utbildning (training_requests), nyast först.
export function CasesView() {
  const [quotes, setQuotes] = useState<AccountRequest[] | null>(null);
  const [trainingRequests, setTrainingRequests] = useState<TrainingRequest[] | null>(null);
  const [events, setEvents] = useState<RequestEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [quoteRes, reqRes, evRes] = await Promise.all([
      supabase
        .from('custom_requests')
        .select(
          'id, course_topic, description, status, budget, timeline, participants_count, response, submitted_at, trainings(title, slug)'
        )
        .order('submitted_at', { ascending: false }),
      supabase.from('training_requests').select('*').order('submitted_at', { ascending: false }),
      supabase
        .from('training_request_events')
        .select('id, request_id, event_type, payload, created_at')
        .order('created_at', { ascending: true }),
    ]);
    const firstError = quoteRes.error ?? reqRes.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }
    setQuotes((quoteRes.data ?? []) as unknown as AccountRequest[]);
    setTrainingRequests((reqRes.data ?? []) as unknown as TrainingRequest[]);
    setEvents((evRes.data ?? []) as unknown as RequestEvent[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const eventsByRequest = useMemo(() => {
    const map = new Map<string, RequestEvent[]>();
    for (const e of events) map.set(e.request_id, [...(map.get(e.request_id) ?? []), e]);
    return map;
  }, [events]);

  // expanded ingår så att "Nytt" släcks direkt när ärendet öppnas.
  const unread = useMemo(() => unreadRequestIds(events, readSeen()), [events, expanded]);

  const cases = useMemo<Case[] | null>(() => {
    if (quotes === null || trainingRequests === null) return null;
    return [
      ...quotes.map((d): Case => ({ kind: 'quote', id: d.id, submittedAt: d.submitted_at, data: d })),
      ...trainingRequests.map((d): Case => ({ kind: 'custom', id: d.id, submittedAt: d.submitted_at, data: d })),
    ].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [quotes, trainingRequests]);

  function toggle(c: Case) {
    if (expanded === c.id) {
      setExpanded(null);
      return;
    }
    setExpanded(c.id);
    if (c.kind === 'custom') {
      const latest = (eventsByRequest.get(c.id) ?? []).at(-1)?.created_at;
      if (latest) markRequestSeen(c.id, latest);
    }
  }

  if (error) {
    return (
      <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl p-6">
        <p className="text-sm text-red-700">Kunde inte hämta ärenden: {error}</p>
      </div>
    );
  }

  if (cases === null) return <p className="text-sm text-[var(--fg-muted)]">Laddar…</p>;

  if (cases.length === 0) {
    return (
      <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl p-6 sm:p-8">
        <p className="text-[15px] font-medium text-[var(--fg)] mb-1">Inga ärenden ännu</p>
        <p className="text-sm text-[var(--fg-muted)] mb-5">
          Offertförfrågningar och efterfrågan på anpassad utbildning följer ni här, med status, offerter och svar.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/catalog" className={primaryButton}>
            Sök utbildning <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          <Link
            to="/efterfraga"
            className="inline-flex items-center px-5 py-3 text-sm font-semibold rounded-[10px] border border-[var(--border)] bg-white text-[var(--fg)] hover:bg-[var(--bg-raised)]"
          >
            Efterfråga anpassad utbildning
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {cases.map(c =>
        c.kind === 'quote' ? (
          <QuoteRequestItem
            key={`q-${c.id}`}
            request={c.data}
            open={expanded === c.id}
            onToggle={() => toggle(c)}
            typeLabel="Offertförfrågan"
          />
        ) : (
          <TrainingRequestItem
            key={`t-${c.id}`}
            request={c.data}
            events={eventsByRequest.get(c.id) ?? []}
            unread={unread.has(c.id)}
            open={expanded === c.id}
            onToggle={() => toggle(c)}
            onChanged={load}
            typeLabel="Anpassad utbildning"
          />
        )
      )}
    </ul>
  );
}
