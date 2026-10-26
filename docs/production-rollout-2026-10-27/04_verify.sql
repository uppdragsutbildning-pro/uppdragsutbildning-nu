-- Verifiering efter utrullning (bara läsning). Kör i PRODUCTION (iswctazjdtirrzswqkor).
-- Förväntat resultat: alla rader har ok = true.

select '11 nya tabeller finns' as kontroll,
       (select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r'
          and relname in ('organizations','organization_members','training_requests','training_request_assignments','training_request_events','training_request_admin_notes','billing_settings','provider_payout_details','bookings','invoice_bases','invoice_basis_events')) = 11 as ok
union all select 'RLS på alla nya tabeller',
       (select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity
          and relname in ('organizations','organization_members','training_requests','training_request_assignments','training_request_events','training_request_admin_notes','billing_settings','provider_payout_details','bookings','invoice_bases','invoice_basis_events')) = 11
union all select 'faktureringstabellerna saknar skrivrättigheter för anon och authenticated',
       not exists (select 1 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('billing_settings','provider_payout_details','bookings','invoice_bases','invoice_basis_events')
                   and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete')))
union all select 'funktioner för fakturering och efterfrågningar finns (minst 45)',
       (select count(*) from pg_proc where pronamespace='public'::regnamespace
          and (proname like 'admin\_%' or proname like 'buyer\_%' or proname like 'provider\_%' or proname like 'billing\_%' or proname like 'tr\_%')) >= 45
union all select 'inga RPC är körbara av anon (utom de gamla hjälpfunktionerna)',
       not exists (select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
                   and (p.proname like 'admin\_%' or p.proname like 'buyer\_%' or p.proname like 'billing\_%' or p.proname in ('provider_submit_offer','provider_list_invoicing','provider_invoicing_events','provider_update_cancellation_policy','submit_training_request','create_my_organization','claim_my_requests'))
                   and has_function_privilege('anon', p.oid, 'execute'))
union all select 'alla nya funktioner har search_path satt',
       not exists (select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
                   and (p.proname like 'admin\_%' or p.proname like 'buyer\_%' or p.proname like 'billing\_%' or p.proname like 'tr\_%')
                   and not (p.proconfig is not null and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')))
union all select 'notifieringstriggers finns',
       (select count(*) from pg_trigger where not tgisinternal and tgname in ('trg_notify_bookings','trg_notify_invoice_basis_events','trg_notify_training_request_events','trg_notify_custom_requests_insert','trg_notify_custom_requests_status','trg_notify_applications_insert','trg_notify_applications_status')) = 7
union all select 'guard- och skyddstriggers finns',
       (select count(*) from pg_trigger where not tgisinternal and tgname in ('invoice_bases_guard_update','custom_requests_guard_client_update','custom_requests_guard_assignment_link','custom_requests_guard_insert_columns','trainings_publish_requires_policy')) = 5
union all select 'lagringsbucketar finns',
       (select count(*) from storage.buckets where id in ('course-images','course-brochures','marketplace-branding')) = 3
union all select 'trainings.slug är NOT NULL och unik',
       exists (select 1 from information_schema.columns where table_name='trainings' and column_name='slug' and is_nullable='NO')
       and exists (select 1 from pg_constraint where conname='trainings_slug_key')
union all select 'alla kurser har slug',
       not exists (select 1 from trainings where slug is null or slug = '')
union all select 'billing_settings har exakt en rad med 25 % moms och 20 % provision',
       (select count(*) from billing_settings where default_vat_rate = 0.25 and commission_rate = 0.20) = 1
union all select 'inga av de borttagna policyerna finns kvar',
       not exists (select 1 from pg_policies where schemaname='public' and (tablename, policyname) in
         (('cpi_results','Allow admin reads'),('cpi_results','Allow anonymous inserts'),('providers','Public read'),('scheduled_starts','Public read'),('curriculum_modules','Public read'),('training_faq','Public read'),('trainings','Public read'),('trainings','Provider manage own'),('categories','Public read'),('applications','Anyone can create'),('applications','Provider read own'),('custom_requests','Allow anonymous inserts on custom_requests'),('custom_requests','Anyone can create'),('custom_requests','Provider read own'),('custom_requests','Providers can view relevant custom requests'),('custom_requests','Providers can update relevant custom requests')))
union all select 'Kompetensindex kan inte läsas av vanliga inloggade (bara admin)',
       not exists (select 1 from pg_policies where schemaname='public' and tablename='cpi_results' and cmd='SELECT' and qual = 'true')
union all select 'anonyma inskick fungerar fortfarande (kompetensindex, förfrågan, anmälan)',
       exists (select 1 from pg_policies where tablename='cpi_results' and cmd='INSERT')
       and exists (select 1 from pg_policies where tablename='custom_requests' and cmd='INSERT')
       and exists (select 1 from pg_policies where tablename='applications' and cmd='INSERT')
union all select 'vault: webhook-URL och hemlighet finns',
       (select count(*) from vault.secrets where name in ('notify_webhook_url','notify_webhook_secret')) = 2
union all select 'befintlig data intakt (7 leverantörer, 4 kurser, 2 förfrågningar, 13 kompetensindex)',
       (select count(*) from providers) = 7 and (select count(*) from trainings) = 4 and (select count(*) from custom_requests) = 2 and (select count(*) from cpi_results) = 13;
