import { supabaseAdmin } from './supabaseAdmin';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  messageType: string;
  relatedTable?: string;
  relatedId?: string;
}

interface SendEmailResult {
  success: boolean;
  error?: string;
}

export async function sendEmail({ to, subject, html, messageType, relatedTable, relatedId }: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  let status: 'sent' | 'failed' = 'failed';
  let errorMessage: string | undefined;
  let resendId: string | undefined;

  if (!apiKey) {
    errorMessage = 'RESEND_API_KEY saknas';
  } else {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Uppdragsutbildning.nu <no-reply@uppdragsutbildning.nu>',
          to,
          subject,
          html,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        status = 'sent';
        resendId = data.id;
      } else {
        errorMessage = data.message || `Resend svarade ${res.status}`;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  await supabaseAdmin.from('email_log').insert({
    message_type: messageType,
    recipient_email: to,
    related_table: relatedTable ?? null,
    related_id: relatedId ?? null,
    status,
    error_message: errorMessage ?? null,
    resend_id: resendId ?? null,
  });

  return { success: status === 'sent', error: errorMessage };
}
