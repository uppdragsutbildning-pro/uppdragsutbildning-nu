# Canvas-integration (automatisk inskrivning)
*Specifikation v1 – 2026-11-04. Förslag, ej påbörjat. Post-MVP (ligger utanför de fem kärnfunktionerna). Bygger på befintlig stack: Supabase, Vercel API-routes, Brevo, leverantörsportalen. Pilotleverantör: KTH.*

---

## 1. Bakgrund och syfte

Efter att en deltagare valt kurs, anmält sig och bokningen bekräftats ska systemet automatiskt skapa användaren i leverantörens Canvas och skriva in hen på rätt kurs (och rätt kohort/sektion), utan manuellt arbete hos leverantören.

Principer:

- **Opt-in, inte standard.** Alla kurser som visas på Uppdragsutbildning.nu erbjuds inte via Canvas. Leverantören styr detta, och kurser kopplas en och en.
- **Rätt instans.** Varje lärosäte har sin egen Canvas-instans. Kopplingen sker per leverantör och per kurs, och verifieras mot Canvas innan den kan användas.
- **Inget tyst fel.** Misslyckade inskrivningar syns och eskaleras (lärdom från `contact_email`-buggen).
- **Enkelt och utan nya beroenden.** Canvas REST API anropas från en Vercel API-route.

---

## 2. Beslutade vägval (förslag, bekräfta)

| # | Fråga | Förslag |
|---|---|---|
| 1 | Vem äger Canvas-kopplingen | Leverantören. Datamodellen tillåter även `owner_type='marketplace'`, men det används **inte** i v1 (inget konkret fall, se avsnitt 7). |
| 2 | Vad styr om en kurs går via Canvas | Att en `training_lms_mappings`-rad finns. Ingen mappning = ingen Canvas, inget fallback. |
| 3 | Leverantörens huvudbrytare | `lms_connections.enabled`. Avstängd = inga nya inskrivningar, väntande får status `paused`. |
| 4 | Kohort | Valfri sektion per `scheduled_start`. Saknas den skrivs deltagaren in på kursnivå och leverantören får en varning. |
| 5 | Trigger | **Beslut krävs:** bekräftad bokning (`applications.status='confirmed'`) eller betald faktura (`invoice.paid`). Se avsnitt 6. |
| 6 | Autentisering mot Canvas | Developer Key + OAuth2 (eller API-token för tjänstekonto), lagrad i Supabase Vault, aldrig läsbar från klient. |
| 7 | LTI | Används inte. LTI bäddar in verktyg i Canvas, skriver inte in användare. |
| 8 | Andra LMS (Moodle m.fl.) | Utanför v1. `lms_type` finns i modellen för att inte låsa oss. |
| 9 | Retur av slutförd kurs/betyg | Post-MVP (Canvas Live Events eller polling). |

---

## 3. Datamodell (Paket A)

### `lms_connections`
| Kolumn | Not |
|---|---|
| `id` | uuid |
| `owner_type` | `provider` \| `marketplace` |
| `provider_id` / `marketplace_id` | exakt en satt, CHECK-constraint |
| `lms_type` | `canvas` (CHECK, utökningsbar) |
| `base_url` | https, validerad mot Canvas-domän |
| `account_id` | Canvas-konto där användare skapas |
| `secret_ref` | referens till Vault-hemlighet, aldrig själva token |
| `enabled` | huvudbrytare, default `false` |
| `status` | `unverified` \| `verified` \| `failed` |
| `verified_at`, `verified_account_name` | namnet från Canvas, visas för bekräftelse |
| `created_at`, `updated_at` | |

UNIQUE på `(owner_type, provider_id, marketplace_id)`.

### `training_lms_mappings`
`id`, `training_id` (FK, UNIQUE i v1), `connection_id` (FK), `external_course_id`, `external_course_name` (hämtat vid mappning), `created_at`. Finns raden går kursen via Canvas.

### `scheduled_start_lms_sections`
`scheduled_start_id` (FK, UNIQUE), `external_section_id`, `external_section_name`.

### `lms_enrollments`
| Kolumn | Not |
|---|---|
| `application_id` | FK, UNIQUE (idempotens) |
| `connection_id`, `external_user_id`, `external_enrollment_id` | |
| `status` | `pending` \| `ok` \| `failed` \| `paused` \| `not_applicable` \| `manual` |
| `attempts`, `last_error`, `last_attempt_at`, `next_retry_at` | |
| `created_at`, `updated_at` | |

### Åtkomst (RLS)
- Alla fyra tabeller: SELECT för leverantören på egna rader (via `get_user_provider_id()`) och för `is_admin()`.
- **Inga skrivpolicyer för leverantörer på `lms_connections`.** Skrivning av anslutning och token sker via SECURITY DEFINER-funktioner eller API-route med service role. Token är write-only. Kontrollera uttryckligen `caller_provider_id IS NOT NULL` före jämförelser (lärdom från `update_provider_terms`).
- `training_lms_mappings` och sektioner: leverantören skriver bara för kurser som tillhör den egna leverantören, via RPC.
- `lms_enrollments`: endast service role skriver. Ingen klientskrivning.

Migrationer enligt CLAUDE.md-reglerna: SQL visas först, körs i staging först, aldrig production utan uttryckligt besked.

---

## 4. Arbetspaket

### Paket A – Datamodell och migrationer
Tabellerna ovan, RLS, SECURITY DEFINER-funktioner, TS-typer i `src/lib/database.types.ts`.

### Paket B – Canvas-klient (`api/_lib/canvas.ts`)
- Tunn wrapper: `getAccount`, `getCourse`, `listSections`, `findUserByLogin`, `createUser`, `enroll`, `unenroll`.
- Hämta hemlighet ur Vault, timeouts, tydliga felkoder, inga hemligheter i loggar.
- Respekterar Vercel Hobby-taket (10 s): ett inskrivningsanrop gör få anrop och kan retrias.

### Paket C – Leverantörsportal: Canvas-flik
- Ny flik, route `/provider/canvas` (mönster från `ProviderTermsSettingsPage.tsx`).
- Anslutning: `base_url`, `account_id`, token (write-only), knappen "Testa anslutning" som visar kontonamnet för bekräftelse. Huvudbrytare på/av.
- Kurslista med alla leverantörens kurser och toggle "Levereras via Canvas". Låst tills anslutningen är verifierad. Vid på-slagning väljs Canvas-kurs, namnet hämtas och visas för bekräftelse.
- Fält för sektion per kursstart.

### Paket D – Inskrivningsflöde (`api/lms-enroll.ts`)
Triggas när anmälan når rätt status (se avsnitt 6), samma mönster som `notify-webhook.ts`.

1. Slå upp mappning via `training_id`. Saknas den eller är anslutningen avstängd: skriv `not_applicable` respektive `paused` och avsluta.
2. Hitta eller skapa Canvas-användaren (`findUserByLogin`, annars `createUser` med `pseudonym[unique_id]` och `skip_registration`/notifieringsval enligt leverantörens SSO-upplägg).
3. Skriv in med `type=StudentEnrollment`, `enrollment_state=active` och `course_section_id` om sektion finns.
4. Spara resultatet i `lms_enrollments`. Idempotent via UNIQUE på `application_id`.
5. Vid fel: retry via cron med backoff. Efter max antal försök: `failed`, notis till leverantör och admin (via `sendEmail()` så att det hamnar i `email_log`), och anmälningslistan skickas som fallback. Fallbacken gäller bara kurser som **är** mappade.

### Paket E – Avbokning och byten
- Avböjd eller avbruten anmälan efter inskrivning: `unenroll` (concluded eller delete, leverantörens val i inställningen).
- Byte till annan start: flytta mellan sektioner.

### Paket F – Admin
- Översikt över `lms_enrollments` med filter på status och leverantör, och knapp för att köra om en misslyckad rad. Delas gärna med den planerade `email_log`-vyn (se hjälpcenter-specen).
- Admin kan se och verifiera en leverantörs anslutning, men inte läsa token.

### Paket G – Mejl
- `applicationConfirmed` får en extra rad om Canvas-inloggning, **endast** för mappade kurser (flagga från `lms_enrollments`).
- Ny mall till leverantör vid `failed`.

### Paket H – Senare
Marknadsplatsnivå (`owner_type='marketplace'`) i UI, retur av slutförd kurs/betyg, andra LMS, SIS-import som alternativ till API.

---

## 5. Rekommenderad ordning

1. A (datamodell) → B (klient) → C (portal) → D (flöde) mot en Canvas-testinstans.
2. Pilot med KTH när deras IT skapat Developer Key (starta den dialogen tidigt, den är kritisk väg).
3. E, F, G efter pilot. H vid behov.

Uppskattning: pilot ungefär 1–2 veckor utveckling, generell lösning ungefär 3–4 veckor, förutsatt att bokningsflödet finns. Ledtiden bestäms av leverantörens IT.

---

## 6. Förutsättningar och risker

- **Anmälnings- och betalstatus.** `applications.status` har idag bara `new/reviewed/confirmed/declined` och ingen betalstatus. Enligt CLAUDE.md saknas även en kundvänd anmälningsyta. Triggern kräver att detta finns på plats.
- **Betalningsögonblicket (beslut).** Fakturan har 30 dagars betalvillkor och provisionen utlöses vid kursstart. Att vänta på betald faktura kan hindra deltagare från att komma in i tid. Rekommendation: trigga på `confirmed` (bekräftad bokning), inte `invoice.paid`, om inte leverantören uttryckligen vill ha betalningsgrind.
- **SSO och inloggning.** Lärosäten använder ofta SWAMID/Shibboleth. Användarens `login_id` måste matcha SSO:n, och externa deltagare kräver ofta särskilt gästkonto-upplägg. Det måste klargöras med varje leverantör vid onboarding.
- **GDPR.** Personuppgifter går till leverantörens system: kräver personuppgiftsbiträdesavtal/ansvarsfördelning. Vercel-funktionerna körs i `iad1` (se backlogg-punkten om regionsfrågan), och uppgifterna passerar där.
- **Felaktig mappning.** Motverkas av verifiering vid anslutning (kontonamn) och vid kursmappning (kursnamn) med mänsklig bekräftelse. Ändra aldrig `base_url` utan att anslutningen återgår till `unverified`.
- **Rate limits och Canvas-underhåll.** Retry med backoff och tydlig `failed`-status.
- **Hemligheter.** Token lagras bara i Vault, loggas aldrig och returneras aldrig till klienten.

---

## 7. Öppna frågor

1. Trigger: `confirmed` eller `invoice.paid`? (avsnitt 6)
2. Ska deltagare få en Canvas-inbjudan av Canvas själv (`notify`) eller bara av vårt mejl?
3. Vid avbokning: radera eller avsluta (concluded) inskrivningen?
4. Finns det någon partnermarknadsplats som själv hostar kurser i en egen Canvas? Om inte, skjuts marknadsplatsnivån upp (Paket H).
5. KTH:s krav på användarprovisionering (SSO, gästkonton, SIS) behöver bekräftas med deras IT innan Paket D fastställs.
6. Ska leverantören kunna välja att bara skicka en anmälningslista (CSV/mejl) i stället för API-inskrivning, som en lättviktig nivå?
