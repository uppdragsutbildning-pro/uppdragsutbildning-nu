# Hjälpcenter och supportlåda
*Specifikation v1 – 2026-11-02. Förslag, ej påbörjat. Post-MVP (ligger utanför de fem kärnfunktionerna). Bygger på befintlig stack: Supabase, Vercel API-routes, Brevo, adminflikar.*

---

## 1. Bakgrund och syfte

Plattformen har idag ingen strukturerad väg för användare att hitta svar själva eller att kontakta oss. Syftet är två saker:

1. **Hjälpcenter på svenska** med sökbara hjälpartiklar för köpare och leverantörer.
2. **Supportlåda** där frågor och ärenden tas emot, hanteras och besvaras av teamet (Patrik, Fredrik, Aaron).

Principer: enkel lösning i befintlig stack utan nya beroenden, vitmärkning respekteras på partnermarknadsplatser, och GDPR hanteras från start.

---

## 2. Beslutade vägval (förslag, bekräfta)

| # | Fråga | Förslag |
|---|---|---|
| 1 | Bygga eller köpa | Bygga i egen stack (artiklar gratis, SEO, vitmärkning). Köpesystem (Zendesk/Freshdesk/Intercom) kostar per agent och bryter vitmärkningen. |
| 2 | Målgrupper | Artiklar har `audience`: `buyer`, `provider`, `all`. |
| 3 | Sök | Postgres fulltext med `swedish`-konfiguration, inget externt sökverktyg. |
| 4 | Inskick | Via API-route, aldrig direkt anonym `INSERT` (lärdom från `custom_requests`). |
| 5 | Mejl | Brevo, samma mönster som `notify-webhook`. |
| 6 | Inkommande mejl | Fas 3. Tills dess hanteras kundens mejlsvar manuellt i supportbrevlådan. |
| 7 | Partnermarknadsplatser | Hjälpcentret följer `useMarketplace()`: ingen Uppdragsutbildning-branding på en partnermarknadsplats. **Öppen fråga:** egen eller delad supportadress per partner. |
| 8 | AI | Post-MVP, alltid med mänsklig bekräftelse. |

---

## 3. Arbetspaket

### Paket A – Datamodell och migrationer (artiklar)
- `help_categories` (id, slug, name, description, sort_order).
- `help_articles` (id, category_id, slug UNIQUE, title, body_md, audience, status `draft|published`, sort_order, published_at, updated_at, `search tsvector` genererad med `to_tsvector('swedish', …)` + GIN-index).
- `help_article_feedback` (article_id, helpful bool, created_at; anonym INSERT via API-route).
- RLS: publicerade artiklar läsbara av alla, skrivning endast `is_admin()`.
- Migration per CLAUDE.md-reglerna: SQL visas först, körs i staging först.

### Paket B – Publik hjälpcenter-yta
- Routes: `/hjalp`, `/hjalp/:kategori`, `/hjalp/:slug`.
- Sökruta med träfflista, brödsmulor, "Var detta till hjälp?", länk "Kontakta oss" längst ned.
- Markdown-rendering (kontrollera om beroende redan finns innan nytt läggs till).
- `document.title` och `<link rel="canonical">` per artikel, samma mönster som `TrainingDetailPage.tsx`.
- Vitmärkning via `useMarketplace()`; länk i sidfot/header.

### Paket C – Admin: artikelhantering
- Ny flik "Hjälpcenter" i `AdminDashboard.tsx` (mönster från `MarketplacesTab.tsx`): lista, skapa/redigera, publicera/avpublicera, kategorier.
- Markdown-editor med förhandsvisning. Slug genereras en gång vid skapande (återanvänd `slugify()` i `src/lib/slug.ts`).

### Paket D – Datamodell och inskick (ärenden)
- `support_tickets` (id, reference `UB-1234` löpnummer, requester_name, requester_email, organization, category `fraga|fel|konto|faktura|annat`, subject, status `new|open|waiting|resolved|closed`, priority, assigned_to, marketplace_id nullable, related_training_id/related_request_id nullable, user_id nullable, access_token för statuslänk, created_at).
- `support_messages` (ticket_id, author_type `customer|agent|system`, body, is_internal, created_at).
- Bilagor i Storage-bucket `support-attachments` (privat, signerade URL:er, storleks- och typbegränsning).
- RLS: ingen anonym läsning/skrivning; all åtkomst via API-route med service role, admin via `is_admin()`.
- API-route `api/support-ticket.ts`: validering, honeypot, rate limiting, Cloudflare Turnstile, skapar ticket + första meddelande.
- Kontaktformulär `/hjalp/kontakta-oss` med integritetstext.

### Paket E – Mejl och notifieringar
- Bekräftelse till kunden (med referens och statuslänk) och avisering till support, via `sendEmail()` så att allt loggas i `email_log`.
- Nya mallar i `api/_lib/emailTemplates.ts`; ämnesrad innehåller `[UB-1234]`.
- Svar från admin skickas via Brevo med reply-to supportbrevlåda.

### Paket F – Admin: supportinkorg
- Ny flik "Support": lista med statusfilter, sök, paginering (återanvänd `getPaginationRange()`).
- Detaljvy (mönster från `CpiRecordDrawer`): tråd, svara, intern notering, ändra status/prioritet, tilldela.
- **Bygg även den saknade admin-vyn för `email_log`** (befintlig backlogg-punkt), eftersom misslyckade utskick annars är osynliga.

### Paket G – Startinnehåll
15–25 artiklar, förslag på ämnen:
- Köpare: Quick Scan och Kompetensindex, skicka offertförfrågan, vad händer efter en förfrågan, jämföra utbildningar, 20 % provision och när den utlöses, boka en kurs.
- Leverantörer: komma igång, lägga upp kurs, Excel-import, SSYK-taggning, hantera förfrågningar, villkorstexter, var visas mina kurser.
- Övergripande: GDPR och personuppgifter, radera mina uppgifter, kontakta oss.
- Ägare för innehållet måste utses (öppen fråga).

### Paket H – Fas 3 (senare)
- **Inkommande mejl:** Brevo Inbound Parsing → `api/inbound-email`, trådar på referensnumret.
- **Mina ärenden:** vy under `/konto` och i leverantörsportalen när köparkonton finns; tills dess åtkomst via token-länk.
- **SLA och eskalering:** svarsdeadline-fält + cron (samma princip som `response_deadline` för RFP).
- **AI (Gemini):** föreslå artiklar medan ärendet skrivs; utkast till svar; RAG över artiklarna.

---

## 4. Rekommenderad ordning
A → B → C → G (hjälpcenter live) → D → E → F (supportlåda live) → H.
Paket A–C+G är levererbart separat och ger värde direkt.

---

## 5. Risker och beslut

- **GDPR:** ärenden innehåller personuppgifter. Behövs: gallringsregel (förslag 24 månader), integritetstext i formuläret, rutin för radering på begäran, och svar på Vercel-regionsfrågan (`iad1`, se backlogg i CLAUDE.md).
- **Missbruk/spam:** anonymt formulär kräver Turnstile + rate limiting + honeypot.
- **Vercel Hobby:** 10 sekunders tak räcker för dessa flöden men inte för stora bilagor eller AI-anrop.
- **Bilagor:** begränsa typ/storlek; överväg virusskanning om bilagor tillåts från start (alternativt inga bilagor i v1).
- **Köparkonton saknas:** utan dem kan kunden inte se sina ärenden i plattformen; statuslänk med token löser det i v1.
- **Underhåll:** artiklar blir inaktuella utan ägare.
- **Vitmärkning:** supportadress och avsändarnamn på partnermarknadsplats behöver beslutas.

## 6. Öppna frågor
1. Vilka ska kunna skriva ärenden: köpare, leverantörer eller båda?
2. Egen eller delad supportadress för partnermarknadsplatser?
3. Behövs svar via mejl direkt i tråden från start (Paket H) eller räcker manuell hantering?
4. Vem skriver och äger artiklarna?
5. Tillåts bilagor i v1?
