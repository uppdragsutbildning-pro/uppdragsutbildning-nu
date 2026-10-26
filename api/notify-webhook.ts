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
  trainingRequestSubmitted,
  trainingRequestAssignedBuyer,
  trainingRequestAssignedProvider,
  trainingRequestNoMatch,
  trainingRequestClosed,
} from './_lib/emailTemplates.js';

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;
const APP_URL = process.env.APP_URL;

async function getProviderContactEmail(trainingId: string): Promise<{ email: string | null; title: string | null; slug: string | null; providerId: string | null }> {
  const { data } = await supabaseAdmin
    .from('trainings')
    .select('title, slug, providers(id, contact_email)')
    .eq('id', trainingId)
    .single();
  const providers = data?.providers as { id?: string; contact_email?: string } | { id?: string; contact_email?: string }[] | null;
  const provider = Array.isArray(providers) ? providers[0] : providers;
  return { email: provider?.contact_email ?? null, title: data?.title ?? null, slug: data?.slug ?? null, providerId: provider?.id ?? null };
}

interface TrainingRequestEvent {
  id: string;
  request_id: string;
  event_type: string;
  visible_to_buyer: boolean;
  payload: Record<string, unknown> | null;
}

async function getBuyerEmail(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

// Leverantörens användare (aktiva profiler); faller tillbaka på providers.contact_email.
async function getProviderRecipients(providerId: string): Promise<string[]> {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('provider_id', providerId)
    .eq('role', 'provider')
    .eq('is_active', true);
  const emails = (profiles ?? []).map(p => p.email).filter((e): e is string => !!e);
  if (emails.length > 0) return [...new Set(emails)];
  const { data: provider } = await supabaseAdmin.from('providers').select('contact_email').eq('id', providerId).single();
  return provider?.contact_email ? [provider.contact_email] : [];
}

async function handleTrainingRequestEvent(ev: TrainingRequestEvent) {
  const { data: req } = await supabaseAdmin
    .from('training_requests')
    .select('title, buyer_user_id, organizations(name)')
    .eq('id', ev.request_id)
    .single();
  if (!req) return;

  const orgs = req.organizations as { name?: string } | { name?: string }[] | null;
  const organizationName = (Array.isArray(orgs) ? orgs[0]?.name : orgs?.name) ?? null;
  const payload = ev.payload ?? {};
  const message = typeof payload.message === 'string' ? payload.message : null;
  const mail = { relatedTable: 'training_requests', relatedId: ev.request_id };
  const accountLink = APP_URL ? `${APP_URL}/konto?tab=efterfragningar` : undefined;

  if (ev.event_type === 'submitted') {
    if (!ADMIN_EMAIL) return;
    const content = trainingRequestSubmitted({ title: req.title, organizationName, linkUrl: APP_URL ? `${APP_URL}/admin` : undefined });
    await sendEmail({ to: ADMIN_EMAIL, ...content, messageType: 'training_request_submitted', ...mail });
  } else if (ev.event_type === 'assigned' && ev.visible_to_buyer) {
    const content = trainingRequestAssignedBuyer({ title: req.title, count: Number(payload.count ?? 0), linkUrl: accountLink });
    await sendEmail({ to: await getBuyerEmail(req.buyer_user_id), ...content, messageType: 'training_request_assigned_buyer', ...mail });
  } else if (ev.event_type === 'assigned') {
    const providerId = typeof payload.provider_id === 'string' ? payload.provider_id : null;
    if (!providerId) return;
    const deadline = typeof payload.response_deadline === 'string' ? new Date(payload.response_deadline).toLocaleDateString('sv-SE') : '';
    const content = trainingRequestAssignedProvider({
      title: req.title,
      organizationName,
      deadline,
      linkUrl: APP_URL ? `${APP_URL}/provider/efterfragningar` : undefined,
    });
    const recipients = await getProviderRecipients(providerId);
    // Ingen mottagare: logga ett misslyckat utskick (jfr sendEmail) i stället för att hoppa över tyst.
    for (const to of recipients.length > 0 ? recipients : [null]) {
      await sendEmail({ to, ...content, messageType: 'training_request_assigned_provider', ...mail });
    }
  } else if (ev.event_type === 'no_match') {
    const content = trainingRequestNoMatch({ title: req.title, message, linkUrl: accountLink });
    await sendEmail({ to: await getBuyerEmail(req.buyer_user_id), ...content, messageType: 'training_request_no_match', ...mail });
  } else if (ev.event_type === 'closed') {
    const content = trainingRequestClosed({ title: req.title, message, linkUrl: accountLink });
    await sendEmail({ to: await getBuyerEmail(req.buyer_user_id), ...content, messageType: 'training_request_closed', ...mail });
  }
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
        const content = rfpReceived({
          companyName: record.company,
          courseTopic: record.course_topic,
          linkUrl: APP_URL ? `${APP_URL}/provider/requests` : undefined,
        });
        await sendEmail({ to: email, ...content, messageType: 'rfp_received', relatedTable: 'custom_requests', relatedId: record.id });
      }
    } else if (table === 'custom_requests' && operation === 'UPDATE') {
      const statusChanged = old_record?.status !== record.status;
      if (statusChanged && record.status === 'responded') {
        // Offerter från anpassade efterfrågningar länkar till Mitt konto (där köparen ser svaret).
        const content = rfpResponded({
          courseTopic: record.course_topic,
          linkUrl: record.training_request_assignment_id && APP_URL ? `${APP_URL}/konto?tab=efterfragningar` : undefined,
        });
        await sendEmail({ to: record.contact_email, ...content, messageType: 'rfp_responded', relatedTable: 'custom_requests', relatedId: record.id });
      } else if (statusChanged && record.status === 'accepted') {
        if (record.training_id) {
          const { email } = await getProviderContactEmail(record.training_id);
          const content = bookingConfirmed({
            companyName: record.company,
            courseTopic: record.course_topic,
            linkUrl: APP_URL ? `${APP_URL}/provider/requests` : undefined,
          });
          await sendEmail({ to: email, ...content, messageType: 'booking_confirmed', relatedTable: 'custom_requests', relatedId: record.id });
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
    } else if (table === 'training_request_events' && operation === 'INSERT') {
      await handleTrainingRequestEvent(record);
    } else if (table === 'applications' && operation === 'INSERT') {
      if (record.training_id) {
        const { email, title } = await getProviderContactEmail(record.training_id);
        const content = applicationReceived({
          courseTitle: title ?? 'kursen',
          studentName: record.student_name,
          linkUrl: APP_URL ? `${APP_URL}/provider/dashboard` : undefined,
        });
        await sendEmail({ to: email, ...content, messageType: 'application_received', relatedTable: 'applications', relatedId: record.id });
      }
    } else if (table === 'applications' && operation === 'UPDATE') {
      const statusChanged = old_record?.status !== record.status;
      if (statusChanged && record.status === 'confirmed') {
        const { title, slug, providerId } = record.training_id
          ? await getProviderContactEmail(record.training_id)
          : { title: null, slug: null, providerId: null };
        const content = applicationConfirmed({
          courseTitle: title ?? 'kursen',
          linkUrl: APP_URL && slug ? `${APP_URL}/kurs/${slug}` : undefined,
          termsUrl: APP_URL && providerId ? `${APP_URL}/leverantor/${providerId}/villkor` : undefined,
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
