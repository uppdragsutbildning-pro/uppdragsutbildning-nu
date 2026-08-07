import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { sendEmail } from './_lib/sendEmail.js';
import {
  rfpReceived,
  rfpResponded,
  bookingConfirmed,
  rfpDeclined,
  applicationReceived,
  applicationConfirmed,
} from './_lib/emailTemplates.js';

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;
const APP_URL = process.env.APP_URL;

async function getProviderContactEmail(trainingId: string): Promise<{ email: string | null; title: string | null }> {
  const { data } = await supabaseAdmin
    .from('trainings')
    .select('title, providers(contact_email)')
    .eq('id', trainingId)
    .single();
  const providers = data?.providers as { contact_email?: string } | { contact_email?: string }[] | null;
  const email = Array.isArray(providers) ? providers[0]?.contact_email : providers?.contact_email;
  return { email: email ?? null, title: data?.title ?? null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-webhook-secret'];
  if (!secret || secret !== process.env.NOTIFY_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { table, operation, record, old_record } = req.body;

  try {
    if (table === 'custom_requests' && operation === 'INSERT') {
      if (record.training_id) {
        const { email } = await getProviderContactEmail(record.training_id);
        if (email) {
          const content = rfpReceived({
            companyName: record.company,
            courseTopic: record.course_topic,
            linkUrl: APP_URL ? `${APP_URL}/provider/requests` : undefined,
          });
          await sendEmail({ to: email, ...content, messageType: 'rfp_received', relatedTable: 'custom_requests', relatedId: record.id });
        }
      }
    } else if (table === 'custom_requests' && operation === 'UPDATE') {
      const statusChanged = old_record?.status !== record.status;
      if (statusChanged && record.status === 'responded') {
        const content = rfpResponded({ courseTopic: record.course_topic });
        await sendEmail({ to: record.contact_email, ...content, messageType: 'rfp_responded', relatedTable: 'custom_requests', relatedId: record.id });
      } else if (statusChanged && record.status === 'accepted') {
        if (record.training_id) {
          const { email } = await getProviderContactEmail(record.training_id);
          if (email) {
            const content = bookingConfirmed({
              companyName: record.company,
              courseTopic: record.course_topic,
              linkUrl: APP_URL ? `${APP_URL}/provider/requests` : undefined,
            });
            await sendEmail({ to: email, ...content, messageType: 'booking_confirmed', relatedTable: 'custom_requests', relatedId: record.id });
          }
        }
        if (ADMIN_EMAIL) {
          const content = bookingConfirmed({
            companyName: record.company,
            courseTopic: record.course_topic,
            linkUrl: APP_URL ? `${APP_URL}/admin` : undefined,
          });
          await sendEmail({ to: ADMIN_EMAIL, ...content, messageType: 'booking_confirmed', relatedTable: 'custom_requests', relatedId: record.id });
        }
      } else if (statusChanged && record.status === 'declined') {
        const content = rfpDeclined({ courseTopic: record.course_topic });
        await sendEmail({ to: record.contact_email, ...content, messageType: 'rfp_declined', relatedTable: 'custom_requests', relatedId: record.id });
      }
    } else if (table === 'applications' && operation === 'INSERT') {
      if (record.training_id) {
        const { email, title } = await getProviderContactEmail(record.training_id);
        if (email) {
          const content = applicationReceived({
            courseTitle: title ?? 'kursen',
            studentName: record.student_name,
            linkUrl: APP_URL ? `${APP_URL}/provider/dashboard` : undefined,
          });
          await sendEmail({ to: email, ...content, messageType: 'application_received', relatedTable: 'applications', relatedId: record.id });
        }
      }
    } else if (table === 'applications' && operation === 'UPDATE') {
      const statusChanged = old_record?.status !== record.status;
      if (statusChanged && record.status === 'confirmed') {
        const { title } = record.training_id ? await getProviderContactEmail(record.training_id) : { title: null };
        const content = applicationConfirmed({
          courseTitle: title ?? 'kursen',
          linkUrl: APP_URL && record.training_id ? `${APP_URL}/training/${record.training_id}` : undefined,
        });
        await sendEmail({ to: record.student_email, ...content, messageType: 'application_confirmed', relatedTable: 'applications', relatedId: record.id });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify-webhook error:', err);
    // Returnera ändå 200 - webhooken kommer inte att göras om av pg_net, och
    // ett fel här ska inte påverka den ursprungliga databasoperationen.
    return res.status(200).json({ ok: false, error: String(err) });
  }
}
