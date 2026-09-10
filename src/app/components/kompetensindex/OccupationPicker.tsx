import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  fetchOccupationFields,
  searchOccupationNames,
  type OccupationField,
  type OccupationName,
} from '../../../lib/jobtechTaxonomy';

interface OccupationPickerProps {
  selected: OccupationName[];
  onChange: (selected: OccupationName[]) => void;
}

export function OccupationPicker({ selected, onChange }: OccupationPickerProps) {
  const [fields, setFields] = useState<OccupationField[]>([]);
  const [fieldId, setFieldId] = useState('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<OccupationName[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchOccupationFields().then(setFields).catch(() => setFields([]));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!fieldId || !query.trim()) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      searchOccupationNames(fieldId, query)
        .then((results) => {
          const selectedIds = new Set(selected.map((s) => s.id));
          setSuggestions(results.filter((r) => !selectedIds.has(r.id)));
        })
        .catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [fieldId, query, selected]);

  const addOccupation = (occ: OccupationName) => {
    onChange([...selected, occ]);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  };

  const removeOccupation = (id: string) => {
    onChange(selected.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Yrkesområde</label>
        <select
          value={fieldId}
          onChange={(e) => { setFieldId(e.target.value); setQuery(''); setSuggestions([]); }}
          className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        >
          <option value="" disabled>Välj yrkesområde</option>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </div>

      <div ref={boxRef} className="relative">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Yrkesroller</label>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (query) setOpen(true); }}
          disabled={!fieldId}
          placeholder={fieldId ? 'Sök yrkesroll, t.ex. "chef" eller "sjuksköterska"' : 'Välj yrkesområde först'}
          className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50 disabled:text-slate-400"
          autoComplete="off"
        />
        {open && suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((occ) => (
              <li
                key={occ.id}
                onMouseDown={() => addOccupation(occ)}
                className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer text-sm text-slate-700"
              >
                {occ.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((occ) => (
            <span
              key={occ.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 border border-blue-600 text-blue-700 rounded-full text-sm"
            >
              {occ.label}
              <button
                type="button"
                onClick={() => removeOccupation(occ.id)}
                className="hover:text-blue-900"
                aria-label={`Ta bort ${occ.label}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
