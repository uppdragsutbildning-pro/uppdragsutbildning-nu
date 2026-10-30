import { Link } from 'react-router';
import { ArrowRight, ChevronDown } from 'lucide-react';

export interface AccountRequest {
  id: string;
  course_topic: string;
  description: string;
  status: 'new' | 'responded' | 'negotiating' | 'accepted' | 'declined' | 'not_selected';
  budget: string | null;
  timeline: string;
  participants_count: string;
  response: string | null;
  submitted_at: string;
  trainings: { title: string; slug: string } | null;
}

const STATUS: Record<AccountRequest['status'], { label: string; className: string }> = {
  new: { label: 'Skickad', className: 'bg-slate-100 text-slate-700' },
  responded: { label: 'Besvarad', className: 'bg-green-100 text-green-700' },
  negotiating: { label: 'Dialog pågår', className: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepterad', className: 'bg-green-100 text-green-700' },
  declined: { label: 'Avböjd', className: 'bg-red-100 text-red-700' },
  not_selected: { label: 'Ej vald', className: 'bg-slate-100 text-slate-600' },
};

export function QuoteRequestItem({
  request: r,
  open,
  onToggle,
  typeLabel,
}: {
  request: AccountRequest;
  open: boolean;
  onToggle: () => void;
  typeLabel?: string;
}) {
  const status = STATUS[r.status] ?? STATUS.new;
  return (
    <li className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-4 p-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[var(--fg)] truncate">{r.trainings?.title ?? r.course_topic}</p>
          <p className="text-xs text-[var(--fg-subtle)] mt-0.5">
            {typeLabel && `${typeLabel} · `}
            Skickad {new Date(r.submitted_at).toLocaleDateString('sv-SE')}
          </p>
        </div>
        <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}>{status.label}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-[var(--fg-subtle)] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-[var(--border-light)] pt-4 space-y-4">
          <div>
            <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--fg-subtle)] mb-1">Ert behov</p>
            <p className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-line">{r.description}</p>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {r.timeline && (
              <div>
                <dt className="text-xs text-[var(--fg-subtle)]">Tidplan</dt>
                <dd className="text-[var(--fg)]">{r.timeline}</dd>
              </div>
            )}
            {r.budget && (
              <div>
                <dt className="text-xs text-[var(--fg-subtle)]">Budget</dt>
                <dd className="text-[var(--fg)]">{r.budget}</dd>
              </div>
            )}
            {r.participants_count && (
              <div>
                <dt className="text-xs text-[var(--fg-subtle)]">Deltagare</dt>
                <dd className="text-[var(--fg)]">{r.participants_count}</dd>
              </div>
            )}
          </dl>
          {r.response && (
            <div className="rounded-xl bg-[var(--accent-dim)] p-4">
              <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--accent)] mb-1">
                Svar från leverantör
              </p>
              <p className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-line">{r.response}</p>
            </div>
          )}
          {r.trainings && (
            <Link
              to={`/kurs/${r.trainings.slug}`}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
            >
              Visa kursen <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
