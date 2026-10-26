import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// "Nytt"-markering för Mina efterfrågningar. Lässtatus sparas lokalt per webbläsare
// (en tidsstämpel per efterfrågan). TODO: flytta till databasen om den ska följa med mellan enheter.

const SEEN_KEY = 'ub.trainingRequestSeen.v1';
const SEEN_EVENT = 'ub:training-requests-seen';

export interface BuyerEventRow {
  request_id: string;
  event_type: string;
  created_at: string;
}

type SeenMap = Record<string, string>;

export function readSeen(): SeenMap {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as SeenMap;
  } catch {
    return {};
  }
}

export function markRequestSeen(requestId: string, upToIso: string): void {
  try {
    const seen = readSeen();
    if (seen[requestId] && seen[requestId] >= upToIso) return;
    seen[requestId] = upToIso;
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // localStorage blockerat: markeringen försvinner vid omladdning, inget mer.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

// Efterfrågningar med en köparsynlig händelse (utöver 'submitted') som är nyare än senaste besök.
export function unreadRequestIds(events: BuyerEventRow[], seen: SeenMap): Set<string> {
  const latest = new Map<string, string>();
  for (const e of events) {
    if (e.event_type === 'submitted') continue;
    const cur = latest.get(e.request_id);
    if (!cur || e.created_at > cur) latest.set(e.request_id, e.created_at);
  }
  const unread = new Set<string>();
  for (const [id, ts] of latest) {
    if (!seen[id] || ts > seen[id]) unread.add(id);
  }
  return unread;
}

export function useTrainingRequestUpdates() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const userId = user?.id;

  const refresh = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    const { data, error } = await supabase
      .from('training_request_events')
      .select('request_id, event_type, created_at, training_requests!inner(buyer_user_id)')
      .eq('training_requests.buyer_user_id', userId);
    if (error || !data) return;
    setUnreadCount(unreadRequestIds(data as unknown as BuyerEventRow[], readSeen()).size);
  }, [userId]);

  useEffect(() => {
    refresh();
    window.addEventListener(SEEN_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(SEEN_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return { unreadCount, refresh };
}
