import { useState } from 'react';
import { Check, Loader2, Plus, Sparkles, X } from 'lucide-react';

// Formuleringshjälp under ett fritextfält. Inget skickas förrän användaren trycker på knappen, och texten
// ersätts aldrig automatiskt: användaren väljer själv "Använd förslaget" eller "Behåll min text".
// Bolagsnamn, kontaktuppgifter, bransch och storlek skickas inte med, bara frågan, texten och en grov skalnivå.

type Field = 'af4' | 'pf5' | 'tr4';
const MAX_USES_PER_FIELD = 3;
const storageKey = (f: Field) => `ski.freetextAssist.${f}`;

function usesLeft(field: Field): number {
  try {
    return Math.max(0, MAX_USES_PER_FIELD - Number(sessionStorage.getItem(storageKey(field)) ?? 0));
  } catch {
    return MAX_USES_PER_FIELD;
  }
}
function recordUse(field: Field) {
  try {
    sessionStorage.setItem(storageKey(field), String(MAX_USES_PER_FIELD - usesLeft(field) + 1));
  } catch {
    // sessionStorage kan vara blockerat; begränsningen gäller då bara på serversidan.
  }
}

interface Props {
  field: Field;
  value: string;
  onChange: (next: string) => void;
  // Grov nivå på skalfrågorna i samma avsnitt (medelvärdet av svaren), om några är besvarade.
  scaleLevel?: 'low' | 'medium' | 'high';
}

type Result = { mode: 'improve'; text: string } | { mode: 'suggest'; suggestions: string[] };

export function FreetextAssist({ field, value, onChange, scaleLevel }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(() => usesLeft(field));

  const hasText = value.trim().length > 0;

  async function run() {
    if (usesLeft(field) <= 0) { setLeft(0); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/improve-freetext', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, text: value, scaleLevel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Kunde inte hämta förslag');
      recordUse(field);
      setLeft(usesLeft(field));
      setResult(data as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte hämta förslag');
    } finally {
      setLoading(false);
    }
  }

  function addSuggestion(s: string) {
    const trimmed = value.trim();
    onChange(trimmed ? `${trimmed}${/[.!?]$/.test(trimmed) ? ' ' : '. '}${s}` : s);
    setResult((r) => (r && r.mode === 'suggest' ? { mode: 'suggest', suggestions: r.suggestions.filter((x) => x !== s) } : r));
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={run}
          disabled={loading || left <= 0}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--marketplace-primary)] hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {hasText ? 'Hjälp mig formulera' : 'Ge mig förslag att utgå från'}
        </button>
        {left <= 0 && <span className="text-xs text-slate-400">Du har använt hjälpen tre gånger för den här frågan.</span>}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-400">
        Texten skickas till en AI-tjänst för omformulering. Skriv inte namn, kontaktuppgifter eller andra personuppgifter.
      </p>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {result?.mode === 'improve' && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 mb-1">Förslag på formulering</p>
          <p className="text-sm text-slate-800 leading-relaxed">{result.text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { onChange(result.text); setResult(null); }}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--marketplace-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              <Check className="w-3.5 h-3.5" />Använd förslaget
            </button>
            <button type="button" onClick={() => setResult(null)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Behåll min text
            </button>
          </div>
        </div>
      )}

      {result?.mode === 'suggest' && result.suggestions.length > 0 && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Exempel, klicka för att lägga till och redigera</p>
            <button type="button" onClick={() => setResult(null)} aria-label="Stäng förslag" className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {result.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => addSuggestion(s)}
                className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:border-blue-400">
                <Plus className="mt-0.5 w-3.5 h-3.5 shrink-0 text-blue-600" />{s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
