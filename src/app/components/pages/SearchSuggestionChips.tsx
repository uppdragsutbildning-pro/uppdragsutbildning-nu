interface Props {
  suggestions: string[];
  // Det som står i sökfältet just nu; ett markerat förslag är det som matchar texten.
  value: string;
  // Klick lägger förslaget i sökfältet (användaren söker sedan själv); klick på det markerade rensar.
  onPick: (text: string) => void;
  className?: string;
  // CSS-färg för markerat förslag: --accent på startsidan, --marketplace-primary på sökresultatsidan.
  accent?: string;
}

export function SearchSuggestionChips({ suggestions, value, onPick, className = '', accent = 'var(--accent)' }: Props) {
  const current = value.trim().toLowerCase();
  return (
    <div role="group" aria-label="Förslag på sökningar" className={`flex-wrap gap-2 ${className}`}>
      {suggestions.map(text => {
        const active = current === text.toLowerCase();
        return (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            aria-pressed={active}
            style={
              active
                ? { color: accent, borderColor: accent, backgroundColor: `color-mix(in srgb, ${accent} 10%, white)` }
                : undefined
            }
            className={`px-4 py-2 rounded-full text-[13px] font-normal border-[1.5px] transition-colors ${
              active ? '' : 'bg-[var(--chip-bg)] text-[var(--chip-fg)] border-transparent hover:bg-[var(--chip-hover)]'
            }`}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
