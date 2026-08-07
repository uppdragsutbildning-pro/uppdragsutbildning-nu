-- Vercel Deployment Protection blockerade webhook-anropet (401 "Protected
-- deployment") eftersom pg_net anropar utifrån, utan inloggad session.
-- Lägger till Vercels "Protection Bypass for Automation"-header, vars
-- hemlighet lagras i supabase_vault (sätts manuellt per miljö, som
-- webhook-URL/hemligheten).

create or replace function notify_webhook()
returns trigger
language plpgsql
security definer
as $$
declare
  webhook_url text;
  webhook_secret text;
  bypass_secret text;
begin
  select decrypted_secret into webhook_url from vault.decrypted_secrets where name = 'notify_webhook_url';
  select decrypted_secret into webhook_secret from vault.decrypted_secrets where name = 'notify_webhook_secret';
  select decrypted_secret into bypass_secret from vault.decrypted_secrets where name = 'vercel_bypass_secret';

  if webhook_url is null then
    return coalesce(new, old);
  end if;

  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret,
      'x-vercel-protection-bypass', bypass_secret
    ),
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
