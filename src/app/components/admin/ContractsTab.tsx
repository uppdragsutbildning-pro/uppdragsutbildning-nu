import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { ContractPanel } from '../contracts/ContractPanel';

// Adminens Avtal: överblick över alla bokningars avtalsstatus, vems tur det är och hur länge
// det har väntat. Läser via admin_list_contracts. Detaljen återanvänder ContractPanel (admin
// ser versioner och historik och kan som undantag registrera signerad fil).

export type ContractListStatus = 'none' | 'generated' | 'negotiating' | 'agreed' | 'signed';

export interface ContractListRow {
  booking_id: string;
  booking_title: string;
  start_date: string;
  buyer_name: string;
  provider_name: string;
  contract_id: string | null;
  status: ContractListStatus;
  awaiting_party: 'buyer' | 'provider' | 'both' | null;
  awaiting_since: string | null;
  variant: string | null;
  buyer_reference: string | null;
  latest_version_no: number | null;
  version_count: number;
  buyer_approved: boolean;
  provider_approved: boolean;
  amendments_count: number;
  signed_registered_at: string | null;
  reminder_count: number;
  updated_at: string;
}

export const STUCK_AFTER_DAYS = 7;
const SOON_DAYS = 14;

const STATUS_LABEL: Record<ContractListStatus, string> = {
  none: 'Inget avtal',
  generated: 'Utkast',
  negotiating: 'Förhandling',
  agreed: 'Godkänt, väntar på signering',
  signed: 'Signerat',
};

const STATUS_BADGE: Record<ContractListStatus, string> = {
  none: 'bg-slate-100 text-slate-600 border-slate-200',
  generated: 'bg-slate-100 text-slate-700 border-slate-200',
  negotiating: 'bg-amber-100 text-amber-800 border-amber-200',
  agreed: 'bg-blue-100 text-blue-800 border-blue-200',
  signed: 'bg-green-100 text-green-700 border-green-200',
};

const WAITING_LABEL = { buyer: 'Köparen', provider: 'Lärosätet', both: 'Båda (signering)' } as const;

const days = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0);
const daysUntil = (d: string) => Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000);

export function isStuck(r: ContractListRow): boolean {
  return r.awaiting_party !== null && r.status !== 'signed' && days(r.awaiting_since) >= STUCK_AFTER_DAYS;
}

// Kursen startar snart utan signerat avtal.
export function startsSoonUnsigned(r: ContractListRow): boolean {
  const until = daysUntil(r.start_date);
  return r.status !== 'signed' && until >= 0 && until <= SOON_DAYS;
}

export function needsAttention(r: ContractListRow): boolean {
  return isStuck(r) || startsSoonUnsigned(r);
}

export function useContractsAttentionCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    supabase.rpc('admin_list_contracts').then(({ data }) => {
      if (active && data) setCount((data as ContractListRow[]).filter(needsAttention).length);
    });
    return () => {
      active = false;
    };
  }, []);
  return count;
}

export function ContractsTab() {
  const [rows, setRows] = useState<ContractListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'attention' | ContractListStatus>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_list_contracts').then(({ data, error: rpcError }) => {
      if (rpcError) setError(rpcError.message);
      else setRows((data ?? []) as ContractListRow[]);
    });
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { none: 0, generated: 0, negotiating: 0, agreed: 0, signed: 0, attention: 0 };
    for (const r of rows ?? []) {
      c[r.status] += 1;
      if (needsAttention(r)) c.attention += 1;
    }
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(r => {
      if (filter === 'attention' && !needsAttention(r)) return false;
      if (filter !== 'all' && filter !== 'attention' && r.status !== filter) return false;
      if (!q) return true;
      return [r.booking_title, r.buyer_name, r.provider_name, r.buyer_reference ?? ''].some(v => v.toLowerCase().includes(q));
    });
  }, [rows, filter, query]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Avtal</h2>
        <p className="text-sm text-slate-500">
          Överblick över avtalen för alla bokningar. Ett avtal räknas som fastnat när någon har väntat {STUCK_AFTER_DAYS} dagar eller mer.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {([
          ['attention', 'Behöver åtgärd', counts.attention],
          ['none', 'Inget avtal', counts.none],
          ['generated', 'Utkast', counts.generated],
          ['negotiating', 'Förhandling', counts.negotiating],
          ['agreed', 'Väntar på signering', counts.agreed],
          ['signed', 'Signerat', counts.signed],
        ] as const).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(filter === key ? 'all' : key)}
            aria-pressed={filter === key}
            className={`text-left bg-white border rounded-xl p-4 transition-colors ${filter === key ? 'border-blue-600 ring-1 ring-blue-600' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <div className={`text-2xl font-bold ${key === 'attention' && n > 0 ? 'text-red-600' : 'text-slate-900'}`}>{n}</div>
            <div className="text-xs text-slate-600">{label}</div>
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Sök kurs, köpare, lärosäte eller referens"
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && <p className="text-sm text-red-700">Kunde inte hämta avtal: {error}</p>}
      {!error && rows === null && <p className="text-sm text-slate-500">Laddar…</p>}
      {rows && shown.length === 0 && <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-xl p-6">Inga bokningar matchar.</p>}

      <ul className="space-y-3">
        {shown.map(r => {
          const open = expanded === r.booking_id;
          const stuck = isStuck(r);
          const soon = startsSoonUnsigned(r);
          return (
            <li key={r.booking_id} className="bg-white border border-slate-200 rounded-xl">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : r.booking_id)}
                aria-expanded={open}
                className="w-full flex items-center gap-4 p-5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-slate-900 truncate">{r.booking_title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.buyer_name} · {r.provider_name} · start {new Date(r.start_date).toLocaleDateString('sv-SE')}
                    {r.buyer_reference ? ` · ref ${r.buyer_reference}` : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.awaiting_party && r.status !== 'signed' && (
                      <span className={stuck ? 'text-red-700 font-medium' : ''}>
                        Väntar på {WAITING_LABEL[r.awaiting_party].toLowerCase()} i {days(r.awaiting_since)} dagar
                        {r.reminder_count > 0 ? ` · ${r.reminder_count} påminnelse${r.reminder_count > 1 ? 'r' : ''} skickad${r.reminder_count > 1 ? 'e' : ''}` : ''}
                      </span>
                    )}
                    {r.latest_version_no !== null && r.status !== 'signed' && (
                      <span>
                        {r.awaiting_party ? ' · ' : ''}
                        senaste version {r.latest_version_no} (köpare {r.buyer_approved ? 'godkänt' : 'ej godkänt'}, lärosäte {r.provider_approved ? 'godkänt' : 'ej godkänt'})
                      </span>
                    )}
                    {r.status === 'signed' && r.signed_registered_at && (
                      <span>
                        Signerat avtal registrerat {new Date(r.signed_registered_at).toLocaleDateString('sv-SE')}
                        {r.amendments_count > 0 ? ` · ${r.amendments_count} tillägg` : ''}
                      </span>
                    )}
                  </p>
                </div>
                {(stuck || soon) && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-red-700" title={soon ? 'Kursen startar inom 14 dagar utan signerat avtal' : 'Avtalet har fastnat'}>
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    {soon ? 'Startar snart' : 'Fastnat'}
                  </span>
                )}
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {open && (
                <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                  <ContractPanel bookingId={r.booking_id} role="admin" canEdit />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
