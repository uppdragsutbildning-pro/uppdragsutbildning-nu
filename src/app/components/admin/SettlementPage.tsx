import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabaseClient';
import { formatSek, invoiceStatusLabel } from '../../../lib/invoiceStatus';
import {
  downloadSettlementPdf,
  fmtDate,
  settlementTotals,
  type SettlementData,
  type SettlementRow,
} from '../../../lib/invoiceDocuments';
import { PRINT_STYLES } from './InvoiceDraftPrintPage';

// Avräkning till ett lärosäte för en period: betalda underlag med belopp, provision och
// utbetalning. Skrivs ut eller laddas ner som PDF. Bara admin når sidan.

const input = 'mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE');
}

function todayStr() {
  return new Date().toLocaleDateString('sv-SE');
}

export function SettlementPage() {
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [providerId, setProviderId] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [onlyUnpaidOut, setOnlyUnpaidOut] = useState(false);
  const [rows, setRows] = useState<SettlementRow[] | null>(null);
  const [payout, setPayout] = useState<SettlementData['payout']>(null);
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('providers')
      .select('id, name')
      .order('name')
      .then(({ data }) => setProviders((data ?? []) as { id: string; name: string }[]));
  }, []);

  useEffect(() => {
    if (!providerId) {
      setRows(null);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      let q = supabase
        .from('invoice_bases')
        .select(
          'number, status, total_ex_vat, commission_amount, payout_amount, paid_at, paid_out_at, bookings!inner(title, provider_id, organizations(name))'
        )
        .eq('bookings.provider_id', providerId)
        .in('status', onlyUnpaidOut ? ['paid'] : ['paid', 'paid_out'])
        .gte('paid_at', from)
        .lte('paid_at', to)
        .order('paid_at', { ascending: true });
      const [res, pay] = await Promise.all([
        q,
        supabase.from('provider_payout_details').select('payout_details, payout_org_number').eq('provider_id', providerId).maybeSingle(),
      ]);
      if (!active) return;
      setLoading(false);
      if (res.error) {
        toast.error('Kunde inte hämta underlag', { description: res.error.message });
        return;
      }
      setRows(
        (res.data ?? []).map((r: any) => {
          const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
          const org = Array.isArray(b?.organizations) ? b.organizations[0] : b?.organizations;
          return {
            number: r.number,
            buyer: org?.name ?? '',
            title: b?.title ?? '',
            paid_at: r.paid_at,
            status: r.status,
            total_ex_vat: Number(r.total_ex_vat),
            commission_amount: Number(r.commission_amount),
            payout_amount: Number(r.payout_amount),
            paid_out_at: r.paid_out_at,
          } as SettlementRow;
        })
      );
      setPayout(
        pay.data
          ? { ...(pay.data.payout_details as { method?: string; number?: string }), org_number: pay.data.payout_org_number }
          : null
      );
    })();
    return () => {
      active = false;
    };
  }, [providerId, from, to, onlyUnpaidOut]);

  const provider = providers.find(p => p.id === providerId);
  const totals = useMemo(() => settlementTotals(rows ?? []), [rows]);

  async function downloadPdf() {
    if (!provider || !rows) return;
    setPdfBusy(true);
    try {
      await downloadSettlementPdf({ providerName: provider.name, from, to, rows, payout });
    } catch (e) {
      toast.error('Kunde inte skapa PDF-filen', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="bg-slate-50 min-h-screen py-8 px-4">
      <style>{PRINT_STYLES}</style>
      <div className="no-print max-w-4xl mx-auto mb-4">
        <Link to="/admin?tab=fakturering" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Tillbaka till Fakturering
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-3">Avräkning</h1>
        <div className="flex flex-wrap items-end gap-4 mt-4">
          <label className="text-sm text-slate-700">
            Lärosäte
            <select value={providerId} onChange={e => setProviderId(e.target.value)} className={`${input} block min-w-[240px]`}>
              <option value="">Välj lärosäte…</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Betalda från
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${input} block`} />
          </label>
          <label className="text-sm text-slate-700">
            till
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${input} block`} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
            <input type="checkbox" checked={onlyUnpaidOut} onChange={e => setOnlyUnpaidOut(e.target.checked)} />
            Bara ej utbetalda
          </label>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => window.print()}
              disabled={!rows || rows.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 rounded-lg"
            >
              <Printer className="w-4 h-4" /> Skriv ut
            </button>
            <button
              onClick={downloadPdf}
              disabled={!rows || rows.length === 0 || pdfBusy}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
            >
              <Download className="w-4 h-4" /> {pdfBusy ? 'Skapar…' : 'Ladda ner PDF'}
            </button>
          </div>
        </div>
      </div>

      {!providerId && <p className="max-w-4xl mx-auto text-sm text-slate-500">Välj ett lärosäte för att se avräkningen.</p>}
      {providerId && loading && <p className="max-w-4xl mx-auto text-sm text-slate-500">Laddar…</p>}
      {providerId && rows && rows.length === 0 && !loading && (
        <p className="max-w-4xl mx-auto text-sm text-slate-600">Inga betalda underlag för {provider?.name} i perioden.</p>
      )}

      {provider && rows && rows.length > 0 && (
        <article className="print-area max-w-4xl mx-auto bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-slate-900">
          <h2 className="text-2xl font-bold">Avräkning</h2>
          <p className="text-sm text-slate-600 mt-1">
            {provider.name} · {fmtDate(from)} – {fmtDate(to)}
          </p>
          {payout?.number && (
            <p className="text-sm text-slate-600">
              Utbetalning till {(payout.method ?? 'bankgiro').toUpperCase()} {payout.number}
              {payout.org_number ? ` · org.nr ${payout.org_number}` : ''}
            </p>
          )}

          <table className="w-full mt-6 text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="px-3 py-2 font-medium">Underlag</th>
                <th className="px-3 py-2 font-medium">Köpare</th>
                <th className="px-3 py-2 font-medium">Kurs</th>
                <th className="px-3 py-2 font-medium">Betald</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Exkl. moms</th>
                <th className="px-3 py-2 font-medium text-right">Provision</th>
                <th className="px-3 py-2 font-medium text-right">Utbetalning</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.number} className="border-b border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap">{r.number}</td>
                  <td className="px-3 py-2">{r.buyer}</td>
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.paid_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.paid_out_at ? `Utbetald ${fmtDate(r.paid_out_at)}` : invoiceStatusLabel(r.status)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatSek(r.total_ex_vat)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatSek(r.commission_amount)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatSek(r.payout_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold">
                <td className="px-3 py-2" colSpan={5}>Totalt</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatSek(totals.total_ex_vat)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatSek(totals.commission_amount)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatSek(totals.payout_amount)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-xs text-slate-500 mt-4">Belopp exklusive moms. Provision räknas på priset exklusive moms.</p>
        </article>
      )}
    </div>
  );
}
