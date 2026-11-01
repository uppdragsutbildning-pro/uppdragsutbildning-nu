import { Link, useLocation } from 'react-router';
import { useProviderContext } from '../../../contexts/ProviderContext';

// Flikar för menyvalet Förfrågningar: nya efterfrågningar som skickats till lärosätet (steg 1,
// läs och välj att svara) och offerter/förfrågningar (steg 2, skriv offerten). Två sidor, ett menyval.
const TABS = [
  { path: '/provider/efterfragningar', label: 'Nya efterfrågningar' },
  { path: '/provider/requests', label: 'Offerter och förfrågningar' },
];

export function ProviderRequestsTabs() {
  const { pathname } = useLocation();
  const { newAssignments, newRequests } = useProviderContext();
  const counts: Record<string, number> = {
    '/provider/efterfragningar': newAssignments,
    '/provider/requests': newRequests,
  };

  return (
    <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Förfrågningar">
      {TABS.map(tab => {
        const active = pathname === tab.path;
        const count = counts[tab.path] ?? 0;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            role="tab"
            aria-selected={active}
            className={`px-4 py-2.5 text-sm -mb-px border-b-2 transition-colors ${
              active
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-green-600 text-white text-xs font-medium">
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
