import { Users } from 'lucide-react';

interface SeatIndicatorProps {
  available: number;
  total: number;
}

export function SeatIndicator({ available, total }: SeatIndicatorProps) {
  const taken = total - available;
  const pct = total > 0 ? (taken / total) * 100 : 100;

  const barColor =
    available === 0
      ? 'bg-red-500'
      : available <= total * 0.2
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  const textColor =
    available === 0
      ? 'text-red-600'
      : available <= total * 0.2
      ? 'text-amber-600'
      : 'text-emerald-600';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-sm text-slate-600">
          <Users className="w-3.5 h-3.5" />
          Platser
        </span>
        <span className={`text-sm font-semibold ${textColor}`}>
          {available === 0 ? 'Fullbokad' : `${available} av ${total} lediga`}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
