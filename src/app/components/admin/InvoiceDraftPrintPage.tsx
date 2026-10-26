import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { formatSek, invoiceStatusLabel } from '../../../lib/invoiceStatus';
import {
  MISSING,
  addressLines,
  downloadInvoiceDraftPdf,
  fetchDraft,
  fmtDate,
  vatPercent,
  type DraftData,
} from '../../../lib/invoiceDocuments';

// Utskriftsvänligt fakturautkast. Samma uppgifter som PDF-filen. "Skriv ut" använder
// webbläsarens utskrift (print-CSS gömmer allt utom utkastet), "Ladda ner PDF" laddar
// PDF-biblioteket först när knappen används.

export const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  .print-area, .print-area * { visibility: visible !important; }
  .print-area { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: none !important; }
  .no-print { display: none !important; }
  @page { size: A4; margin: 15mm; }
}
`;

function Missing() {
  return <span className="text-amber-700">{MISSING}</span>;
}

export function InvoiceDraftPrintPage() {
  const { id } = useParams();
  const [draft, setDraft] = useState<DraftData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchDraft(id).then(setDraft).catch(e => setError(e.message ?? 'Kunde inte hämta underlaget'));
  }, [id]);

  async function downloadPdf() {
    if (!draft) return;
    setPdfBusy(true);
    try {
      await downloadInvoiceDraftPdf(draft);
    } catch (e) {
      toast.error('Kunde inte skapa PDF-filen', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setPdfBusy(false);
    }
  }

  if (error) return <div className="max-w-3xl mx-auto p-8 text-sm text-red-700">{error}</div>;
  if (!draft) return <div className="max-w-3xl mx-auto p-8 text-sm text-slate-500">Laddar…</div>;

  const s = draft.seller;
  const b = draft.buyer;
  const lines = draft.lines.length > 0
    ? draft.lines
    : [{ description: draft.booking.title, quantity: draft.booking.participants, unit_price_ex_vat: null, total_ex_vat: draft.total_ex_vat }];

  return (
    <div className="bg-slate-50 min-h-screen py-8 px-4">
      <style>{PRINT_STYLES}</style>
      <div className="no-print max-w-3xl mx-auto mb-4 flex items-center justify-between gap-3">
        <Link to="/admin?tab=fakturering" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Tillbaka till Fakturering
        </Link>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 bg-white hover:bg-slate-50 rounded-lg">
            <Printer className="w-4 h-4" /> Skriv ut
          </button>
          <button
            onClick={downloadPdf}
            disabled={pdfBusy}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg"
          >
            <Download className="w-4 h-4" /> {pdfBusy ? 'Skapar…' : 'Ladda ner PDF'}
          </button>
        </div>
      </div>

      <article className="print-area max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-slate-900">
        <h1 className="text-2xl font-bold">Fakturautkast</h1>
        <p className="text-xs text-slate-500 mt-1">Preliminärt underlag. Det här är inte en faktura. Fakturan skapas i Fortnox.</p>

        <div className="grid grid-cols-2 gap-8 mt-8 text-sm">
          <div>
            <p className="text-[11px] tracking-wide uppercase text-slate-500 mb-1">Säljare</p>
            <p className="font-medium">{s.name ?? <Missing />}</p>
            <p>Org.nr {s.org_number ?? <Missing />}</p>
            <p>Moms.nr {s.vat_number ?? <Missing />}</p>
            {addressLines(s.address).length > 0 ? addressLines(s.address).map(l => <p key={l}>{l}</p>) : <p>Adress: <Missing /></p>}
          </div>
          <div>
            <p className="text-[11px] tracking-wide uppercase text-slate-500 mb-1">Köpare</p>
            <p className="font-medium">{b.name}</p>
            <p>Org.nr {b.organization_number ?? <Missing />}</p>
            {b.vat_number && <p>Moms.nr {b.vat_number}</p>}
            {addressLines(b.address).length > 0 ? addressLines(b.address).map(l => <p key={l}>{l}</p>) : <p>Adress: <Missing /></p>}
            <p>{b.invoice_email ?? <Missing />}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 mt-8 text-sm">
          {[
            ['Underlagsnummer', draft.number],
            ['Status', invoiceStatusLabel(draft.status)],
            ['Köparens referens', draft.booking.reference ?? '–'],
            ['Kurs', draft.booking.title],
            ['Lärosäte', draft.booking.provider_name],
            ['Startdatum', fmtDate(draft.booking.start_date)],
            ['Betalningsvillkor', `${draft.payment_terms_days} dagar`],
            ...(draft.fortnox_invoice_no ? [['Fortnox-fakturanummer', draft.fortnox_invoice_no]] : []),
            ...(draft.invoice_date ? [['Fakturadatum', fmtDate(draft.invoice_date)]] : []),
            ...(draft.due_date ? [['Förfallodatum', fmtDate(draft.due_date)]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-44 shrink-0 text-slate-500">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <table className="w-full mt-8 text-sm">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="px-3 py-2 font-medium">Beskrivning</th>
              <th className="px-3 py-2 font-medium text-right">Antal</th>
              <th className="px-3 py-2 font-medium text-right">À-pris exkl. moms</th>
              <th className="px-3 py-2 font-medium text-right">Summa exkl. moms</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-3 py-2">{l.description}</td>
                <td className="px-3 py-2 text-right">{l.quantity}</td>
                <td className="px-3 py-2 text-right">{l.unit_price_ex_vat !== null ? formatSek(l.unit_price_ex_vat) : '–'}</td>
                <td className="px-3 py-2 text-right">{formatSek(l.total_ex_vat)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <dl className="w-72 text-sm space-y-1">
            <div className="flex justify-between"><dt>Summa exkl. moms</dt><dd>{formatSek(draft.total_ex_vat)}</dd></div>
            <div className="flex justify-between"><dt>Moms {vatPercent(draft.vat_rate)}</dt><dd>{formatSek(draft.vat_amount)}</dd></div>
            <div className="flex justify-between font-bold text-base border-t border-slate-300 pt-1"><dt>Att betala</dt><dd>{formatSek(draft.total_inc_vat)}</dd></div>
          </dl>
        </div>

        <div className="flex justify-between mt-12 pt-4 border-t border-slate-200 text-xs text-slate-500">
          <span>Bankgiro: {s.bankgiro ?? MISSING}</span>
          <span>Betalningsvillkor {draft.payment_terms_days} dagar</span>
        </div>
      </article>
    </div>
  );
}
