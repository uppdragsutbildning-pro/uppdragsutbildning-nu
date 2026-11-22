import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { bandFor } from '../../../lib/kompetensindexReport';
import { deleteMyReport, listMyReports, type SavedReportRow } from '../../../lib/skiReports';

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });

export function ReportsView({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<SavedReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listMyReports());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Kunde inte hämta rapporter');
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function remove(id: string) {
    try {
      await deleteMyReport(id);
      setRows((prev) => (prev ?? []).filter((r) => r.id !== id));
      toast.success('Rapporten är raderad');
    } catch (e: any) {
      toast.error('Kunde inte radera rapporten', { description: e?.message });
    } finally {
      setConfirmId(null);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (rows === null) return <p className="text-sm text-[var(--fg-muted)]">Laddar…</p>;

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-raised)] p-8 text-center">
        <FileText className="w-8 h-8 text-[var(--fg-subtle)] mx-auto mb-3" aria-hidden="true" />
        <p className="font-semibold text-[var(--fg)] mb-1">Du har inga sparade rapporter ännu</p>
        <p className="text-sm text-[var(--fg-muted)] mb-5 max-w-md mx-auto">
          Gör Strategiskt kompetensindex och välj &quot;Spara rapporten&quot; när du fått ditt resultat, så hittar du det här.
        </p>
        <Link to="/kompetensanalys" className="inline-flex items-center gap-2 px-5 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold rounded-[10px]">
          Gör en analys <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const b = bandFor(r.total_score);
        return (
          <li key={r.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-raised)] p-4 sm:p-5 flex flex-wrap items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0 border"
              style={{ color: b.color, backgroundColor: b.bg, borderColor: b.border }}>{r.total_score}</div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--fg)] truncate">{r.company_name}</p>
              <p className="text-sm text-[var(--fg-muted)]">
                Strategiskt kompetensindex · {b.label} kompetenstryck · {fmt(r.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {confirmId === r.id ? (
                <>
                  <span className="text-xs text-[var(--fg-muted)]">Radera permanent?</span>
                  <button type="button" onClick={() => remove(r.id)} className="px-3 py-2 rounded-[10px] bg-red-600 hover:bg-red-700 text-white text-sm font-medium">Ja, radera</button>
                  <button type="button" onClick={() => setConfirmId(null)} className="px-3 py-2 rounded-[10px] border border-[var(--border)] text-sm text-[var(--fg-muted)]">Avbryt</button>
                </>
              ) : (
                <>
                  <Link to={`/konto/rapport/${r.id}`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold">
                    Öppna <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                  <button type="button" onClick={() => setConfirmId(r.id)} aria-label={`Radera rapporten för ${r.company_name}`}
                    className="p-2 rounded-[10px] border border-[var(--border)] text-[var(--fg-subtle)] hover:text-red-600 hover:border-red-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
