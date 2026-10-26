import { useSearchParams } from 'react-router';

// Platshållare för Paket D (formulär, utkast, auth). Visar bara den sökkontext
// som katalogen skickar med, så överlämningen från sökningen kan verifieras.
export function RequestCustomTrainingPage() {
  const [params] = useSearchParams();
  const rows = ['q', 'source', 'category', 'format', 'provider', 'via']
    .map(key => [key, params.get(key)] as const)
    .filter(([, value]) => value);

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Efterfråga anpassad utbildning</h1>
      <p className="text-slate-600 mb-6">Formuläret byggs i nästa paket.</p>
      <dl className="bg-white rounded-xl border border-slate-200 p-6 text-sm space-y-2">
        {rows.map(([key, value]) => (
          <div key={key} className="flex gap-3">
            <dt className="w-24 text-slate-500">{key}</dt>
            <dd className="text-slate-900 break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
