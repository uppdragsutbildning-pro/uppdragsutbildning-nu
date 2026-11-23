import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle, AlertCircle, Loader2, Sparkles, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import {
  ParsedCourseRow,
  SimpleCategory,
  revalidateRow,
  toTrainingInsertPayload,
} from '../../../lib/courseImport';
import { generateUniqueTrainingSlug } from '../../../lib/slug';
import { MAX_COURSE_SKILLS, suggestCourseSkills, type CourseSkillSuggestion, type CourseSkillTag } from '../../../lib/courseSkills';
import { CourseSkillsField } from './CourseSkillsField';

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
  // Kompetensförslag per rad. Inget läggs till förrän leverantören själv godkänner.
  const [suggestions, setSuggestions] = useState<Record<string, CourseSkillSuggestion[]>>({});
  const [suggesting, setSuggesting] = useState<{ done: number; total: number } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const includedRows = rows.filter((r) => r._include && r._errors.length === 0);
  const includedCount = includedRows.length;
  const withoutSkills = includedRows.filter((r) => r.skills.length === 0).length;

  function updateSkills(id: string, skills: CourseSkillTag[]) {
    onRowsChange(rows.map((r) => (r._id === id ? { ...r, skills } : r)));
  }

  // Hämtar förslag för alla valda kurser, två i taget. Förslagen visas per kurs och läggs inte till automatiskt.
  async function suggestAll() {
    const targets = includedRows.filter((r) => !suggestions[r._id]);
    if (targets.length === 0) { toast.message('Det finns redan förslag för alla valda kurser.'); return; }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { toast.error('Du är inte inloggad'); return; }
    setSuggesting({ done: 0, total: targets.length });
    let done = 0;
    let failed = 0;
    const queue = [...targets];
    const worker = async () => {
      while (queue.length) {
        const row = queue.shift()!;
        try {
          const list = await suggestCourseSkills(
            { title: row.title, description: row.description, targetAudience: row.targetAudience, learningOutcomes: row.learningOutcomes },
            token
          );
          setSuggestions((prev) => ({ ...prev, [row._id]: list }));
        } catch {
          failed += 1;
        }
        done += 1;
        setSuggesting({ done, total: targets.length });
      }
    };
    await Promise.all([worker(), worker()]);
    setSuggesting(null);
    if (failed > 0) toast.error(`Kunde inte hämta förslag för ${failed} kurs${failed !== 1 ? 'er' : ''}. Prova igen eller granska dem en och en.`);
  }

  // Lägger till de säkraste förslagen (begreppets namn motsvarar det AI föreslog), högst fem per kurs.
  function acceptConfident() {
    let added = 0;
    onRowsChange(
      rows.map((r) => {
        const list = suggestions[r._id];
        if (!list || r.skills.length > 0) return r;
        const picks = list.filter((t) => t.confidence === 'high').slice(0, Math.min(5, MAX_COURSE_SKILLS));
        if (picks.length === 0) return r;
        added += 1;
        return { ...r, skills: picks.map((t) => ({ id: t.id, title: t.title, source: t.source, origin: 'ai' as const })) };
      })
    );
    toast.success(added > 0 ? `Säkra förslag lades till på ${added} kurs${added !== 1 ? 'er' : ''}. Granska gärna dem.` : 'Inga kurser hade säkra förslag att lägga till.');
  }

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

  function updateField(id: string, patch: Partial<Pick<ParsedCourseRow, 'format' | 'trainingType'>>) {
    onRowsChange(
      rows.map((r) => {
        if (r._id !== id) return r;
        const updated = revalidateRow({ ...r, ...patch });
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
      // Genereras en rad i taget (inte parallellt) så att varje slug-koll ser
      // de rader som redan hunnit sparas tidigare i samma import.
      const slug = await generateUniqueTrainingSlug(row.title);
      const { error } = await supabase.from('trainings').insert(toTrainingInsertPayload(row, profile.provider_id, slug));
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
        {withoutSkills > 0 && (
          <div className="text-left bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
            <p className="font-medium mb-1">{withoutSkills} kurs{withoutSkills !== 1 ? 'er' : ''} saknar kompetenser</p>
            <p>Kurser utan kompetenser kan inte matchas mot köparnas behov i Strategiskt kompetensindex. <Link to="/provider/courses/skills" className="underline font-medium">Lägg till kompetenser nu</Link>.</p>
          </div>
        )}
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
      <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Tags className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-slate-900 text-sm">Kompetenser för matchning</p>
            <p className="text-xs text-slate-600 max-w-xl">
              Kurser med kompetenser kan rekommenderas till köpare i Strategiskt kompetensindex. Hämta förslag, granska dem per kurs och godkänn. Inget läggs till utan att du bekräftar.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={suggestAll} disabled={!!suggesting || includedCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 text-sm font-medium disabled:opacity-60">
            {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {suggesting ? `Hämtar förslag ${suggesting.done}/${suggesting.total}…` : 'Föreslå för alla valda kurser'}
          </button>
          {Object.keys(suggestions).length > 0 && (
            <button type="button" onClick={acceptConfident}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
              Godkänn alla säkra förslag
            </button>
          )}
        </div>
      </div>

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
              <th className="px-3 py-3 text-left font-medium text-slate-600">Kompetenser</th>
              <th className="px-3 py-3 text-left font-medium text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <Fragment key={row._id}>
              <tr className={row._errors.length > 0 ? 'bg-red-50/40' : ''}>
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
                <td className="px-3 py-3 text-slate-600">
                  {formatLabel[row.format] || (
                    <select
                      defaultValue=""
                      onChange={(e) => updateField(row._id, { format: e.target.value as ParsedCourseRow['format'] })}
                      className="border border-red-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="" disabled>Välj format</option>
                      {Object.entries(formatLabel).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-600">
                  {trainingTypeLabel[row.trainingType] || (
                    <select
                      defaultValue=""
                      onChange={(e) => updateField(row._id, { trainingType: e.target.value as ParsedCourseRow['trainingType'] })}
                      className="border border-red-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="" disabled>Välj typ</option>
                      {Object.entries(trainingTypeLabel).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-600">{row.credits}</td>
                <td className="px-3 py-3">
                  <button type="button" onClick={() => setOpenRow(openRow === row._id ? null : row._id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                      row.skills.length > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}>
                    {row.skills.length > 0 ? `${row.skills.length} valda` : suggestions[row._id] ? `${suggestions[row._id].length} förslag` : 'Saknas'}
                    <span className="text-[10px] opacity-70">{openRow === row._id ? 'Stäng' : 'Granska'}</span>
                  </button>
                </td>
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
              {openRow === row._id && (
                <tr className="bg-slate-50/60">
                  <td colSpan={8} className="px-5 py-5">
                    <CourseSkillsField
                      value={row.skills}
                      onChange={(skills) => updateSkills(row._id, skills)}
                      initialSuggestions={suggestions[row._id]}
                      getCourseText={() => ({ title: row.title, description: row.description, targetAudience: row.targetAudience, learningOutcomes: row.learningOutcomes })}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {withoutSkills > 0 && includedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <p className="font-medium">{withoutSkills} av {includedCount} valda kurser saknar kompetenser</p>
          <p className="mt-0.5">De sparas som utkast, men kan inte matchas mot köparnas behov förrän du lagt till kompetenser. Du kan komplettera dem senare under Mina kurser.</p>
        </div>
      )}

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
