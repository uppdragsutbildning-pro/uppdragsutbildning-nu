-- Tillåter NULL i recipient_email så att ett misslyckat utskick (t.ex. en
-- leverantör som saknar contact_email) kan loggas med status='failed' istället
-- för att tystas ned helt innan e-postadressen ens är känd.

alter table email_log alter column recipient_email drop not null;
