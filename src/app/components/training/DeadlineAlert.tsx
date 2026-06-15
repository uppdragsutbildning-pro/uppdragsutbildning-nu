import { Clock, AlertTriangle } from 'lucide-react';

interface DeadlineAlertProps {
  deadline: string; // ISO date string
}

export function DeadlineAlert({ deadline }: DeadlineAlertProps) {
  const deadlineDate = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const formatted = deadlineDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });

  if (daysLeft < 0) {
    return (
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-500">
        <Clock className="w-4 h-4 flex-shrink-0" />
        <span>Ansökan stängd {formatted}</span>
      </div>
    );
  }

  if (daysLeft <= 14) {
    return (
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>
          <span className="font-semibold">{daysLeft === 0 ? 'Sista dag!' : `${daysLeft} dagar kvar`}</span>
          {' '}– Sista ansökningsdag {formatted}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600">
      <Clock className="w-4 h-4 flex-shrink-0" />
      <span>Sista ansökningsdag: <span className="font-medium">{formatted}</span></span>
    </div>
  );
}
