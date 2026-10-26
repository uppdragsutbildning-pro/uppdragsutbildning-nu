import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { sendEmail } from './_lib/sendEmail.js';
import { rfpEscalated, trainingAssignmentOverdue, invoiceBasesReady, type ReadyBasisItem } from './_lib/emailTemplates.js';

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;
const APP_URL = process.env.APP_URL;
const BATCH_SIZE = 25;
const READY_MAIL_MAX_ROWS = 50;

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

const sek = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 2 });

// Fakturaunderlag: flytta de vars kurs har startat till "klar" och mejla admin ETT samlat mejl.
// Flaggan ready_notify_pending rensas först när mejlet har gått iväg, så ett misslyckat mejl
// försöks igen nästa körning, och en körning till samma dag skickar inget extra.
async function processInvoiceBasesReady(): Promise<{ moved: number; notified: number }> {
  const { data: moved, error: moveError } = await supabaseAdmin.rpc('billing_mark_ready_due');
  if (moveError) throw moveError;

  const { data: pending, error: pendingError } = await supabaseAdmin
    .from('invoice_bases')
    .select('id, number, total_ex_vat, bookings(title, start_date, providers(name), organizations(name))')
    .eq('ready_notify_pending', true)
    .order('created_at', { ascending: true })
    .limit(READY_MAIL_MAX_ROWS + 1);
  if (pendingError) throw pendingError;

  const rows = pending ?? [];
  if (rows.length === 0) return { moved: (moved ?? []).length, notified: 0 };

  const shown = rows.slice(0, READY_MAIL_MAX_ROWS);
  const items: ReadyBasisItem[] = shown.map(r => {
    const b = one(r.bookings as any);
    return {
      number: r.number as string,
      title: b?.title ?? 'Utbildning',
      providerName: one(b?.providers)?.name ?? 'Okänt lärosäte',
      buyerName: one(b?.organizations)?.name ?? 'Okänd köpare',
      startDate: b?.start_date ? new Date(b.start_date).toLocaleDateString('sv-SE') : '–',
      totalExVat: sek.format(Number(r.total_ex_vat)),
    };
  });

  // Fler än visas? Nästa körning tar resten (flaggan ligger kvar), och mejlet säger hur många.
  let more = 0;
  if (rows.length > shown.length) {
    const { count } = await supabaseAdmin
      .from('invoice_bases')
      .select('id', { count: 'exact', head: true })
      .eq('ready_notify_pending', true);
    more = Math.max((count ?? rows.length) - shown.length, 0);
  }
  const content = invoiceBasesReady({ items, more, linkUrl: APP_URL ? `${APP_URL}/admin` : undefined });
  const result = await sendEmail({ to: ADMIN_EMAIL ?? null, ...content, messageType: 'invoice_bases_ready' });
  if (!result.success) return { moved: (moved ?? []).length, notified: 0 };

  const { error: clearError } = await supabaseAdmin
    .from('invoice_bases')
    .update({ ready_notify_pending: false })
    .in('id', shown.map(r => r.id));
  if (clearError) throw clearError;
  return { moved: (moved ?? []).length, notified: shown.length };
}

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

  // Fakturaunderlag som blivit klara vid kursstart.
  let invoiceBases = { moved: 0, notified: 0 };
  try {
    invoiceBases = await processInvoiceBasesReady();
  } catch (err) {
    console.error('check-overdue-requests invoice bases error:', err);
  }

  return res.status(200).json({ escalated, assignmentsEscalated, invoiceBases });
}
