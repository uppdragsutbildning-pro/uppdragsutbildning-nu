import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabaseClient';
import {
  MAX_COURSE_SKILLS, SOURCE_LABEL, searchCourseSkills, suggestCourseSkills,
  type CourseSkillTag, type SkillSuggestInput,
} from '../../../lib/courseSkills';

interface Props {
  value: CourseSkillTag[];
  onChange: (next: CourseSkillTag[]) => void;
  // Kursens text som underlag för AI-förslag.
  getCourseText: () => SkillSuggestInput;
  // Hämtar AI-förslag direkt när fältet visas (förslagen läggs aldrig till automatiskt).
  autoSuggest?: boolean;
}

const badge = (source: CourseSkillTag['source']) =>
  source === 'esco' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700';

export function CourseSkillsField({ value, onChange, getCourseText, autoSuggest = false }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourseSkillTag[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<CourseSkillTag[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const selectedIds = new Set(value.map((t) => t.id));
  const full = value.length >= MAX_COURSE_SKILLS;

  useEffect(() => {
    abortRef.current?.abort();
    if (query.trim().length < 2) { setResults([]); setSearching(false); return; }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    const timer = setTimeout(() => {
      searchCourseSkills(query, ctrl.signal)
        .then((r) => { if (!ctrl.signal.aborted) setResults(r); })
        .catch(() => { if (!ctrl.signal.aborted) setResults([]); })
        .finally(() => { if (!ctrl.signal.aborted) setSearching(false); });
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query]);

  const add = (tag: CourseSkillTag) => {
    if (selectedIds.has(tag.id)) return;
    if (full) { toast.error(`Du kan välja högst ${MAX_COURSE_SKILLS} kompetenser`); return; }
    onChange([...value, tag]);
  };
  const remove = (id: string) => onChange(value.filter((t) => t.id !== id));

  const handleSuggest = async () => {
    const input = getCourseText();
    if (!input.title.trim() && !input.description.trim()) {
      toast.error('Fyll i kursens titel och beskrivning först');
      return;
    }
    setSuggesting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Du är inte inloggad');
      const list = await suggestCourseSkills(input, token);
      setSuggestions(list.filter((t) => !selectedIds.has(t.id)));
      if (list.length === 0) toast.message('Inga förslag hittades. Sök själv i fältet ovan.');
    } catch (err) {
      toast.error('Kunde inte hämta förslag', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSuggesting(false);
    }
  };

  useEffect(() => {
    if (autoSuggest) handleSuggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shownSuggestions = suggestions.filter((t) => !selectedIds.has(t.id));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Kompetenserna används för att matcha kursen mot köparnas behov och rekommendationer. Välj de som deltagarna faktiskt utvecklar
        (högst {MAX_COURSE_SKILLS}). <span className="text-blue-700 font-medium">SSYK</span> följer Arbetsförmedlingens yrkestaxonomi,{' '}
        <span className="text-violet-700 font-medium">ESCO</span> är EU:s bredare kompetenstaxonomi.
      </p>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-900">Valda kompetenser ({value.length}/{MAX_COURSE_SKILLS})</label>
        </div>
        {value.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">Inga kompetenser valda ännu.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {value.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-slate-100 text-sm text-slate-800">
                {t.title}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge(t.source)}`}>{SOURCE_LABEL[t.source]}</span>
                <button type="button" onClick={() => remove(t.id)} aria-label={`Ta bort ${t.title}`}
                  className="w-5 h-5 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleSuggest} disabled={suggesting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-medium disabled:opacity-60">
          {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Föreslå med AI
        </button>
        <span className="text-xs text-slate-400">Förslagen baseras på kursens titel, beskrivning, målgrupp och lärandemål. Du väljer själv vilka som läggs till.</span>
      </div>

      {shownSuggestions.length > 0 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-2">Förslag, klicka för att lägga till</p>
          <div className="flex flex-wrap gap-2">
            {shownSuggestions.map((t) => (
              <button key={t.id} type="button" onClick={() => add(t)} disabled={full}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 hover:border-blue-400 text-sm text-slate-800 disabled:opacity-50">
                <Plus className="w-3 h-3 text-blue-600" />
                {t.title}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge(t.source)}`}>{SOURCE_LABEL[t.source]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-900 mb-2">Sök kompetens</label>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="t.ex. förändringsledning, projektledning, AI"
            className="w-full pl-9 pr-9 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {searching && <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />}
        </div>
        {query.trim().length >= 2 && !searching && results.length === 0 && (
          <p className="text-sm text-slate-400 mt-2">Inga träffar. Prova ett annat eller kortare ord.</p>
        )}
        {results.length > 0 && (
          <ul className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {results.map((t) => {
              const picked = selectedIds.has(t.id);
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => add(t)} disabled={picked || full}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50">
                    <span className="text-slate-800">{t.title}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge(t.source)}`}>{SOURCE_LABEL[t.source]}</span>
                      <span className="text-xs text-slate-400">{picked ? 'Vald' : 'Lägg till'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
