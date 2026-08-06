import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import * as XLSX from 'xlsx';
import { ArrowLeft, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, Category } from '../../../lib/supabase';
import { ParsedCourseRow, buildParsedRow, fromExcelRow } from '../../../lib/courseImport';
import { CourseImportPreview } from './CourseImportPreview';

const TEMPLATE_HEADERS = [
  'Titel', 'Beskrivning', 'Kurskod', 'Kategori', 'Format', 'Längd', 'Poäng (hp)',
  'Målgrupp', 'Typ', 'Lärandemål', 'Lärare namn', 'Lärare titel', 'Lärare bio',
];

const TEMPLATE_EXAMPLE_ROW = [
  'Digital Marknadsföring för Chefer', 'En kurs i modern digital marknadsföring.', 'DM101',
  'Digital Transformation', 'online', '4 veckor', 6, 'Marknadschefer och digitala strateger.',
  'scheduled', 'Förstå digitala kanaler|Bygga en marknadsplan', 'Anna Karlsson',
  'Adjunkt i Marknadsföring', 'Anna har 15 års erfarenhet av digital marknadsföring.',
];

export function ProviderCourseExcelImportPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<ParsedCourseRow[] | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(true);

  useEffect(() => {
    supabase.from('categories').select('*').order('name').then(({ data }) => {
      if (data) setCategories(data);
      setLoadingCategories(false);
    });
  }, []);

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW]);
    XLSX.utils.book_append_sheet(wb, ws, 'Kurser');
    XLSX.writeFile(wb, 'kursmall.xlsx');
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        if (parsed.length === 0) {
          toast.error('Hittade inga rader i filen');
          return;
        }
        const parsedRows = parsed.map((r) => buildParsedRow(fromExcelRow(r), categories));
        setRows(parsedRows);
      } catch (err) {
        console.error(err);
        toast.error('Kunde inte läsa filen', { description: 'Kontrollera att den är en giltig .xlsx-fil.' });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/provider/courses')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Importera kurser från Excel</h1>
          <p className="text-slate-600">Ladda ner mallen, fyll i dina kurser och ladda upp filen igen.</p>
        </div>
      </div>

      {!rows ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Download className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">1. Ladda ner mallen</h3>
              <p className="text-sm text-slate-600 mb-3">
                Fyll i en rad per kurs. Kategori måste matcha en av de befintliga kategorierna i katalogen exakt (t.ex. "Ledarskap").
                Kurser importeras som utkast — du publicerar dem manuellt efter granskning.
              </p>
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors font-medium text-sm"
              >
                <Download className="w-4 h-4" />
                Ladda ner kursmall.xlsx
              </button>
            </div>
          </div>

          <div className="flex items-start gap-4 pt-6 border-t border-slate-100">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900 mb-1">2. Ladda upp den ifyllda filen</h3>
              <p className="text-sm text-slate-600 mb-3">Väljer du en fil visas en förhandsgranskning innan något sparas.</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile}
                disabled={loadingCategories}
                className="block text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:font-medium file:cursor-pointer hover:file:bg-blue-700"
              />
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
