interface EmailContent {
  subject: string;
  html: string;
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
          <p style="color:#2563eb;font-weight:bold;font-size:18px;margin:0 0 24px 0;">Uppdragsutbildning.nu</p>
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

export function rfpReceived(params: { companyName: string; courseTopic: string }): EmailContent {
  const { companyName, courseTopic } = params;
  return {
    subject: `Ny offertförfrågan: ${courseTopic}`,
    html: wrapEmail('Ni har fått en ny offertförfrågan', `
      <h1 style="font-size:20px;color:#0f172a;">Ny offertförfrågan</h1>
      <p style="color:#334155;line-height:1.6;">
        ${companyName} har skickat en offertförfrågan gällande <strong>${courseTopic}</strong>.
        Logga in på Leverantörsportalen för att se detaljer och svara.
      </p>
    `),
  };
}

export function rfpResponded(params: { courseTopic: string }): EmailContent {
  const { courseTopic } = params;
  return {
    subject: `Leverantören har svarat på din förfrågan`,
    html: wrapEmail('Leverantören har svarat', `
      <h1 style="font-size:20px;color:#0f172a;">Leverantören har svarat</h1>
      <p style="color:#334155;line-height:1.6;">
        Din förfrågan gällande <strong>${courseTopic}</strong> har fått ett svar. Logga in för att läsa det.
      </p>
    `),
  };
}

export function bookingConfirmed(params: { companyName: string; courseTopic: string }): EmailContent {
  const { companyName, courseTopic } = params;
  return {
    subject: `Bokning bekräftad: ${courseTopic}`,
    html: wrapEmail('En bokning har bekräftats', `
      <h1 style="font-size:20px;color:#0f172a;">Bokning bekräftad</h1>
      <p style="color:#334155;line-height:1.6;">
        Förfrågan från ${companyName} gällande <strong>${courseTopic}</strong> har bekräftats som en bokning.
      </p>
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

export function rfpEscalated(params: { companyName: string; courseTopic: string; submittedAt: string }): EmailContent {
  const { companyName, courseTopic, submittedAt } = params;
  return {
    subject: `Eskalering: obesvarad förfrågan från ${companyName}`,
    html: wrapEmail('En förfrågan har inte fått svar i tid', `
      <h1 style="font-size:20px;color:#0f172a;">Obesvarad förfrågan</h1>
      <p style="color:#334155;line-height:1.6;">
        Förfrågan från <strong>${companyName}</strong> gällande <strong>${courseTopic}</strong>
        (inskickad ${submittedAt}) har inte fått något svar inom svarstiden. Manuell uppföljning krävs.
      </p>
    `),
  };
}

export function applicationReceived(params: { courseTitle: string; studentName: string }): EmailContent {
  const { courseTitle, studentName } = params;
  return {
    subject: `Ny kursanmälan: ${courseTitle}`,
    html: wrapEmail('Ni har fått en ny kursanmälan', `
      <h1 style="font-size:20px;color:#0f172a;">Ny kursanmälan</h1>
      <p style="color:#334155;line-height:1.6;">
        ${studentName} har anmält sig till <strong>${courseTitle}</strong>. Logga in på Leverantörsportalen för att hantera anmälan.
      </p>
    `),
  };
}

export function applicationConfirmed(params: { courseTitle: string }): EmailContent {
  const { courseTitle } = params;
  return {
    subject: `Din anmälan är bekräftad: ${courseTitle}`,
    html: wrapEmail('Din anmälan är bekräftad', `
      <h1 style="font-size:20px;color:#0f172a;">Din anmälan är bekräftad</h1>
      <p style="color:#334155;line-height:1.6;">
        Din anmälan till <strong>${courseTitle}</strong> är nu bekräftad. Vi hörs inför kursstart.
      </p>
    `),
  };
}
