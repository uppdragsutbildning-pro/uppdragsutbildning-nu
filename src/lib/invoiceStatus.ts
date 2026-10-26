// En källa för fakturaunderlagets och offertens statusar: värden, svenska etiketter och färger.
// Admin, Provider-vyn och Mitt konto använder samma modul, så att de inte kan glida isär
// (kravet "Synkning mellan Admin, Provider-vy och Mitt konto"). Värdena måste matcha
// CHECK-constrainten på invoice_bases.status och custom_requests.status i databasen.

export const INVOICE_STATUSES = [
  'preliminary',
  'ready',
  'invoiced',
  'paid',
  'paid_out',
  'cancelled',
  'credited',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  preliminary: 'Preliminär',
  ready: 'Klar för fakturering',
  invoiced: 'Fakturerad',
  paid: 'Betald',
  paid_out: 'Utbetald',
  cancelled: 'Avbruten',
  credited: 'Krediterad',
};

// Tailwind-klasser för statusmärken (samma uppsättning som leverantörsportalens märken).
export const INVOICE_STATUS_BADGE: Record<InvoiceStatus, string> = {
  preliminary: 'bg-slate-50 text-slate-700 border-slate-200',
  ready: 'bg-blue-50 text-blue-700 border-blue-200',
  invoiced: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid_out: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
  credited: 'bg-red-50 text-red-700 border-red-200',
};

export const INVOICE_STATUS_TERMINAL: readonly InvoiceStatus[] = ['cancelled', 'paid_out', 'credited'];

// Tillåtna övergångar. Speglar triggern billing_guard_basis_update i databasen, som är den
// som avgör. Används bara för att visa rätt knappar i Admin.
export const INVOICE_STATUS_NEXT: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  preliminary: ['ready', 'cancelled'],
  ready: ['invoiced', 'cancelled'],
  invoiced: ['paid', 'credited'],
  paid: ['paid_out', 'credited'],
  paid_out: [],
  cancelled: [],
  credited: [],
};

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(value);
}

// Etiketten är densamma för alla roller. Tilläggstext (t.ex. planerat utbetalningsdatum) hanteras
// av respektive vy utifrån vad rollen får se.
export function invoiceStatusLabel(status: string): string {
  return isInvoiceStatus(status) ? INVOICE_STATUS_LABEL[status] : status;
}

export function invoiceStatusBadge(status: string): string {
  return isInvoiceStatus(status) ? INVOICE_STATUS_BADGE[status] : INVOICE_STATUS_BADGE.preliminary;
}

// Offertens status (custom_requests.status) som den visas för köpare, lärosäte och admin.
export const QUOTE_STATUS_LABEL: Record<string, string> = {
  new: 'Utkast',
  responded: 'Offert lämnad',
  negotiating: 'Dialog pågår',
  accepted: 'Accepterad',
  declined: 'Avböjd',
  not_selected: 'Ej vald',
};

export function quoteStatusLabel(status: string): string {
  return QUOTE_STATUS_LABEL[status] ?? status;
}

// Anledningar när köparen väljer bort en offert (custom_requests.not_selected_reason_code).
export const NOT_SELECTED_REASONS = [
  { code: 'price', label: 'Pris' },
  { code: 'timing', label: 'Leveranstid' },
  { code: 'content', label: 'Innehåll' },
  { code: 'experience', label: 'Tidigare erfarenhet' },
  { code: 'other', label: 'Annat' },
] as const;
