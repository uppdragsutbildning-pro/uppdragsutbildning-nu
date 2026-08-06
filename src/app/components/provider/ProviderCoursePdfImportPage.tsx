import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, Category } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { ParsedCourseRow, buildParsedRow, fromExtractedCourse } from '../../../lib/courseImport';
import { CourseImportPreview } from './CourseImportPreview';

const MAX_SIZE_BYTES = 15 * 1024 * 1024;

export function ProviderCoursePdfImportPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<ParsedCourseRow[] | null>(null);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    supabase.from('categories').select('*').order('name').then(({ data }) => {
      if (data) setCategories(data);
    });
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile?.provider_id) return;

    if (file.type !== 'application/pdf') {
      toast.error('Endast PDF-filer stöds');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('Filen är för stor', { description: 'Max 15MB per broschyr.' });
      return;
    }

    setExtracting(true);
    try {
      // Bygg lagringsnyckeln utan originalfilnamnet — Supabase Storage
      // avvisar mellanslag och icke-ASCII-tecken (t.ex. ä/å/ö) i nycklar.
      const extensionMatch = file.name.match(/\.[a-zA-Z0-9]+$/);
      const extension = extensionMatch ? extensionMatch[0] : '.pdf';
      const storagePath = `${profile.provider_id}/${crypto.randomUUID()}${extension}`;
      const { error: uploadError } = await supabase.storage.from('course-brochures').upload(storagePath, file);
      if (uploadError) throw uploadError;

      const res = await fetch('/api/extract-course-from-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Extraktionen misslyckades');

      const courses = Array.isArray(json.courses) ? json.courses : [];
      if (courses.length === 0) {
        toast.error('Hittade inga kurser i broschyren');
        return;
      }
      setRows(courses.map((c: Record<string, unknown>) => buildParsedRow(fromExtractedCourse(c), categories)));
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte extrahera kurser', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/provider/courses')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Importera kurser från PDF</h1>
          <p className="text-slate-600">Ladda upp en kursbroschyr — vi läser av innehållet automatiskt.</p>
        </div>
      </div>

      {!rows ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900 mb-1">Ladda upp en PDF-broschyr</h3>
              <p className="text-sm text-slate-600 mb-4">
                AI läser broschyren och föreslår kursinformation. Innehåller den flera kurser identifieras alla.
                Granska alltid innehållet noga innan du publicerar — kurser importeras som utkast. Max 15MB.
              </p>
              {extracting ? (
                <div className="flex items-center gap-2 text-slate-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Läser broschyren, det kan ta en stund…
                </div>
              ) : (
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFile}
                  className="block text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:font-medium file:cursor-pointer hover:file:bg-blue-700"
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        <CourseImportPreview
          rows={rows}
          categories={categories}
          onRowsChange={setRows}
          onDone={() => navigate('/provider/courses')}
        />
      )}
    </div>
  );
}
