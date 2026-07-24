interface ScaleButtonsProps {
  value: number;
  onChange: (val: number) => void;
  labelLow: string;
  labelHigh: string;
}

export function ScaleButtons({ value, onChange, labelLow, labelHigh }: ScaleButtonsProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 h-11 rounded-lg text-sm font-semibold border transition-colors ${
              value === n
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-blue-50 hover:border-blue-300'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between">
        <span className="text-xs text-slate-400">{labelLow}</span>
        <span className="text-xs text-slate-400">{labelHigh}</span>
      </div>
    </div>
  );
}