-- Bytte e-postleverantör från Resend till Brevo (GDPR/EU-datalagring) innan
-- något skickats skarpt. Byter kolumnnamnet till leverantörsneutralt.

alter table email_log
  rename column resend_id to provider_message_id;
