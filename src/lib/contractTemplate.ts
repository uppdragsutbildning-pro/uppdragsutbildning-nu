import { formatSek } from './invoiceStatus';

// Avtalsmall för uppdragsutbildning (Steg 0): plattformen fyller i det den vet ur bokningen,
// parterna redigerar dokumentet, signerar utanför plattformen och laddar upp den signerade filen.
//
// UTKAST: texten är inte juridiskt granskad. Det som saknas eller måste avgöras står i
// [hakparenteser] och markeras gult i dokumentet. Mallens struktur följer en tidigare
// överenskommelse om uppdragsutbildning mellan ett lärosäte och en myndighet.

export const CONTRACT_TEMPLATE_VERSION = '2026-11-06-utkast-1';

export type ContractVariant = 'state_authority' | 'general';

export const CONTRACT_VARIANTS: { value: ContractVariant; label: string; hint: string }[] = [
  {
    value: 'general',
    label: 'Kommun, region eller företag',
    hint: 'Tvist avgörs av allmän domstol (tingsrätt).',
  },
  {
    value: 'state_authority',
    label: 'Statlig myndighet',
    hint: 'Tvist mellan statliga parter hänskjuts till regeringen.',
  },
];

// Det get_contract_context returnerar. Alla fält kan saknas.
export interface ContractContext {
  booking: {
    id: string;
    title: string;
    source: 'scheduled_start' | 'custom_quote';
    participants: number;
    unit_price_ex_vat: number | null;
    total_ex_vat: number;
    vat_rate: number;
    start_date: string;
    confirmed_at: string;
    reference: string | null;
    status: string;
    cancellation_policy: { free_until_days_before_start?: number; late_fee_percent?: number; text?: string } | null;
  };
  offer: {
    end_date: string | null;
    location: string | null;
    delivery_format: string | null;
    duration_hours: number | null;
    modules: { title?: string; description?: string; hours?: number | string }[];
    terms: string | null;
    valid_until: string | null;
  } | null;
  start: { location: string | null; language: string | null } | null;
  buyer: {
    name: string;
    organization_number: string | null;
    address: { street?: string; postal_code?: string; city?: string; co?: string } | null;
    contact_name: string | null;
    contact_email: string | null;
  };
  provider: {
    name: string;
    organization_number: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  };
  seller: { name: string | null; org_number: string | null } | null;
  payment_terms_days: number | null;
}

export interface ContractDocument {
  title: string;
  notice: string;
  intro: string[];
  sections: { heading: string; paragraphs: string[] }[];
  signature: { date: string; place: string; name: string; title: string }[];
  fileName: string;
}

const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('sv-SE') : null);
const fill = (label: string) => `[${label}]`;
const or = (value: string | number | null | undefined, label: string) =>
  value === null || value === undefined || value === '' ? fill(label) : String(value);

function addressText(a: ContractContext['buyer']['address']): string {
  if (!a) return fill('adress');
  const parts = [a.co ? `c/o ${a.co}` : '', a.street ?? '', [a.postal_code, a.city].filter(Boolean).join(' ')].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : fill('adress');
}

function hoursText(h: number | string | undefined): string {
  if (h === undefined || h === '' || Number(h) === 0) return '';
  return ` (ca ${h} timmar)`;
}

function slugForFile(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function buildContract(
  ctx: ContractContext,
  opts: { variant: ContractVariant; buyerReference: string | null; generatedAt?: Date }
): ContractDocument {
  const { booking: b, offer, start, buyer, provider, seller } = ctx;
  const generated = (opts.generatedAt ?? new Date()).toLocaleDateString('sv-SE');
  const reference = opts.buyerReference?.trim() || null;
  const location = offer?.location || start?.location || null;
  const endDate = offer?.end_date ?? null;
  const vatPercent = `${Math.round(b.vat_rate * 10000) / 100} %`;
  const termsDays = ctx.payment_terms_days ?? 30;
  const policy = b.cancellation_policy;

  const intro = [
    `Denna överenskommelse reglerar villkoren för den utbildning som ${provider.name} (organisationsnummer ${or(provider.organization_number, 'organisationsnummer')}, adress ${fill('adress')}), nedan ”Lärosätet”, tillhandahåller åt ${buyer.name} (organisationsnummer ${or(buyer.organization_number, 'organisationsnummer')}, adress ${addressText(buyer.address)}), nedan ”Kunden”, benämnda ”Parterna” gemensamt och ”Part” var för sig.`,
    ...(reference ? [`Kundens referens (t.ex. diarienummer): ${reference}`] : []),
  ];

  const modules = (offer?.modules ?? []).filter(m => m.title);

  const education: string[] = [
    `Utbildningen är ”${b.title}” (nedan ”Utbildningen”) och genomförs för ${b.participants} deltagare.`,
    `Start: ${fmtDate(b.start_date) ?? fill('startdatum')}${endDate ? `. Slut: ${fmtDate(endDate)}` : `. Slut: ${fill('slutdatum')}`}.`,
    `Plats och genomförande: ${location ? location : fill('plats/digitalt')}${offer?.delivery_format ? `, format: ${offer.delivery_format}` : ''}${offer?.duration_hours ? `, omfattning ca ${offer.duration_hours} timmar` : ''}.`,
  ];
  if (start?.language) education.push(`Undervisningsspråk: ${start.language}.`);
  if (modules.length > 0) {
    education.push('Utbildningen består av följande moduler:');
    modules.forEach((m, i) => {
      education.push(`${i + 1}. ${m.title}${hoursText(m.hours)}${m.description ? ` – ${m.description}` : ''}`);
    });
  }
  if (offer?.terms) education.push(`Särskilda villkor enligt offert: ${offer.terms}`);

  const paymentParagraphs = [
    `Priset för Utbildningen är ${b.unit_price_ex_vat !== null ? `${formatSek(b.unit_price_ex_vat)} per deltagare exklusive moms` : fill('pris per deltagare')} för ${b.participants} deltagare, totalt ${formatSek(b.total_ex_vat)} exklusive moms. Moms (${vatPercent}) tillkommer i förekommande fall.`,
    `Betalning sker ${termsDays} dagar netto från fakturadatum. Faktura skickas efter att Utbildningen har startat. Fakturan ska märkas med ${reference ? `referensen ${reference}` : fill('Kundens fakturareferens')}.`,
    `Fakturering sker av ${or(seller?.name, 'säljarens namn')} (organisationsnummer ${or(seller?.org_number, 'organisationsnummer')}) på Lärosätets uppdrag. ${fill('Juridisk granskning krävs: hur betalningsflödet via plattformen ska beskrivas i avtalet')}`,
  ];

  const cancelParagraphs: string[] = [];
  if (policy && policy.free_until_days_before_start !== undefined && policy.late_fee_percent !== undefined) {
    cancelParagraphs.push(
      `Avbokning: Kunden kan avboka kostnadsfritt senast ${policy.free_until_days_before_start} dagar före start. Därefter debiteras ${policy.late_fee_percent} % av priset.${policy.text ? ` ${policy.text}` : ''}`
    );
  } else if (policy?.text) {
    cancelParagraphs.push(`Avbokning: ${policy.text}`);
  } else {
    cancelParagraphs.push(`Avbokning: ${fill('avbokningsvillkor saknas, ange villkor')}`);
  }

  const dispute =
    opts.variant === 'state_authority'
      ? 'Uppstår tvist mellan Parterna som inte kan lösas i samförstånd, ska frågan om det tvisten rör hänskjutas till regeringen.'
      : 'Uppstår tvist mellan Parterna som inte kan lösas i samförstånd, ska tvisten avgöras av allmän domstol med Stockholms tingsrätt som första instans.';

  const sections: ContractDocument['sections'] = [
    { heading: '1. Utbildningen', paragraphs: education },
    {
      heading: '2. Deltagare',
      paragraphs: [
        'Kunden utser deltagare bland sina anställda till de platser som Lärosätet erbjuder i Utbildningen. En lista över deltagare tillhandahålls av Kunden med lämpliga säkerhetsåtgärder för personuppgifterna.',
        fill('Personuppgiftsansvar och behandling av personuppgifter ska regleras här, t.ex. vem som är personuppgiftsansvarig och om personuppgiftsbiträdesavtal behövs. Granskas innan avtalet används'),
        fill('Stryk följande mening om Lärosätet inte omfattas av förordningen (2002:760) om uppdragsutbildning: Deltagare är inte studenter vid Lärosätet i högskolerättslig mening'),
      ],
    },
    {
      heading: '3. Lärosätets åtaganden',
      paragraphs: [
        'Lärosätet ansvarar för Utbildningens innehåll, planering, pedagogik och genomförande samt för administration och deltagarregistrering för Utbildningen, och återkopplar kursresultat till Kunden.',
        'Lärosätet förser på förfrågan Kunden med bekräftelse för enskilda deltagare i Utbildningen.',
        'Lärosätet ansvarar inte för litteratur, utrustning eller praktikplatser i annan utsträckning än vad som anges i kursplan, kurs-PM eller annan kursinformation.',
        'Lärosätet kan inte hållas ansvarigt för att enskilda deltagare inte godkänns på poänggivande moment i Utbildningen, eller för konsekvenser av Kundens eller deltagares tillämpning av innehållet i Utbildningen.',
        fill('Tillhandahållandet sker enligt tillämplig lagstiftning, t.ex. förordningen (2002:760) om uppdragsutbildning och avgiftsförordningen (1992:191) för statliga lärosäten. Granska och anpassa'),
      ],
    },
    {
      heading: '4. Kundens åtaganden',
      paragraphs: [
        'Kunden utser deltagare och ansvarar för att listan över deltagare är korrekt och uppdateras inför varje kursomgång.',
        'Kunden ansvarar för att på anmodan förse Lärosätet med relevant dokumentation och information som behövs för deltagande i Utbildningen.',
        'Kunden ansvarar för att deltagarna är erforderligt försäkrade under Utbildningen.',
        'Kunden ska i god tid informera Lärosätet om deltagares särskilda behov, t.ex. med anledning av funktionsnedsättning, så att Utbildningen kan genomföras för deltagaren.',
      ],
    },
    {
      heading: '5. Rättigheter till material',
      paragraphs: [
        'Upphovsrättsligt skyddat material som framställts av Lärosätet eller dess personal tillhör Lärosätet eller personalen. Utdelat kursmaterial får användas fritt av Kunden och deltagare inom ramen för deltagarnas anställning och Kundens ordinarie verksamhet, men får inte spridas kommersiellt eller i utbildningssyfte till tredje part utan Lärosätets skriftliga medgivande.',
        'Om material utvecklas gemensamt av Lärosätet och Kunden får Parterna använda det i enskilda utbildningsmoment inom ramen för Utbildningen, men inte till annat ändamål om inte Parterna särskilt har kommit överens om det.',
      ],
    },
    { heading: '6. Pris, betalning och avbokning', paragraphs: [...paymentParagraphs, ...cancelParagraphs] },
    {
      heading: '7. Ansvarsbegränsning',
      paragraphs: [
        'Lärosätet ansvarar inte för indirekt skada, följdskada, vinstbortfall eller liknande som kan uppstå hos Kunden till följd av genomförandet av Utbildningen eller uteblivet genomförande.',
        `Parts totala skadeståndsskyldighet med anledning av denna överenskommelse ska inte överstiga det högre av det totala priset enligt punkt 6 och ${fill('belopp i kronor')}. Begränsningen gäller inte vid skada som orsakats uppsåtligen eller av grov oaktsamhet.`,
      ],
    },
    {
      heading: '8. Överenskommelsens upphörande',
      paragraphs: [
        'Överenskommelsen gäller från och med sista datum för undertecknande och intill dess att Utbildningen har genomförts och full betalning har erlagts.',
        `Lärosätet förbehåller sig rätten att ställa in Utbildningen vid för få deltagare ${fill('ange gräns eller stryk')}. Överenskommelsen upphör då med omedelbar verkan, och om Kunden redan har betalat sker återbetalning inom trettio (30) dagar.`,
        'Vardera Part har rätt att säga upp överenskommelsen om den andra Parten bryter mot någon bestämmelse av väsentlig betydelse och inte vidtar rättelse inom trettio (30) dagar efter skriftlig begäran om rättelse.',
        'Ingen Part ska anses bryta mot överenskommelsen om Parten inte kan fullgöra sina åtaganden på grund av oförutsägbara händelser utanför Partens kontroll som inte kan övervinnas trots rimliga ansträngningar.',
      ],
    },
    {
      heading: '9. Kontaktpersoner',
      paragraphs: [
        `Kontaktperson hos Lärosätet: ${fill('namn och titel')}, ${or(provider.contact_email, 'e-post')}${provider.contact_phone ? `, ${provider.contact_phone}` : `, ${fill('telefon')}`}`,
        `Kontaktperson hos Kunden: ${or(buyer.contact_name, 'namn och titel')}, ${or(buyer.contact_email, 'e-post')}, ${fill('telefon')}`,
      ],
    },
    {
      heading: '10. Ändringar och tillägg',
      paragraphs: [
        'Ändringar och tillägg till denna överenskommelse ska vara skriftliga och undertecknade av behöriga företrädare för båda Parter och bifogas överenskommelsen. Undertecknade tillägg registreras i plattformen Uppdragsutbildning.nu.',
      ],
    },
    {
      heading: '11. Lagval och tvist',
      paragraphs: [
        'Svensk lag ska tillämpas på denna överenskommelse.',
        'Tvist angående överenskommelsens tillkomst, tolkning eller tillämpning ska i första hand lösas i samförstånd.',
        dispute,
      ],
    },
  ];

  return {
    title: 'ÖVERENSKOMMELSE OM UPPDRAGSUTBILDNING',
    notice:
      `UTKAST framtaget i Uppdragsutbildning.nu ${generated} (bokning ${b.id.slice(0, 8)}, mall ${CONTRACT_TEMPLATE_VERSION}). ` +
      'Utkastet är en mall och är inte juridiskt granskad. Text inom [hakparenteser] ska fyllas i eller strykas, och Parterna ansvarar för att innehållet stämmer före undertecknande. ' +
      'Ta bort denna ruta innan avtalet undertecknas. Efter undertecknande ska den signerade PDF-filen laddas upp i Uppdragsutbildning.nu.',
    intro,
    sections,
    signature: [
      { date: fill('datum'), place: fill('ort'), name: fill('namn'), title: `${provider.name}, ${fill('befattning')}` },
      { date: fill('datum'), place: fill('ort'), name: fill('namn'), title: `${buyer.name}, ${fill('befattning')}` },
    ],
    fileName: `avtal-${slugForFile(b.title) || 'uppdragsutbildning'}-${b.id.slice(0, 8)}.doc`,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Text inom [hakparenteser] markeras gult så att det syns vad som ska fyllas i.
function mark(s: string): string {
  return esc(s).replace(/\[[^\]]+\]/g, m => `<span style="background:#fff59d">${m}</span>`);
}

// Word öppnar HTML med Word-namnrymder som ett redigerbart dokument. Ingen extern
// dokumentbyggare behövs.
export function contractToWordHtml(doc: ContractDocument): string {
  const body = [
    `<div style="border:1px solid #999;background:#f5f5f5;padding:8pt;font-size:9pt;margin-bottom:14pt">${mark(doc.notice)}</div>`,
    `<h1 style="font-size:16pt;text-align:center;margin:0 0 14pt">${esc(doc.title)}</h1>`,
    ...doc.intro.map(p => `<p>${mark(p)}</p>`),
    ...doc.sections.flatMap(s => [`<h2 style="font-size:12pt;margin:14pt 0 4pt">${esc(s.heading)}</h2>`, ...s.paragraphs.map(p => `<p>${mark(p)}</p>`)]),
    '<p style="margin-top:28pt">Denna överenskommelse har upprättats elektroniskt eller i två likalydande exemplar, varav Parterna tagit var sitt.</p>',
    '<table style="width:100%;margin-top:20pt;border-collapse:collapse"><tr>',
    ...doc.signature.map(
      sig =>
        `<td style="width:50%;vertical-align:top;padding-right:20pt"><p>Datum: ${mark(sig.date)}<br/>Ort: ${mark(sig.place)}</p><p style="margin-top:36pt;border-top:1px solid #000;padding-top:4pt">${mark(sig.name)}<br/>${mark(sig.title)}</p></td>`
    ),
    '</tr></table>',
  ].join('\n');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4}p{margin:0 0 6pt}</style></head>
<body>${body}</body></html>`;
}

export function downloadContractWord(doc: ContractDocument): void {
  const blob = new Blob(['﻿', contractToWordHtml(doc)], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
