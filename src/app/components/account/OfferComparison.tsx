import { formatSek } from '../../../lib/invoiceStatus';
import {
  DELIVERY_FORMAT_LABEL,
  NEED_LABEL,
  needsMatchCount,
  totalModuleHours,
  type NeedCheck,
  type OfferModule,
} from '../../../lib/offerProposal';
import { policySummary } from '../training/BookingDialog';

export interface OfferRow {
  quote_id: string;
  provider_id: string;
  provider_name: string;
  status: string;
  response: string | null;
  responded_at: string;
  offer_total_ex_vat: number | null;
  offer_participants: number | null;
  offer_start_date: string | null;
  offer_end_date: string | null;
  offer_valid_until: string | null;
  offer_location: string | null;
  offer_terms: string | null;
  offer_delivery_format: string | null;
  offer_duration_hours: number | null;
  offer_modules: OfferModule[] | null;
  offer_fit_comment: string | null;
  offer_needs_check: NeedCheck[] | null;
  cancellation_policy: { free_until_days_before_start?: number; late_fee_percent?: number; text?: string } | null;
}

export function isOfferExpired(o: OfferRow) {
  return o.offer_valid_until !== null && new Date(o.offer_valid_until + 'T23:59:59') < new Date();
}

export function isOfferAcceptable(o: OfferRow) {
  return ['responded', 'negotiating'].includes(o.status) && o.offer_total_ex_vat !== null && !isOfferExpired(o);
}

const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('sv-SE') : '–');

export function OfferComparison({
  offers,
  canChoose,
  onChoose,
}: {
  offers: OfferRow[];
  canChoose: boolean;
  onChoose: (quoteId: string) => void;
}) {
  const prices = offers.map(o => o.offer_total_ex_vat).filter((p): p is number => p !== null);
  const lowestPrice = prices.length > 1 ? Math.min(...prices) : null;
  const matches = offers.map(o => needsMatchCount(o.offer_needs_check));
  const bestMeets = Math.max(0, ...matches.map(m => m.meets));
  const bestIsUnique = bestMeets > 0 && matches.filter(m => m.meets === bestMeets).length === 1;

  const rows: { label: string; cell: (o: OfferRow, i: number) => React.ReactNode }[] = [
    {
      label: 'Pris exkl. moms',
      cell: o => (
        <>
          <span className="font-semibold">{formatSek(o.offer_total_ex_vat)}</span>
          {lowestPrice !== null && o.offer_total_ex_vat === lowestPrice && <Badge>Lägst pris</Badge>}
        </>
      ),
    },
    {
      label: 'Pris per deltagare',
      cell: o =>
        o.offer_total_ex_vat !== null && o.offer_participants
          ? formatSek(Math.round(o.offer_total_ex_vat / o.offer_participants))
          : '–',
    },
    { label: 'Deltagare', cell: o => o.offer_participants ?? '–' },
    { label: 'Start', cell: o => date(o.offer_start_date) },
    { label: 'Slut', cell: o => date(o.offer_end_date) },
    { label: 'Ort', cell: o => o.offer_location ?? '–' },
    {
      label: 'Genomförande',
      cell: o => (o.offer_delivery_format ? DELIVERY_FORMAT_LABEL[o.offer_delivery_format] : '–'),
    },
    {
      label: 'Omfattning',
      cell: o => {
        const h = o.offer_duration_hours ?? (totalModuleHours(o.offer_modules) || null);
        return h ? `${h} timmar` : '–';
      },
    },
    {
      label: 'Upplägg',
      cell: o =>
        o.offer_modules && o.offer_modules.length > 0 ? (
          <ol className="list-decimal pl-4 space-y-1">
            {o.offer_modules.map((m, i) => (
              <li key={i}>
                {m.title}
                {m.hours ? <span className="text-[var(--fg-subtle)]"> ({m.hours} tim)</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          '–'
        ),
    },
    {
      label: 'Matchning mot ert behov',
      cell: (o, i) => {
        const checks = o.offer_needs_check ?? [];
        if (checks.length === 0) return '–';
        const deviations = checks.filter(c => c.status === 'deviates');
        return (
          <>
            <span className="font-semibold">
              {matches[i].meets} av {matches[i].total} uppfylls
            </span>
            {bestIsUnique && matches[i].meets === bestMeets && <Badge>Bäst match</Badge>}
            {deviations.length > 0 && (
              <ul className="mt-1 space-y-1 text-amber-800">
                {deviations.map(c => (
                  <li key={c.key}>
                    <span className="font-medium">{NEED_LABEL[c.key]}:</span> {c.comment}
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      },
    },
    {
      label: 'Kommentar',
      cell: o => {
        const text = [o.offer_fit_comment, o.response].filter(Boolean).join('\n\n');
        return text ? <span className="whitespace-pre-line">{text}</span> : '–';
      },
    },
    { label: 'Offerten gäller till', cell: o => (isOfferExpired(o) ? `${date(o.offer_valid_until)} (utgången)` : date(o.offer_valid_until)) },
    { label: 'Avbokningsvillkor', cell: o => policySummary(o.cancellation_policy) },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
      <table className="w-full text-sm border-collapse" style={{ minWidth: 160 + offers.length * 220 }}>
        <caption className="sr-only">Jämförelse av offerter</caption>
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th scope="col" className="sticky left-0 bg-white w-40 p-3" />
            {offers.map(o => (
              <th key={o.quote_id} scope="col" className="p-3 text-left align-bottom font-semibold text-[var(--fg)]">
                {o.provider_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className="border-b border-[var(--border-light)] align-top">
              <th
                scope="row"
                className="sticky left-0 bg-white p-3 text-left text-xs font-medium text-[var(--fg-subtle)] w-40"
              >
                {row.label}
              </th>
              {offers.map((o, i) => (
                <td key={o.quote_id} className="p-3 text-[var(--fg)]">
                  {row.cell(o, i)}
                </td>
              ))}
            </tr>
          ))}
          {canChoose && (
            <tr>
              <th scope="row" className="sticky left-0 bg-white p-3" />
              {offers.map(o => (
                <td key={o.quote_id} className="p-3">
                  {isOfferAcceptable(o) ? (
                    <button
                      type="button"
                      onClick={() => onChoose(o.quote_id)}
                      className="px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold rounded-[10px] transition-colors"
                    >
                      Välj denna offert
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--fg-subtle)]">Går inte att välja</span>
                  )}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-medium align-middle">
      {children}
    </span>
  );
}
