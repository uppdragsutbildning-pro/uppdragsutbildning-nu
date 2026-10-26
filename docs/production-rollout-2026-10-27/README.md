# Utrullning till Production, 2026-10-27

Mål: Production ska spegla Staging (schema, säkerhet och kod). Datan speglas inte: Production behåller sin egen data.

Production: Supabase `iswctazjdtirrzswqkor`, Vercel-gren `main`. Staging: `eyksngvbrupmxpjzadqp`, gren `develop`.

## Analys (läsande kontroller 2026-10-27)

- `main` ligger 40 commits efter `develop` (rak fast-forward, inga egna commits på `main`).
- Production-databasen har 8 av repots 37 migrationer registrerade. Skillnaderna mot Staging:
  - Saknas helt: `organizations`, `organization_members`, 4 tabeller för efterfrågningar, 5 för fakturering, ungefär 55 funktioner och 7 triggers.
  - Saknade kolumner: `trainings.slug`, `providers.terms_text` och `cancellation_policy`, 12 kolumner på `custom_requests`.
  - `email_log.recipient_email` är NOT NULL (i Staging nullable).
  - Lagringsbucketarna `course-images` och `course-brochures` saknas, så kursbilder kan inte laddas upp.
  - Ungefär 20 kolumner är nullable i Production men NOT NULL i Staging (inga NULL-värden finns).
- **Säkerhet, finns redan i Production idag:** `cpi_results` har policyn "Allow admin reads" (`SELECT TO authenticated USING (true)`). Varje inloggad användare kan läsa alla Kompetensindex-svar inklusive namn och e-post. Det blir värre när köpare kan logga in. Dessutom finns "Public read" som läser alla rader på `providers`, `scheduled_starts`, `curriculum_modules`, `training_faq` och `trainings`, samt flera dubblettpolicyer.
- Delade funktioner (`is_admin`, `get_user_provider_id`, `notify_webhook` m.fl.) är identiska i båda miljöerna. Webhook-URL i Production pekar på produktionsdomänen.
- Production-data: 7 leverantörer, 4 kurser (alla aktiva), 2 kursstarter, 2 förfrågningar, 13 Kompetensindex, 2 användare. Inga NULL-värden, inga inaktiva leverantörer med aktiva kurser.
- Production behåller medvetet sina äldre index och `updated_at`-triggers, som Staging saknar.

## Filer

| Fil | Innehåll |
| --- | --- |
| `01_legacy_parity.sql` | Äldre saknade migrationer, buckets, slug, villkor, köparkonton och paritetsmigrationen (policyer och NOT NULL). |
| `02_training_requests.sql` | Efterfråga anpassad utbildning (4 migrationer). |
| `03_billing_phase1.sql` | Fakturering Fas 1 (8 migrationer). |
| `04_verify.sql` | Verifiering efter körning (bara läsning, alla rader ska vara true). |
| `05_rollback_policies.sql` | Återställer de borttagna policyerna om något slutar fungera. |

Filerna 01–03 är genererade ur `supabase/migrations/` och körs var och en som en transaktion (`BEGIN … COMMIT`): går något fel rullas den delen tillbaka helt.

## Ordning

1. **Backup.** Supabase-projektet Production, Database, Backups. Ta en backup eller bekräfta senaste.
2. **Körning i SQL Editor, Production**, i ordning 01, 02, 03. Varje del ska ge "Success". Stoppa vid första felet och skicka felmeddelandet.
3. **Verifiering:** kör `04_verify.sql`. Alla rader ska vara `true`. Därefter kör Claude get_advisors mot Production.
4. **Supabase Auth, Production** (dashboard): se nedan.
5. **Kod:** `develop` mergas till `main` (fast-forward) och pushas. Vercel Production bygger då automatiskt.
6. **Rökprov** på produktionsdomänen.

Databasen körs före koden. Mellan steg 2 och 5 (några minuter) kan gamla Production-koden inte skapa kurser (kräver slug och policy). Det påverkar ingen annan funktion.

## Supabase Auth, Production (dashboard)

- Authentication, Providers, Email: på, och "Confirm email" som i Staging. Magic link/OTP används av Mitt konto.
- Authentication, URL Configuration: Site URL `https://project-4l6hz.vercel.app`, och i Redirect URLs `https://project-4l6hz.vercel.app/**`.
- Leaked password protection (Authentication, Providers, Email): rekommenderas på (finns som varning i get_advisors).

## Vercel, Production (Settings, Environment Variables)

Inga nya variabler behövs. Kontrollera att dessa finns för Production: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Production-projektet), `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, `ADMIN_NOTIFICATION_EMAIL`, `NOTIFY_WEBHOOK_SECRET`, `CRON_SECRET`, `APP_URL` (`https://project-4l6hz.vercel.app`).

Cron: `/api/check-overdue-requests` körs dagligen 06:00 UTC, och gör nu även klara-för-fakturering och utbetalningspåminnelser.

## Rökprov efter utrullning

1. Startsida, Katalog och en kurssida (`/kurs/<slug>`) laddar.
2. Anonym: skicka ett Kompetensindex-svar och en förfrågan (ska fortfarande fungera, men lägg inte kvar testdata).
3. Logga in som admin: fliken Fakturering visas, inställningarna läses (25 %, 20 %, 30, 10).
4. Logga in som leverantör: Villkor och Fakturering finns.
5. `/konto`: inloggningsformuläret visas.
6. Kontrollera att en inloggad vanlig användare inte kan läsa Kompetensindex (bara admin).

## Öppna punkter

- 6 av 7 leverantörer saknar `contact_email`, så mejl till dem loggas som misslyckade.
- Säljarens uppgifter (CTC Nordic AB) saknas, så utkast visar "Uppgifter saknas".
- Revisorns besked om moms och säljarroll, och leverantörsvillkor som ger rätt att fakturera.
- Migrationshistoriken: SQL som körs i SQL-editorn registreras inte i Supabases migrationstabell.
