import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, Category } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { ParsedCourseRow, buildParsedRow, fromExtractedCourse } from '../../../lib/courseImport';
import { CourseImportPreview } from './CourseImportPreview';

// Importera kurser från en länk: servern hämtar sidan och AI föreslår kursinformation, som visas i
// samma förhandsgranskning som PDF- och Excel-importen. Inget sparas förrän leverantören har granskat
// raderna och klickat på importera, och kurserna blir utkast.

export function ProviderCourseUrlImportPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<ParsedCourseRow[] | null>(null);
  const [url, setUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('categories').select('*').order('name').then(({ data }) => {
      if (data) setCategories(data);
    });
  }, []);

  async function handleFetch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || !profile?.provider_id) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error('Länken ska börja med https://');
      return;
    }

    setExtracting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Du är inte inloggad');

      const res = await fetch('/api/extract-course-from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Extraktionen misslyckades');

      const courses = Array.isArray(json.courses) ? json.courses : [];
      if (courses.length === 0) {
        toast.error('Hittade inga kurser på sidan', { description: 'Kontrollera att länken går till en sida som beskriver en kurs.' });
        return;
      }
      setSourceUrl(typeof json.sourceUrl === 'string' ? json.sourceUrl : trimmed);
      setRows(courses.map((c: Record<string, unknown>) => buildParsedRow(fromExtractedCourse(c), categories)));
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte hämta kursinformation', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/provider/courses')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Tillbaka till Mina kurser">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Importera kurs från länk</h1>
          <p className="text-slate-600">Klistra in en länk till en kurssida — vi läser av innehållet automatiskt.</p>
        </div>
      </div>

      {!rows ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Link2 className="w-5 h-5 text-blue-600" />
            </div>
            <form onSubmit={handleFetch} className="flex-1 space-y-4">
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Länk till kurssida</h3>
                <p className="text-sm text-slate-600">
                  AI läser sidan och föreslår kursinformation. Granska alltid innehållet noga innan du publicerar — kurser importeras som utkast.
                  Importera bara från er egen webbplats eller material ni har rätt att använda.
                </p>
              </div>
              <label className="block">
                <span className="sr-only">Länk till kurssida</span>
                <input
                  type="url"
                  required
                  value={url}
                  onChange={ev => setUrl(ev.target.value)}
                  placeholder="https://www.exempel.se/utbildning/kurs"
                  disabled={extracting}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                />
              </label>
              {extracting ? (
                <div className="flex items-center gap-2 text-slate-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Hämtar och läser sidan, det kan ta en stund…
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={!url.trim()}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  Hämta kursinformation
                </button>
              )}
              <p className="text-xs text-slate-500">
                Fungerar för sidor som visar sin text direkt. Sidor som kräver inloggning eller bygger sitt innehåll med JavaScript kan inte läsas. Använd då PDF- eller Excel-import.
              </p>
            </form>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {sourceUrl && (
            <p className="text-sm text-slate-600">
              Hämtat från <span className="font-medium text-slate-800 break-all">{sourceUrl}</span>
            </p>
          )}
          <CourseImportPreview rows={rows} categories={categories} onRowsChange={setRows} onDone={() => navigate('/provider/courses')} />
        </div>
      )}
    </div>
  );
}
