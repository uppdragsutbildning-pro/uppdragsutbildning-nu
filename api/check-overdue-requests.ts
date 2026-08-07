import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { sendEmail } from './_lib/sendEmail.js';
import { rfpEscalated } from './_lib/emailTemplates.js';

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;
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
    });
    await sendEmail({ to: ADMIN_EMAIL, ...content, messageType: 'rfp_escalated', relatedTable: 'custom_requests', relatedId: row.id });
    await supabaseAdmin.from('custom_requests').update({ escalated_at: new Date().toISOString() }).eq('id', row.id);
    escalated++;
  }

  return res.status(200).json({ escalated });
}
