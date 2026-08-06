import { useState } from 'react';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import {
  ParsedCourseRow,
  SimpleCategory,
  revalidateRow,
  toTrainingInsertPayload,
} from '../../../lib/courseImport';

interface CourseImportPreviewProps {
  rows: ParsedCourseRow[];
  categories: SimpleCategory[];
  onRowsChange: (rows: ParsedCourseRow[]) => void;
  onDone: () => void;
}

const formatLabel: Record<string, string> = { online: 'Online', onsite: 'På plats', hybrid: 'Hybrid' };
const trainingTypeLabel: Record<string, string> = { custom: 'Skräddarsydd', scheduled: 'Schemalagd', both: 'Både/och' };

export function CourseImportPreview({ rows, categories, onRowsChange, onDone }: CourseImportPreviewProps) {
  const { profile } = useAuth();
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ title: string; success: boolean; error?: string }[] | null>(null);

  const includedCount = rows.filter((r) => r._include && r._errors.length === 0).length;

  function toggleInclude(id: string) {
    onRowsChange(rows.map((r) => (r._id === id ? { ...r, _include: !r._include } : r)));
  }

  function updateCategory(id: string, categoryId: string) {
    onRowsChange(
      rows.map((r) => {
        if (r._id !== id) return r;
        const category = categories.find((c) => c.id === categoryId);
        const updated = revalidateRow({ ...r, categoryId, categoryName: category?.name || r.categoryName });
        return { ...updated, _include: updated._errors.length === 0 };
      })
    );
  }

  async function handleImport() {
    if (!profile?.provider_id) {
      toast.error('Inget provider-konto kopplat till din profil');
      return;
    }
    setImporting(true);
    const outcomes: { title: string; success: boolean; error?: string }[] = [];
    for (const row of rows) {
      if (!row._include || row._errors.length > 0) continue;
      const { error } = await supabase.from('trainings').insert(toTrainingInsertPayload(row, profile.provider_id));
      outcomes.push({ title: row.title, success: !error, error: error?.message });
    }
    setResults(outcomes);
    setImporting(false);
  }

  if (results) {
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          {succeeded} kurs{succeeded !== 1 ? 'er' : ''} sparade som utkast
        </h3>
        <p className="text-slate-600 mb-4">
          Gå till "Mina kurser" och publicera dem när du har granskat innehållet.
        </p>
        {failed.length > 0 && (
          <div className="text-left bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">
            <p className="font-medium mb-1">{failed.length} kurs{failed.length !== 1 ? 'er' : ''} misslyckades:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {failed.map((f, i) => (
                <li key={i}>{f.title}: {f.error}</li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={onDone}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          Till mina kurser
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-3 text-left w-10"></th>
              <th className="px-3 py-3 text-left font-medium text-slate-600">Titel</th>
              <th className="px-3 py-3 text-left font-medium text-slate-600">Kategori</th>
              <th className="px-3 py-3 text-left font-medium text-slate-600">Format</th>
              <th className="px-3 py-3 text-left font-medium text-slate-600">Typ</th>
              <th className="px-3 py-3 text-left font-medium text-slate-600">Hp</th>
              <th className="px-3 py-3 text-left font-medium text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row._id} className={row._errors.length > 0 ? 'bg-red-50/40' : ''}>
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={row._include}
                    disabled={row._errors.length > 0}
                    onChange={() => toggleInclude(row._id)}
                    className="rounded border-slate-300"
                  />
                </td>
                <td className="px-3 py-3 font-medium text-slate-900">{row.title || <span className="text-red-500">Saknas</span>}</td>
                <td className="px-3 py-3">
                  {row.categoryId ? (
                    categories.find((c) => c.id === row.categoryId)?.name
                  ) : (
                    <select
                      defaultValue=""
                      onChange={(e) => updateCategory(row._id, e.target.value)}
                      className="border border-red-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="" disabled>
                        Välj kategori ("{row.categoryName}" hittades inte)
                      </option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-600">{formatLabel[row.format] || <span className="text-red-500">Ogiltigt</span>}</td>
                <td className="px-3 py-3 text-slate-600">{trainingTypeLabel[row.trainingType] || <span className="text-red-500">Ogiltig</span>}</td>
                <td className="px-3 py-3 text-slate-600">{row.credits}</td>
                <td className="px-3 py-3">
                  {row._errors.length === 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                      <CheckCircle className="w-3.5 h-3.5" />Giltig
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium" title={row._errors.join(', ')}>
                      <AlertCircle className="w-3.5 h-3.5" />{row._errors.join(', ')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onDone}
          className="px-5 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors font-medium"
        >
          Avbryt
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={includedCount === 0 || importing}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
        >
          {importing && <Loader2 className="w-4 h-4 animate-spin" />}
          Importera {includedCount} kurs{includedCount !== 1 ? 'er' : ''} som utkast
        </button>
      </div>
    </div>
  );
}
