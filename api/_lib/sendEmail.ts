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
  const apiKey = process.env.BREVO_API_KEY;
  let status: 'sent' | 'failed' = 'failed';
  let errorMessage: string | undefined;
  let providerMessageId: string | undefined;

  if (!apiKey) {
    errorMessage = 'BREVO_API_KEY saknas';
  } else {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Uppdragsutbildning.nu', email: 'no-reply@uppdragsutbildning.com' },
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        status = 'sent';
        providerMessageId = data.messageId;
      } else {
        errorMessage = data.message || `Brevo svarade ${res.status}`;
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
    provider_message_id: providerMessageId ?? null,
  });

  return { success: status === 'sent', error: errorMessage };
}
