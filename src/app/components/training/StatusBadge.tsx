interface StatusBadgeProps {
  status: 'open' | 'few_spots' | 'full' | 'upcoming';
  size?: 'sm' | 'md';
}

const config = {
  open: {
    label: 'Öppen för ansökan',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200'
  },
  few_spots: {
    label: 'Få platser kvar',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200'
  },
  full: {
    label: 'Fullbokad',
    dot: 'bg-red-500',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200'
  },
  upcoming: {
    label: 'Kommande',
    dot: 'bg-blue-500',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200'
  }
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const c = config[status];
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${padding} ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot} ${status === 'open' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  );
}
