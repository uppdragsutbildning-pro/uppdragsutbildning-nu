import { supabase } from './supabaseClient';
import { formatSek, invoiceStatusLabel } from './invoiceStatus';

// Underlag för fakturautkast, avräkning och CSV-export (paket G). All data läses med adminens
// behörighet, och beloppen är redan beräknade i databasen: här formateras de bara.

export interface Address {
  street?: string;
  postal_code?: string;
  city?: string;
  co?: string;
  country?: string;
}

export interface BasisLine {
  description: string;
  quantity: number;
  unit_price_ex_vat: number | null;
  total_ex_vat: number;
}

export interface Seller {
  name: string | null;
  org_number: string | null;
  vat_number: string | null;
  bankgiro: string | null;
  address: Address | null;
}

export interface DraftData {
  id: string;
  number: string;
  status: string;
  lines: BasisLine[];
  total_ex_vat: number;
  vat_rate: number;
  vat_amount: number;
  total_inc_vat: number;
  commission_amount: number;
  payout_amount: number;
  fortnox_invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  booking: {
    title: string;
    participants: number;
    start_date: string;
    reference: string | null;
    provider_name: string;
  };
  buyer: {
    name: string;
    organization_number: string | null;
    vat_number: string | null;
    invoice_email: string | null;
    address: Address | null;
  };
  seller: Seller;
  payment_terms_days: number;
}

export const MISSING = 'Uppgifter saknas';

export function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString('sv-SE') : '–';
}

export function addressLines(a: Address | null | undefined): string[] {
  if (!a) return [];
  return [a.co ? `c/o ${a.co}` : '', a.street ?? '', [a.postal_code, a.city].filter(Boolean).join(' '), a.country ?? ''].filter(Boolean);
}

export function vatPercent(rate: number): string {
  return `${Math.round(rate * 10000) / 100} %`;
}

const BASIS_SELECT =
  'id, number, status, lines, total_ex_vat, vat_rate, vat_amount, total_inc_vat, commission_amount, payout_amount, fortnox_invoice_no, invoice_date, due_date, ' +
  'bookings(title, participants, start_date, reference, providers(name), organizations(name, organization_number, vat_number, invoice_email, invoice_address))';

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function fetchSeller(): Promise<{ seller: Seller; payment_terms_days: number }> {
  const { data } = await supabase
    .from('billing_settings')
    .select('seller_name, seller_org_number, seller_vat_number, seller_bankgiro, seller_address, payment_terms_days')
    .maybeSingle();
  return {
    seller: {
      name: data?.seller_name ?? null,
      org_number: data?.seller_org_number ?? null,
      vat_number: data?.seller_vat_number ?? null,
      bankgiro: data?.seller_bankgiro ?? null,
      address: (data?.seller_address as Address | null) ?? null,
    },
    payment_terms_days: data?.payment_terms_days ?? 30,
  };
}

function toDraft(row: any, seller: Seller, terms: number): DraftData {
  const b = one<any>(row.bookings);
  const org = one<any>(b?.organizations);
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    lines: (row.lines ?? []) as BasisLine[],
    total_ex_vat: Number(row.total_ex_vat),
    vat_rate: Number(row.vat_rate),
    vat_amount: Number(row.vat_amount),
    total_inc_vat: Number(row.total_inc_vat),
    commission_amount: Number(row.commission_amount),
    payout_amount: Number(row.payout_amount),
    fortnox_invoice_no: row.fortnox_invoice_no,
    invoice_date: row.invoice_date,
    due_date: row.due_date,
    booking: {
      title: b?.title ?? '',
      participants: b?.participants ?? 0,
      start_date: b?.start_date ?? '',
      reference: b?.reference ?? null,
      provider_name: one<any>(b?.providers)?.name ?? '',
    },
    buyer: {
      name: org?.name ?? '',
      organization_number: org?.organization_number ?? null,
      vat_number: org?.vat_number ?? null,
      invoice_email: org?.invoice_email ?? null,
      address: org?.invoice_address ?? null,
    },
    seller,
    payment_terms_days: terms,
  };
}

export async function fetchDraft(basisId: string): Promise<DraftData> {
  const [{ data, error }, s] = await Promise.all([
    supabase.from('invoice_bases').select(BASIS_SELECT).eq('id', basisId).maybeSingle(),
    fetchSeller(),
  ]);
  if (error) throw error;
  if (!data) throw new Error('Underlaget hittades inte');
  return toDraft(data, s.seller, s.payment_terms_days);
}

export async function fetchDrafts(basisIds: string[]): Promise<DraftData[]> {
  const [{ data, error }, s] = await Promise.all([
    supabase.from('invoice_bases').select(BASIS_SELECT).in('id', basisIds).order('number'),
    fetchSeller(),
  ]);
  if (error) throw error;
  return (data ?? []).map(r => toDraft(r, s.seller, s.payment_terms_days));
}

// ── CSV ──────────────────────────────────────────────────────────────────
// Underlagslista för att skapa fakturorna i Fortnox. Semikolon, UTF-8 med BOM, decimalkomma och
// en rad per fakturarad. Textfält som kan komma från köpare skyddas mot att öppnas som formler.

const HEADERS = [
  'Underlagsnummer', 'Status', 'Fortnox-fakturanummer',
  'Köpare', 'Organisationsnummer', 'Momsregistreringsnummer', 'Fakturaadress', 'Postnummer', 'Ort', 'E-post för fakturor', 'Köparens referens',
  'Radbeskrivning', 'Antal', 'À-pris exkl. moms', 'Radsumma exkl. moms',
  'Momssats %', 'Moms (underlag)', 'Summa exkl. moms (underlag)', 'Summa inkl. moms (underlag)',
  'Betalningsvillkor dagar', 'Lärosäte', 'Kurs', 'Startdatum',
];

function num(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : n.toFixed(2).replace('.', ',');
}

export function csvText(value: string | null | undefined): string {
  let v = (value ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return /[;"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildBillingCsv(drafts: DraftData[]): string {
  const rows: string[] = [HEADERS.join(';')];
  for (const d of drafts) {
    const lines = d.lines.length > 0 ? d.lines : [{ description: d.booking.title, quantity: d.booking.participants, unit_price_ex_vat: null, total_ex_vat: d.total_ex_vat }];
    for (const l of lines) {
      rows.push(
        [
          csvText(d.number), csvText(invoiceStatusLabel(d.status)), csvText(d.fortnox_invoice_no),
          csvText(d.buyer.name), csvText(d.buyer.organization_number), csvText(d.buyer.vat_number),
          csvText(d.buyer.address?.street), csvText(d.buyer.address?.postal_code), csvText(d.buyer.address?.city),
          csvText(d.buyer.invoice_email), csvText(d.booking.reference),
          csvText(l.description), String(l.quantity), num(l.unit_price_ex_vat), num(l.total_ex_vat),
          num(d.vat_rate * 100), num(d.vat_amount), num(d.total_ex_vat), num(d.total_inc_vat),
          String(d.payment_terms_days), csvText(d.booking.provider_name), csvText(d.booking.title),
          csvText(d.booking.start_date),
        ].join(';')
      );
    }
  }
  return rows.join('\r\n') + '\r\n';
}

export function downloadCsv(content: string, baseName: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── PDF (jsPDF laddas först när knappen används) ─────────────────────────
async function loadPdf() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable: autoTableModule.default };
}

const SLATE = [15, 23, 42] as const;
const GREY = [100, 116, 139] as const;

function block(doc: any, x: number, y: number, title: string, lines: string[]): number {
  doc.setFontSize(8).setTextColor(...GREY).text(title.toUpperCase(), x, y);
  doc.setFontSize(10).setTextColor(...SLATE);
  let cy = y + 5;
  for (const l of lines) {
    doc.text(l, x, cy);
    cy += 5;
  }
  return cy;
}

export async function downloadInvoiceDraftPdf(d: DraftData) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  doc.setFontSize(18).setTextColor(...SLATE).text('Fakturautkast', 15, 22);
  doc.setFontSize(9).setTextColor(...GREY).text('Preliminärt underlag. Det här är inte en faktura. Fakturan skapas i Fortnox.', 15, 28);

  const s = d.seller;
  const sellerLines = [
    s.name ?? MISSING,
    s.org_number ? `Org.nr ${s.org_number}` : `Org.nr: ${MISSING}`,
    s.vat_number ? `Moms.nr ${s.vat_number}` : `Moms.nr: ${MISSING}`,
    ...(addressLines(s.address).length > 0 ? addressLines(s.address) : [`Adress: ${MISSING}`]),
  ];
  const b = d.buyer;
  const buyerLines = [
    b.name,
    b.organization_number ? `Org.nr ${b.organization_number}` : `Org.nr: ${MISSING}`,
    ...(b.vat_number ? [`Moms.nr ${b.vat_number}`] : []),
    ...(addressLines(b.address).length > 0 ? addressLines(b.address) : [`Adress: ${MISSING}`]),
    b.invoice_email ?? `E-post: ${MISSING}`,
  ];
  const yEnd = Math.max(block(doc, 15, 40, 'Säljare', sellerLines), block(doc, 110, 40, 'Köpare', buyerLines));

  const meta: [string, string][] = [
    ['Underlagsnummer', d.number],
    ['Status', invoiceStatusLabel(d.status)],
    ['Köparens referens', d.booking.reference ?? '–'],
    ['Kurs', d.booking.title],
    ['Lärosäte', d.booking.provider_name],
    ['Startdatum', fmtDate(d.booking.start_date)],
    ['Betalningsvillkor', `${d.payment_terms_days} dagar`],
  ];
  if (d.fortnox_invoice_no) meta.push(['Fortnox-fakturanummer', d.fortnox_invoice_no]);
  if (d.invoice_date) meta.push(['Fakturadatum', fmtDate(d.invoice_date)]);
  if (d.due_date) meta.push(['Förfallodatum', fmtDate(d.due_date)]);
  autoTable(doc, {
    startY: yEnd + 6,
    body: meta,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    columnStyles: { 0: { textColor: [...GREY], cellWidth: 45 } },
    margin: { left: 15 },
  });

  const lines = d.lines.length > 0 ? d.lines : [{ description: d.booking.title, quantity: d.booking.participants, unit_price_ex_vat: null, total_ex_vat: d.total_ex_vat }];
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [['Beskrivning', 'Antal', 'À-pris exkl. moms', 'Summa exkl. moms']],
    body: lines.map(l => [l.description, String(l.quantity), l.unit_price_ex_vat !== null ? formatSek(l.unit_price_ex_vat) : '–', formatSek(l.total_ex_vat)]),
    headStyles: { fillColor: [241, 245, 249], textColor: [...SLATE] },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 4,
    body: [
      ['Summa exkl. moms', formatSek(d.total_ex_vat)],
      [`Moms ${vatPercent(d.vat_rate)}`, formatSek(d.vat_amount)],
      ['Att betala', formatSek(d.total_inc_vat)],
    ],
    theme: 'plain',
    styles: { fontSize: 10, halign: 'right' },
    columnStyles: { 0: { halign: 'right' }, 1: { halign: 'right', cellWidth: 40 } },
    didParseCell: (data: any) => {
      if (data.row.index === 2) data.cell.styles.fontStyle = 'bold';
    },
    margin: { left: 100, right: 15 },
    tableWidth: 95,
  });

  doc.setFontSize(9).setTextColor(...GREY);
  doc.text(`Bankgiro: ${s.bankgiro ?? MISSING}`, 15, 280);
  doc.text(`Betalningsvillkor ${d.payment_terms_days} dagar`, 110, 280);

  doc.save(`fakturautkast_${d.number}.pdf`);
}

export interface SettlementRow {
  number: string;
  buyer: string;
  title: string;
  paid_at: string | null;
  status: string;
  total_ex_vat: number;
  commission_amount: number;
  payout_amount: number;
  paid_out_at: string | null;
}

export interface SettlementData {
  providerName: string;
  from: string;
  to: string;
  rows: SettlementRow[];
  payout: { method?: string; number?: string; org_number?: string | null } | null;
}

export function settlementTotals(rows: SettlementRow[]) {
  const sum = (f: (r: SettlementRow) => number) => Math.round(rows.reduce((a, r) => a + f(r), 0) * 100) / 100;
  return {
    total_ex_vat: sum(r => r.total_ex_vat),
    commission_amount: sum(r => r.commission_amount),
    payout_amount: sum(r => r.payout_amount),
  };
}

export async function downloadSettlementPdf(d: SettlementData) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const t = settlementTotals(d.rows);

  doc.setFontSize(18).setTextColor(...SLATE).text('Avräkning', 15, 20);
  doc.setFontSize(10).setTextColor(...GREY).text(`${d.providerName} · ${fmtDate(d.from)} – ${fmtDate(d.to)}`, 15, 27);
  if (d.payout?.number) {
    doc.text(`Utbetalning till ${(d.payout.method ?? 'bankgiro').toUpperCase()} ${d.payout.number}${d.payout.org_number ? ` · org.nr ${d.payout.org_number}` : ''}`, 15, 33);
  }

  autoTable(doc, {
    startY: 40,
    head: [['Underlag', 'Köpare', 'Kurs', 'Betald', 'Utbetald', 'Exkl. moms', 'Provision', 'Utbetalning']],
    body: d.rows.map(r => [
      r.number, r.buyer, r.title, fmtDate(r.paid_at), r.paid_out_at ? fmtDate(r.paid_out_at) : 'Ej utbetald',
      formatSek(r.total_ex_vat), formatSek(r.commission_amount), formatSek(r.payout_amount),
    ]),
    foot: [['Totalt', '', '', '', '', formatSek(t.total_ex_vat), formatSek(t.commission_amount), formatSek(t.payout_amount)]],
    headStyles: { fillColor: [241, 245, 249], textColor: [...SLATE] },
    footStyles: { fillColor: [241, 245, 249], textColor: [...SLATE], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });

  doc.setFontSize(8).setTextColor(...GREY).text('Belopp exklusive moms. Provision räknas på priset exklusive moms.', 15, 195);
  doc.save(`avrakning_${d.providerName.replace(/[^a-zA-Z0-9åäöÅÄÖ]+/g, '_')}_${d.from}_${d.to}.pdf`);
}
