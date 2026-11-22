import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { getMyReport, type SavedReportRow, type SkiReportSnapshot } from '../../../lib/skiReports';
import { ResultsView } from '../kompetensindex/ResultsView';

// En sparad rapport, visad som den sparades. Kräver inloggning; RLS gör att bara ägaren kan läsa den.
export function SavedReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<{ row: SavedReportRow; snapshot: SkiReportSnapshot } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user || !id) return;
    let active = true;
    getMyReport(id)
      .then((r) => active && setData(r))
      .catch((e) => active && setError(e?.message ?? 'Kunde inte hämta rapporten'));
    return () => { active = false; };
  }, [id, user, authLoading]);

  useEffect(() => { document.title = 'Sparad rapport – Uppdragsutbildning.nu'; }, []);

  const shell = (children: React.ReactNode) => (
    <div className="ub-theme px-5 py-16 min-h-[60vh]"><div className="max-w-[560px] mx-auto text-center">{children}</div></div>
  );

  if (authLoading) return shell(<p className="text-sm text-[var(--fg-muted)]">Laddar…</p>);
  if (!user) {
    return shell(
      <>
        <p className="font-semibold text-[var(--fg)] mb-2">Logga in för att se rapporten</p>
        <Link to="/konto?tab=rapporter" className="text-[var(--accent)] hover:underline text-sm">Gå till Mitt konto</Link>
      </>
    );
  }
  if (error) return shell(<p className="text-sm text-red-600">{error}</p>);
  if (data === undefined) return shell(<p className="text-sm text-[var(--fg-muted)]">Laddar rapporten…</p>);
  if (data === null) {
    return shell(
      <>
        <p className="font-semibold text-[var(--fg)] mb-2">Rapporten hittades inte</p>
        <Link to="/konto?tab=rapporter" className="text-[var(--accent)] hover:underline text-sm">Till dina sparade rapporter</Link>
      </>
    );
  }

  return (
    <div className="ub-theme">
      <div className="max-w-4xl mx-auto px-5 sm:px-6 pt-6">
        <Link to="/konto?tab=rapporter" className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />Mina rapporter
        </Link>
        <p className="text-xs text-[var(--fg-subtle)] mt-2">
          Sparad {new Date(data.row.created_at).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
      <ResultsView result={data.snapshot.result} savedSnapshot={data.snapshot} savedAt={data.row.created_at} onReset={() => navigate('/kompetensanalys')} />
    </div>
  );
}
