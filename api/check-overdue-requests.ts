import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { sendEmail } from './_lib/sendEmail.js';
import { rfpEscalated, trainingAssignmentOverdue } from './_lib/emailTemplates.js';

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;
const APP_URL = process.env.APP_URL;
const BATCH_SIZE = 25;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!ADMIN_EMAIL) {
    return res.status(500).json({ error: 'ADMIN_NOTIFICATION_EMAIL saknas' });
  }

  const { data: overdue, error } = await supabaseAdmin
    .from('custom_requests')
    .select('id, company, course_topic, submitted_at')
    .eq('status', 'new')
    .lt('response_deadline', new Date().toISOString())
    .is('escalated_at', null)
    .limit(BATCH_SIZE);

  if (error) {
    console.error('check-overdue-requests query error:', error);
    return res.status(500).json({ error: error.message });
  }

  let escalated = 0;
  for (const row of overdue ?? []) {
    const content = rfpEscalated({
      companyName: row.company,
      courseTopic: row.course_topic,
      submittedAt: new Date(row.submitted_at).toLocaleDateString('sv-SE'),
      linkUrl: APP_URL ? `${APP_URL}/admin` : undefined,
    });
    await sendEmail({ to: ADMIN_EMAIL, ...content, messageType: 'rfp_escalated', relatedTable: 'custom_requests', relatedId: row.id });
    await supabaseAdmin.from('custom_requests').update({ escalated_at: new Date().toISOString() }).eq('id', row.id);
    escalated++;
  }

  // Anpassade efterfrågningar: lärosäten som passerat sin svarsdeadline utan att svara.
  let assignmentsEscalated = 0;
  try {
    const { data: overdueAssignments, error: asgError } = await supabaseAdmin
      .from('training_request_assignments')
      .select('id, request_id, response_deadline, providers(name), training_requests(title)')
      .in('status', ['assigned', 'viewed'])
      .lt('response_deadline', new Date().toISOString())
      .is('escalated_at', null)
      .limit(BATCH_SIZE);
    if (asgError) throw asgError;

    for (const row of overdueAssignments ?? []) {
      const provider = row.providers as { name?: string } | { name?: string }[] | null;
      const request = row.training_requests as { title?: string } | { title?: string }[] | null;
      const providerName = (Array.isArray(provider) ? provider[0]?.name : provider?.name) ?? 'Okänt lärosäte';
      const title = (Array.isArray(request) ? request[0]?.title : request?.title) ?? 'Efterfrågan';
      const content = trainingAssignmentOverdue({
        title,
        providerName,
        deadline: new Date(row.response_deadline).toLocaleDateString('sv-SE'),
        linkUrl: APP_URL ? `${APP_URL}/admin` : undefined,
      });
      await sendEmail({ to: ADMIN_EMAIL, ...content, messageType: 'training_assignment_overdue', relatedTable: 'training_requests', relatedId: row.request_id });
      await supabaseAdmin.from('training_request_assignments').update({ escalated_at: new Date().toISOString() }).eq('id', row.id);
      await supabaseAdmin.from('training_request_events').insert({
        request_id: row.request_id,
        assignment_id: row.id,
        actor_role: 'system',
        event_type: 'deadline_passed',
        visible_to_buyer: false,
      });
      assignmentsEscalated++;
    }
  } catch (err) {
    console.error('check-overdue-requests training assignments error:', err);
  }

  return res.status(200).json({ escalated, assignmentsEscalated });
}
