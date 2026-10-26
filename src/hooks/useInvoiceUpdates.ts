import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// "Nytt"-markering för fakturaunderlag hos lärosäte och köpare. Lässtatus sparas lokalt per
// webbläsare och roll (en tidsstämpel per underlag). Ett underlag är nytt när rollens senaste
// synliga händelse (last_event_at från databasen) är nyare än senaste besöket.
// TODO: flytta till databasen om markeringen ska följa med mellan enheter.

export type InvoiceScope = 'provider' | 'buyer';

const SEEN_EVENT = 'ub:invoice-seen';

type SeenMap = Record<string, string>;

const key = (scope: InvoiceScope, userId: string) => `ub.invoiceSeen.v1.${scope}.${userId}`;

export function readInvoiceSeen(scope: InvoiceScope, userId: string): SeenMap {
  try {
    return JSON.parse(localStorage.getItem(key(scope, userId)) ?? '{}') as SeenMap;
  } catch {
    return {};
  }
}

export function markInvoiceSeen(scope: InvoiceScope, userId: string, basisId: string, upToIso: string | null): void {
  if (!upToIso) return;
  try {
    const seen = readInvoiceSeen(scope, userId);
    if (seen[basisId] && seen[basisId] >= upToIso) return;
    seen[basisId] = upToIso;
    localStorage.setItem(key(scope, userId), JSON.stringify(seen));
  } catch {
    // localStorage blockerat: markeringen försvinner vid omladdning, inget mer.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

export function isInvoiceUnread(lastEventAt: string | null, seenAt: string | undefined): boolean {
  return !!lastEventAt && (!seenAt || lastEventAt > seenAt);
}

interface Row {
  basis_id: string;
  last_event_at: string | null;
}

// Antal olästa underlag, för märken i menyn. Provider-vyn skickar med vald leverantör
// (admin som förhandsgranskar); för vanliga leverantörer ignoreras den i databasen.
export function useInvoiceUnreadCount(scope: InvoiceScope, providerId?: string) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const userId = user?.id;

  const refresh = useCallback(async () => {
    if (!userId || (scope === 'provider' && !providerId)) {
      setCount(0);
      return;
    }
    const { data, error } =
      scope === 'provider'
        ? await supabase.rpc('provider_list_invoicing', { p_provider_id: providerId })
        : await supabase.rpc('buyer_list_invoices');
    if (error || !data) return;
    const seen = readInvoiceSeen(scope, userId);
    setCount((data as Row[]).filter(r => isInvoiceUnread(r.last_event_at, seen[r.basis_id])).length);
  }, [scope, providerId, userId]);

  useEffect(() => {
    refresh();
    window.addEventListener(SEEN_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(SEEN_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return count;
}
