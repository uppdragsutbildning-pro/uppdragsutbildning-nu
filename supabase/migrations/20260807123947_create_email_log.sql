-- Loggar alla utgående e-postnotifieringar (lyckade och misslyckade) för
-- felsökning och admin-insyn. Endast service-role skriver (kringgår RLS) -
-- klienter kan bara läsa via admin-behörighet.

create table email_log (
  id uuid primary key default gen_random_uuid(),
  message_type text not null,
  recipient_email text not null,
  related_table text,
  related_id uuid,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  resend_id text,
  created_at timestamptz default now()
);

alter table email_log enable row level security;

create policy "Admins can view email log"
  on email_log for select
  using (is_admin());
