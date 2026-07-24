interface MultiSelectChipsProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function MultiSelectChips({ options, selected, onChange }: MultiSelectChipsProps) {
  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt]
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={`px-4 py-2 rounded-full text-sm border transition-colors ${
            selected.includes(opt)
              ? 'bg-blue-100 border-blue-600 text-blue-700'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-blue-50'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}