interface EmailContent {
  subject: string;
  html: string;
}

// Mallarna för anpassade efterfrågningar innehåller fritext från köpare/admin: escapa alltid.
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ctaButton(linkUrl: string | undefined, label: string): string {
  if (!linkUrl) return '';
  return `
    <table role="presentation">
      <tr><td style="border-radius:6px;background-color:#16a34a;margin-top:8px;">
        <a href="${linkUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;">${label}</a>
      </td></tr>
    </table>
  `;
}

function wrapEmail(preheader: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,sans-serif;">
  <span style="display:none;font-size:1px;color:#f8fafc;">${preheader}</span>
  <table role="presentation" width="100%" style="background-color:#f8fafc;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" style="background-color:#ffffff;border-radius:12px;padding:32px;">
        <tr><td>
          <p style="color:#2563eb;font-weight:bold;font-size:18px;margin:0 0 24px 0;">Uppdragsutbildning</p>
          ${bodyHtml}
          <p style="color:#94a3b8;font-size:12px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;">
            Detta är ett automatiskt meddelande, svara inte på det här mejlet.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function rfpReceived(params: { companyName: string; courseTopic: string; linkUrl?: string }): EmailContent {
  const { companyName, courseTopic, linkUrl } = params;
  return {
    subject: `Ny offertförfrågan: ${courseTopic}`,
    html: wrapEmail('Ni har fått en ny offertförfrågan', `
      <h1 style="font-size:20px;color:#0f172a;">Ny offertförfrågan</h1>
      <p style="color:#334155;line-height:1.6;">
        ${companyName} har skickat en offertförfrågan gällande <strong>${courseTopic}</strong>.
        Logga in på Leverantörsportalen för att se detaljer och svara.
      </p>
      ${ctaButton(linkUrl, 'Logga in på Leverantörsportalen')}
    `),
  };
}

export function rfpResponded(params: { courseTopic: string; linkUrl?: string }): EmailContent {
  const { courseTopic, linkUrl } = params;
  return {
    subject: `Leverantören har svarat på din förfrågan`,
    html: wrapEmail('Leverantören har svarat', `
      <h1 style="font-size:20px;color:#0f172a;">Leverantören har svarat</h1>
      <p style="color:#334155;line-height:1.6;">
        Din förfrågan gällande <strong>${courseTopic}</strong> har fått ett svar. Logga in för att läsa det.
      </p>
      ${ctaButton(linkUrl, 'Se svaret i Mitt konto')}
    `),
  };
}

export function bookingConfirmed(params: { companyName: string; courseTopic: string; linkUrl?: string }): EmailContent {
  const { companyName, courseTopic, linkUrl } = params;
  return {
    subject: `Bokning bekräftad: ${courseTopic}`,
    html: wrapEmail('En bokning har bekräftats', `
      <h1 style="font-size:20px;color:#0f172a;">Bokning bekräftad</h1>
      <p style="color:#334155;line-height:1.6;">
        Förfrågan från ${companyName} gällande <strong>${courseTopic}</strong> har bekräftats som en bokning.
      </p>
      ${ctaButton(linkUrl, 'Logga in')}
    `),
  };
}

export function rfpDeclined(params: { courseTopic: string }): EmailContent {
  const { courseTopic } = params;
  return {
    subject: `Din förfrågan har avböjts`,
    html: wrapEmail('Din förfrågan har avböjts', `
      <h1 style="font-size:20px;color:#0f172a;">Din förfrågan har avböjts</h1>
      <p style="color:#334155;line-height:1.6;">
        Tyvärr har er förfrågan gällande <strong>${courseTopic}</strong> avböjts av leverantören.
        Logga in för att se fler alternativ i katalogen.
      </p>
    `),
  };
}

export function rfpEscalated(params: { companyName: string; courseTopic: string; submittedAt: string; linkUrl?: string }): EmailContent {
  const { companyName, courseTopic, submittedAt, linkUrl } = params;
  return {
    subject: `Eskalering: obesvarad förfrågan från ${companyName}`,
    html: wrapEmail('En förfrågan har inte fått svar i tid', `
      <h1 style="font-size:20px;color:#0f172a;">Obesvarad förfrågan</h1>
      <p style="color:#334155;line-height:1.6;">
        Förfrågan från <strong>${companyName}</strong> gällande <strong>${courseTopic}</strong>
        (inskickad ${submittedAt}) har inte fått något svar inom svarstiden. Manuell uppföljning krävs.
      </p>
      ${ctaButton(linkUrl, 'Öppna i Adminpanelen')}
    `),
  };
}

export function applicationReceived(params: { courseTitle: string; studentName: string; linkUrl?: string }): EmailContent {
  const { courseTitle, studentName, linkUrl } = params;
  return {
    subject: `Ny kursanmälan: ${courseTitle}`,
    html: wrapEmail('Ni har fått en ny kursanmälan', `
      <h1 style="font-size:20px;color:#0f172a;">Ny kursanmälan</h1>
      <p style="color:#334155;line-height:1.6;">
        ${studentName} har anmält sig till <strong>${courseTitle}</strong>. Logga in på Leverantörsportalen för att hantera anmälan.
      </p>
      ${ctaButton(linkUrl, 'Logga in på Leverantörsportalen')}
    `),
  };
}

export function applicationConfirmed(params: { courseTitle: string; linkUrl?: string; termsUrl?: string }): EmailContent {
  const { courseTitle, linkUrl, termsUrl } = params;
  return {
    subject: `Din anmälan är bekräftad: ${courseTitle}`,
    html: wrapEmail('Din anmälan är bekräftad', `
      <h1 style="font-size:20px;color:#0f172a;">Din anmälan är bekräftad</h1>
      <p style="color:#334155;line-height:1.6;">
        Din anmälan till <strong>${courseTitle}</strong> är nu bekräftad. Vi hörs inför kursstart.
      </p>
      ${ctaButton(linkUrl, 'Se kursen')}
      ${termsUrl ? `<p style="color:#64748b;font-size:14px;line-height:1.6;margin-top:16px;"><a href="${termsUrl}" style="color:#2563eb;">Läs leverantörens villkor</a></p>` : ''}
    `),
  };
}

// ── Anpassade utbildningsefterfrågningar ─────────────────────────────────

export function trainingRequestSubmitted(params: { title: string; organizationName?: string | null; linkUrl?: string }): EmailContent {
  const { title, organizationName, linkUrl } = params;
  return {
    subject: `Ny efterfrågan: ${title}`,
    html: wrapEmail('En ny efterfrågan på anpassad utbildning har kommit in', `
      <h1 style="font-size:20px;color:#0f172a;">Ny efterfrågan</h1>
      <p style="color:#334155;line-height:1.6;">
        ${organizationName ? `${esc(organizationName)} har` : 'En köpare har'} efterfrågat en anpassad utbildning:
        <strong>${esc(title)}</strong>. Granska den och välj lärosäten.
      </p>
      ${ctaButton(linkUrl, 'Öppna i Adminpanelen')}
    `),
  };
}

export function trainingRequestAssignedBuyer(params: { title: string; count: number; linkUrl?: string }): EmailContent {
  const { title, count, linkUrl } = params;
  return {
    subject: `Din efterfrågan har skickats till ${count} ${count === 1 ? 'lärosäte' : 'lärosäten'}`,
    html: wrapEmail('Din efterfrågan är på väg till lärosäten', `
      <h1 style="font-size:20px;color:#0f172a;">Din efterfrågan har skickats vidare</h1>
      <p style="color:#334155;line-height:1.6;">
        Din efterfrågan <strong>${esc(title)}</strong> har skickats till ${count} ${count === 1 ? 'lärosäte' : 'lärosäten'}.
        Du får ett mejl när en offert kommer in, och du kan följa förloppet i Mitt konto.
      </p>
      ${ctaButton(linkUrl, 'Följ din efterfrågan')}
    `),
  };
}

export function trainingRequestAssignedProvider(params: { title: string; organizationName?: string | null; deadline: string; linkUrl?: string }): EmailContent {
  const { title, organizationName, deadline, linkUrl } = params;
  return {
    subject: `Ny anpassad efterfrågan: ${title}`,
    html: wrapEmail('Ni har fått en anpassad efterfrågan att svara på', `
      <h1 style="font-size:20px;color:#0f172a;">Ny anpassad efterfrågan</h1>
      <p style="color:#334155;line-height:1.6;">
        ${organizationName ? `${esc(organizationName)} söker` : 'En köpare söker'} en anpassad utbildning:
        <strong>${esc(title)}</strong>. Svara senast <strong>${esc(deadline)}</strong>, antingen med en offert eller genom att avböja.
      </p>
      ${ctaButton(linkUrl, 'Öppna Efterfrågningar')}
    `),
  };
}

export function trainingRequestNoMatch(params: { title: string; message?: string | null; linkUrl?: string }): EmailContent {
  const { title, message, linkUrl } = params;
  return {
    subject: `Vi hittade inget lärosäte för din efterfrågan`,
    html: wrapEmail('Vi kunde tyvärr inte matcha din efterfrågan', `
      <h1 style="font-size:20px;color:#0f172a;">Vi hittade ingen matchning just nu</h1>
      <p style="color:#334155;line-height:1.6;">
        Tyvärr har vi inte hittat ett lärosäte som kan leverera <strong>${esc(title)}</strong> just nu.
      </p>
      ${message ? `<p style="color:#334155;line-height:1.6;background-color:#f1f5f9;border-radius:8px;padding:12px 16px;">${esc(message)}</p>` : ''}
      ${ctaButton(linkUrl, 'Se din efterfrågan')}
    `),
  };
}

export function trainingRequestClosed(params: { title: string; message?: string | null; linkUrl?: string }): EmailContent {
  const { title, message, linkUrl } = params;
  return {
    subject: `Din efterfrågan är avslutad`,
    html: wrapEmail('Din efterfrågan har avslutats', `
      <h1 style="font-size:20px;color:#0f172a;">Din efterfrågan är avslutad</h1>
      <p style="color:#334155;line-height:1.6;">
        Efterfrågan <strong>${esc(title)}</strong> har avslutats.
      </p>
      ${message ? `<p style="color:#334155;line-height:1.6;background-color:#f1f5f9;border-radius:8px;padding:12px 16px;">${esc(message)}</p>` : ''}
      ${ctaButton(linkUrl, 'Se din efterfrågan')}
    `),
  };
}

export function trainingAssignmentOverdue(params: { title: string; providerName: string; deadline: string; linkUrl?: string }): EmailContent {
  const { title, providerName, deadline, linkUrl } = params;
  return {
    subject: `Obesvarad efterfrågan hos ${providerName}`,
    html: wrapEmail('Ett lärosäte har inte svarat i tid', `
      <h1 style="font-size:20px;color:#0f172a;">Deadline passerad utan svar</h1>
      <p style="color:#334155;line-height:1.6;">
        <strong>${esc(providerName)}</strong> har inte svarat på efterfrågan <strong>${esc(title)}</strong>
        (deadline ${esc(deadline)}). Följ upp eller tilldela fler lärosäten.
      </p>
      ${ctaButton(linkUrl, 'Öppna i Adminpanelen')}
    `),
  };
}

// Samlat mejl till admin när fakturaunderlag har blivit klara (kursstart). Ett mejl per körning.
export interface ReadyBasisItem {
  number: string;
  title: string;
  providerName: string;
  buyerName: string;
  startDate: string;
  totalExVat: string;
}

export function invoiceBasesReady(params: { items: ReadyBasisItem[]; more: number; linkUrl?: string }): EmailContent {
  const { items, more, linkUrl } = params;
  const total = items.length + more;
  const rows = items
    .map(
      i => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;">
          <strong>${esc(i.number)}</strong> · ${esc(i.title)}<br/>
          <span style="color:#64748b;font-size:13px;">${esc(i.buyerName)} · ${esc(i.providerName)} · start ${esc(i.startDate)} · ${esc(i.totalExVat)} exkl. moms</span>
        </td>
      </tr>`
    )
    .join('');
  return {
    subject: total === 1 ? '1 fakturaunderlag är klart för fakturering' : `${total} fakturaunderlag är klara för fakturering`,
    html: wrapEmail('Kurser har startat och underlag kan faktureras', `
      <h1 style="font-size:20px;color:#0f172a;">Klara för fakturering</h1>
      <p style="color:#334155;line-height:1.6;">
        ${total === 1 ? 'Ett fakturaunderlag har' : `${total} fakturaunderlag har`} blivit klart eftersom kursen har startat.
        Granska, justera vid behov och skapa fakturan i Fortnox.
      </p>
      <table role="presentation" width="100%" style="margin:16px 0;">${rows}</table>
      ${more > 0 ? `<p style="color:#64748b;font-size:13px;">…och ${more} till. Se alla i Adminpanelen.</p>` : ''}
      ${ctaButton(linkUrl, 'Öppna Fakturering')}
    `),
  };
}

// ── Fakturering Fas 1: notiser (paket I) ─────────────────────────────────

function sekText(n: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 2 }).format(n);
}

export function bookingConfirmedBuyer(params: {
  title: string;
  providerName: string;
  startDate: string;
  participants: number;
  totalExVat: number;
  linkUrl?: string;
}): EmailContent {
  const { title, providerName, startDate, participants, totalExVat, linkUrl } = params;
  return {
    subject: `Bokning bekräftad: ${title}`,
    html: wrapEmail('Er bokning är bekräftad', `
      <h1 style="font-size:20px;color:#0f172a;">Bokningen är bekräftad</h1>
      <p style="color:#334155;line-height:1.6;">
        Er bokning av <strong>${esc(title)}</strong> hos ${esc(providerName)} är bekräftad.
      </p>
      <p style="color:#334155;line-height:1.6;">
        Start: ${esc(startDate)}<br/>
        Antal deltagare: ${participants}<br/>
        Pris: ${esc(sekText(totalExVat))} exklusive moms
      </p>
      <p style="color:#334155;line-height:1.6;">
        Fakturan skickas från Uppdragsutbildning till organisationens fakturamejl. Status och belopp följer ni under Mitt konto.
      </p>
      ${ctaButton(linkUrl, 'Öppna Mitt konto')}
    `),
  };
}

export function bookingConfirmedProvider(params: {
  title: string;
  buyerName: string;
  startDate: string;
  participants: number;
  linkUrl?: string;
}): EmailContent {
  const { title, buyerName, startDate, participants, linkUrl } = params;
  return {
    subject: `Ny bokning: ${title}`,
    html: wrapEmail('En bokning har bekräftats', `
      <h1 style="font-size:20px;color:#0f172a;">Ny bokning</h1>
      <p style="color:#334155;line-height:1.6;">
        <strong>${esc(buyerName)}</strong> har bokat <strong>${esc(title)}</strong>.
      </p>
      <p style="color:#334155;line-height:1.6;">
        Start: ${esc(startDate)}<br/>
        Antal deltagare: ${participants}
      </p>
      <p style="color:#334155;line-height:1.6;">
        Fakturering och utbetalning hanteras av Uppdragsutbildning. Ni följer underlaget under Fakturering.
      </p>
      ${ctaButton(linkUrl, 'Öppna Fakturering')}
    `),
  };
}

export function quoteNotSelected(params: { title: string; reasonLabel?: string | null; reasonText?: string | null; linkUrl?: string }): EmailContent {
  const { title, reasonLabel, reasonText, linkUrl } = params;
  const reason = reasonLabel || reasonText
    ? `<p style="color:#334155;line-height:1.6;">Köparens anledning: ${[reasonLabel, reasonText].filter(Boolean).map(v => esc(v as string)).join(' – ')}</p>`
    : '';
  return {
    subject: `Ej vald: ${title}`,
    html: wrapEmail('Köparen har valt en annan offert', `
      <h1 style="font-size:20px;color:#0f172a;">Köparen har valt en annan offert</h1>
      <p style="color:#334155;line-height:1.6;">
        Tack för er offert på <strong>${esc(title)}</strong>. Köparen har valt en annan offert och tackat nej till er.
      </p>
      ${reason}
      ${ctaButton(linkUrl, 'Öppna Förfrågningar')}
    `),
  };
}

export function requestClosedForProvider(params: { title: string; linkUrl?: string }): EmailContent {
  const { title, linkUrl } = params;
  return {
    subject: `Efterfrågan avslutad: ${title}`,
    html: wrapEmail('Efterfrågan har avslutats', `
      <h1 style="font-size:20px;color:#0f172a;">Efterfrågan är avslutad</h1>
      <p style="color:#334155;line-height:1.6;">
        Köparen har valt en offert på <strong>${esc(title)}</strong>. Ni behöver inte svara längre.
      </p>
      ${ctaButton(linkUrl, 'Öppna Efterfrågningar')}
    `),
  };
}

export function payoutMade(params: { title: string; buyerName: string; amount: number; paidOutDate: string; linkUrl?: string }): EmailContent {
  const { title, buyerName, amount, paidOutDate, linkUrl } = params;
  return {
    subject: `Utbetalning genomförd: ${title}`,
    html: wrapEmail('En utbetalning har genomförts', `
      <h1 style="font-size:20px;color:#0f172a;">Utbetalning genomförd</h1>
      <p style="color:#334155;line-height:1.6;">
        Utbetalningen för <strong>${esc(title)}</strong> (${esc(buyerName)}) är genomförd: <strong>${esc(sekText(amount))}</strong>
        den ${esc(paidOutDate)}. Beloppet är exklusive moms och efter provision.
      </p>
      ${ctaButton(linkUrl, 'Öppna Fakturering')}
    `),
  };
}

export function cancellationRequestedAdmin(params: { title: string; buyerName: string; providerName: string; message?: string | null; linkUrl?: string }): EmailContent {
  const { title, buyerName, providerName, message, linkUrl } = params;
  return {
    subject: `Begäran om avbokning: ${title}`,
    html: wrapEmail('En köpare vill avboka', `
      <h1 style="font-size:20px;color:#0f172a;">Begäran om avbokning</h1>
      <p style="color:#334155;line-height:1.6;">
        <strong>${esc(buyerName)}</strong> vill avboka <strong>${esc(title)}</strong> hos ${esc(providerName)}.
        Fria avbokningstiden har gått ut, eller så saknas registrerad policy.
      </p>
      ${message ? `<p style="color:#334155;line-height:1.6;">Meddelande: ”${esc(message)}”</p>` : ''}
      ${ctaButton(linkUrl, 'Öppna Fakturering')}
    `),
  };
}

export interface PayoutReminderItem {
  number: string;
  providerName: string;
  title: string;
  payoutAmount: string;
  dueDate: string;
}

export function payoutReminderAdmin(params: { items: PayoutReminderItem[]; linkUrl?: string }): EmailContent {
  const { items, linkUrl } = params;
  const rows = items
    .map(
      i => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;">
          <strong>${esc(i.number)}</strong> · ${esc(i.providerName)} · ${esc(i.title)}<br/>
          <span style="color:#64748b;font-size:13px;">${esc(i.payoutAmount)} · utbetalning planerad ${esc(i.dueDate)}</span>
        </td>
      </tr>`
    )
    .join('');
  return {
    subject: items.length === 1 ? '1 utbetalning närmar sig' : `${items.length} utbetalningar närmar sig`,
    html: wrapEmail('Utbetalningar ska göras snart', `
      <h1 style="font-size:20px;color:#0f172a;">Utbetalningar att göra</h1>
      <p style="color:#334155;line-height:1.6;">Köparen har betalat och utbetalningen till lärosätet ska göras snart.</p>
      <table role="presentation" width="100%" style="margin:16px 0;">${rows}</table>
      ${ctaButton(linkUrl, 'Öppna Fakturering')}
    `),
  };
}
