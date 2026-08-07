-- Generisk databaswebhook för e-postnotifieringar. Webhook-URL och delad
-- hemlighet lagras i supabase_vault (sätts manuellt per miljö, aldrig här i
-- migrationen eftersom URL skiljer sig mellan staging/production och
-- hemligheten inte får committas).

create extension if not exists pg_net with schema extensions;

create or replace function notify_webhook()
returns trigger
language plpgsql
security definer
as $$
declare
  webhook_url text;
  webhook_secret text;
begin
  select decrypted_secret into webhook_url from vault.decrypted_secrets where name = 'notify_webhook_url';
  select decrypted_secret into webhook_secret from vault.decrypted_secrets where name = 'notify_webhook_secret';

  if webhook_url is null then
    return coalesce(new, old);
  end if;

  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'record', to_jsonb(new),
      'old_record', case when TG_OP = 'UPDATE' then to_jsonb(old) else null end
    )
  );

  return new;
end;
$$;

create trigger trg_notify_custom_requests_insert
  after insert on custom_requests
  for each row execute function notify_webhook();

create trigger trg_notify_custom_requests_status
  after update of status on custom_requests
  for each row
  when (old.status is distinct from new.status)
  execute function notify_webhook();

create trigger trg_notify_applications_insert
  after insert on applications
  for each row execute function notify_webhook();

create trigger trg_notify_applications_status
  after update of status on applications
  for each row
  when (old.status is distinct from new.status)
  execute function notify_webhook();
