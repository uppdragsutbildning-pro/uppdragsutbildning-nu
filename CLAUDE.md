# Uppdragsutbildning.nu – Projektinstruktioner för Claude Code

## Om projektet

**Bolag:** Lumina CTC AB (tidigare/även kallat Credits That Count AB, CTC)
**Produkt:** Uppdragsutbildning.nu – B2B-marknadsplats som kopplar samman organisationer (företag, kommuner, regioner) som söker kompetensutveckling med universitet, högskolor, yrkeshögskolor (YH) och andra utbildningsleverantörer.

Plattformen riktar sig INTE till privatpersoner – alltid B2B med en arbetsgivare/organisation som finansiär.

**Affärsmodell:** Ren success fee – inga listnings- eller abonnemangsavgifter för lärosäten. Uppdragsutbildning.nu tar 20% provision på kursens pris vid bekräftad bokning. Provisionen utlöses vid kursstart, inte vid bokningsbekräftelse.

**Team:**
- Aaron – Product (kommunicerar koncist, korrigerar scope direkt, föredrar avgränsade diagram/visualiseringar)
- Patrik – Onboarding & Sales
- Fredrik – Sales
- Mathieu – Kopplad enbart till ELL (Expert Learning Lab), inte marknadsplatsen

---

## Tech-stack

- **Frontend:** React, TypeScript, Tailwind CSS
- **Backend/databas:** Supabase (auth, databas, storage, Row Level Security, Edge Functions)
- **Hosting:** Vercel (Edge Functions, auto-deploy från `develop`-branch)
- **Betalningar:** Stripe Connect + Stripe Invoicing API
- **AI-lager:** Gemini 2.0 Flash (multimodal, RAG, CPI-analys, ESCO-taggning)
- **Klassificering:** ESCO REST API (EU:s kompetenstaxonomi)
- **UI-verktyg:** Figma Make (lokalt läge, skriver direkt till denna projektmapp)
- **Repo:** `uppdragsutbildning-pro/uppdragsutbildning-nu`

### Supabase-projekt (två separata – blanda ALDRIG ihop dessa)
- **Production:** "Uppdragsutbildning", ID `iswctazjdtirrzswqkor`
- **Staging:** "uppdragsutbildning-staging", ID `eyksngvbrupmxpjzadqp`
- Vercel Preview (develop-branch) ska peka mot staging-projektet för `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Vercel Production (main-branch) ska peka mot production-projektet

---

## Git-flöde (VIKTIGT – följ alltid detta)

1. Jag jobbar i Figma Make, som skriver ändringar direkt till filerna i denna mapp.
2. **Standard:** `git add`, `git commit`, `git push` mot **`develop`**-branchen.
3. Commit-meddelanden ska vara en **kort sammanfattning av vad som faktiskt ändrats** (baserat på diffen), inte generisk text som "update".
4. Innan push till `develop`: visa en kort sammanfattning av ändringarna så jag kan reagera om något ser fel ut.
5. **Pusha eller mergea ALDRIG till `main`** om jag inte uttryckligen ber om det (t.ex. "pusha till produktion" eller "gör detta skarpt").
6. `develop` → Vercel Preview → staging-miljön. `main` → Vercel Production → produktionsmiljön.

### Regler för Supabase-migrationer

- Skapa alltid en migrationsfil (t.ex. `supabase migration new <namn>`) – ändra aldrig databasen direkt utan migration.
- Visa SQL-innehållet för mig innan något körs. Inga "tysta" schemaändringar.
- Bekräfta alltid vilket Supabase-projekt du är kopplad mot (staging `eyksngvbrupmxpjzadqp` eller production `iswctazjdtirrzswqkor`) innan en skrivande operation.
- Kör och verifiera alltid migrationen i **staging** först. Kör mot production endast när jag uttryckligen säger det.
- Destruktiva ändringar (borttagna kolumner, `DROP TABLE`, liknande) kräver alltid explicit godkännande från mig, även i staging.

---

## Kärnfunktioner (MVP – fem stycken)

1. **Quick Scan** – anonym CPI-analys, ingen inloggning krävs
2. **Deep Dive / AI Requirement Builder** – gated bakom kontoskapelse, flaggskeppsdifferentiator
3. ESCO-taggad sökning
4. One-click multi-provider RFP (offertförfrågan till flera leverantörer samtidigt)
5. Jämförelsematris

Post-MVP-tillägg (URL-import, kurskloning, subdomän fas 2–3 m.m.) hålls separat från MVP-scope.

---

## Domänbegrepp

**CPI (Kompetenstrycksindex):** Proprietärt gapanalysverktyg, fyra dimensioner:
- AF – Arbetsförmåga/Arbetsförändring (direkt scoring)
- PF – Prestationsfriktion (direkt scoring)
- OK – Omställningskapacitet (omvänd scoring)
- TR – Tillit/Relationer / Transformationsriktning (omvänd scoring)

Scoringformel: Direkt = (svar−1)/4×100. Omvänd = (5−svar)/4×100. Total CPI = snitt av de fyra dimensionerna.
Nivåer: 0–24 Lågt, 25–49 Måttligt, 50–74 Högt, 75–100 Kritiskt.

Två lägen: **Quick Scan** (anonym) och **Deep Dive** (gated bakom konto).

**ESCO:** EU:s kompetens-/yrkestaxonomi för kurstaggning och matchning köpare–leverantör.

---

## Nyckelprinciper (styr designbeslut)

- ESCO-taggningskvalitet vid onboarding är plattformens största hävstång för matchningskvalitet – LLM-assisterad taggning ska ha ett mänskligt bekräftelsesteg, inte full automatisering.
- CPI Deep Dive är flaggskeppsdifferentiatorn – prioritera denna vid resurskonflikter.
- Bokningsögonblicket är den mest ekonomiskt kritiska kontaktpunkten (20%-provisionen blir synlig).
- Tystnad i RFP → bokning-flödet är den mest kritiska UX-sårbarheten – kräver systemnivå-eskalering (t.ex. `response_deadline`-fält + cron), inte bara UI-polering.
- Föredra enkla MVP-lösningar anpassade till befintlig stack, inte nya beroenden om det kan undvikas.

---

## Nuläge / pågående arbete

- **Partnermarknadsplatser (spec: [docs/specs/partnermarknadsplatser.md](docs/specs/partnermarknadsplatser.md))** – varumärkta marknadsplatser för bransch-/omställningsorganisationer (kuraterat kursurval från flera leverantörer), som delar infrastruktur med leverantörssubdomänen via en gemensam `marketplaces`-tabell. **2026-09-03: upptäckte vid uppstart att leverantörssubdomän-infrastrukturen (nedan) i själva verket inte fanns i koden alls** trots att den beskrevs som påbörjad – beslutades att bygga båda (`provider_storefront` + `partner_curated`) från grunden i detta uppdrag. **Paket A (datamodell & migrationer) klart** i staging: tabellerna `marketplaces`, `marketplace_branding`, `partner_organizations`, `marketplace_trainings` + RLS, migration `20260903140000_create_marketplaces.sql`, TS-typer i `src/lib/database.types.ts`. **Paket B (UB-admin: marknadsplatshantering) klart**: ny "Marknadsplatser"-flik i `AdminDashboard.tsx` (`src/app/components/admin/MarketplacesTab.tsx`) + tre nya admin-routes (`/admin/marketplaces/new|:id/edit`, `/admin/marketplaces/:id/branding`, `/admin/marketplaces/:id/curation`), ny Storage-bucket `marketplace-branding` (migration `20260903150000_add_marketplace_branding_storage.sql`). **Ej fullständigt verifierat i webbläsare** – ingen admin-lösenord tillgänglig i sessionen, endast routing/build/RLS-mönster verifierat, se avsnittet nedan om produktionsfallback för varför det krävde extra försiktighet. **Paket C (subdomän-routing & theming) klart**: `src/lib/marketplaceContext.tsx` slår upp marknadsplats via subdomän eller `?via=`-fallback, `Root.tsx` visar partnerns logga/tagline/primärfärg i headern och döljer Provider/Admin-länkar. **OBS (2026-09-03): Vercel-projektet saknar helt anpassad domän** (bara `*.vercel.app`) – riktig subdomän-routing (`trr.uppdragsutbildning.nu`) kan inte fungera förrän `uppdragsutbildning.nu` + wildcard-subdomän kopplas i Vercel och DNS, se backlog-punkt nedan. `?via=`-fallbacken fungerar redan och är verifierad. Paket D–H (storefront-query, åtkomstlogik, RFP-attribution, leverantörsportal, deep linking) återstår – observera att Paket C bara temar den delade headern, inte hela sidan (t.ex. knappar/nav-länkar använder ännu inte marknadsplatsens färger via `--marketplace-primary`/`--marketplace-secondary`), det slutförs i takt med att Paket D bygger den faktiska temade storefronten. **Paket D (Storefront-query) klart**: `getMarketplaceTrainingIds()` i `src/lib/marketplaces.ts` scopar `CatalogPage` till en marknadsplats kuraterade urval (`partner_curated`) eller en leverantörs egna publicerade kurser (`provider_storefront`), med eget "inga kurser ännu"-tomtillstånd (beslut #10). Verifierat end-to-end mot staging med både Aarons riktiga TRR-testmarknadsplats (4 kuraterade kurser) och en disponibel `provider_storefront`-testrad. Paket E–H återstår.
- Multi-tenant subdomänarkitektur: varumärkt subdomän per leverantör (t.ex. `chalmers.uppdragsutbildning.nu`), begränsad till logotyp + primärfärg. `source`-flagga + `provider_id`-fält skiljer subdomän-RFP:er (routas till en leverantör) från marknadsplats-RFP:er (distribueras brett). **OBS (2026-09-03): denna rad beskriver ett planerat/förutsatt läge – ingen kod för detta hittades i repot. Byggs nu tillsammans med partnermarknadsplatser ovan, se Paket C/F.**
- CPI-gapanalys är byggd och driftsatt på `develop`. Gemini 2.0 Flash-integration via `api/analyze-cpi.ts`.
- Betalningsarkitektur: Stripe Connect + Invoicing API (`collection_method: 'send_invoice'`, `days_until_due: 30`, `application_fee_amount` för 20%-delningen). Bankgiro/OCR-kompatibilitet är overifierad – behöver bekräftas i sandbox innan lansering.
- Känd historisk bugg (2026-08-05, bör vara fixad): race condition i `src/contexts/AuthContext.tsx` – `onAuthStateChange` saknade `setLoading(true)` innan async `loadProfile()`, vilket orsakade felaktig redirect till `/login`.
- Det kan finnas en gammal nästlad mapp `uppdragsutbildning-nu/` inuti projektroten med dubbletter av `src/`-filer – bekräfta innan du rör den.

---

## Att göra innan lansering

- [ ] **PDF-broschyr-import timar ut** (`api/extract-course-from-pdf.ts`): Gemini multimodal PDF-analys ryms inte inom Vercel Hobby-planens 10s-tak, testat live även efter att timeouten höjts till 9s. Kräver antingen en Vercel Pro-uppgradering (konfigurerbar `maxDuration`, kostar pengar – Aarons beslut) eller en arkitekturändring (t.ex. asynkron bakgrundsbearbetning/polling). Beslut om Pro avvaktas (2026-08-06). Excel-importen (`ProviderCourseExcelImportPage.tsx`) fungerar och kan användas under tiden.
- [ ] **Hårdkodad production-fallback i BÅDE `api/create-user.ts` OCH `src/lib/supabase.ts`** (rättat 2026-09-03: den här punkten påstod tidigare att `supabase.ts` redan var fixad till fail-loud – stämmer inte, verifierat i koden). `src/lib/supabase.ts:3-4` faller tyst tillbaka till production-URL/nyckel om `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` saknas, vilket händer med ett rent `.env.local` (bara `VERCEL_OIDC_TOKEN`/`CRON_SECRET` fanns där innan detta upptäcktes) – lokal `npx vite` pekade alltså tyst mot **production** tills detta lades till manuellt i `.env.local`. Bör fixas till fail-loud i båda filerna. Tills dess: se till att `.env.local` har `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` satta mot staging (`eyksngvbrupmxpjzadqp`, hämta värden via Supabase MCP `get_project_url`/`get_publishable_keys`) innan du kör dev-servern lokalt.
- [ ] **Föräldralös fil `src/app/components/pages/ProviderDashboard.tsx`**: verkar oanvänd/oroutead (skild från den riktiga, routade `provider/ProviderDashboard.tsx`). Bekräfta att den verkligen är död kod och ta i så fall bort den.
- [ ] **AdminDashboards "Alla Utbildningsprogram"-flik kör fortfarande på mockdata** (`AdminDashboard.tsx`, `activeTab === 'trainings'`): samma typ av konvertering som Katalog/Hem/Kursdetaljer redan fick 2026-08-06. Godkänn/Avvisa/Förhandsgranska-knapparna där är dessutom inte kopplade till någon funktion.
- [ ] **ProviderHistoryPage ("Historik") är helt hop-påhittad**: varken statistiken högst upp eller aktivitetsloggen kommer från databasen – hårdkodade exempelvärden. Kräver att en riktig datamodell/query för aktivitetsloggen designas (ingen sådan tabell finns idag) innan sidan kan visa verklig data. "Filtrera"-knappen är av samma anledning inte kopplad.
- [ ] **Leverantörsspecifika villkorstexter saknas** (identifierat 2026-08-06 under planering av e-postnotifieringar): "Anmälan bekräftad"-mejlet till deltagare ska länka till leverantörens villkor, men `providers`-tabellen har inget villkorsfält och ingen sida finns att visa det på. Kräver: nytt fält (t.ex. `terms_text`) på `providers`, en sida att visa villkoren på (t.ex. `/leverantor/{id}/villkor`), och ett gränssnitt i Leverantörsportalen där leverantören kan ange/redigera sina villkor (finns ingen generell "leverantörsprofil"-inställningssida idag, bara det kursspecifika redigeringsformuläret). Beslutat: text hos oss, inte extern länk.
- [ ] **E-postnotifieringar (v1) – driftsatt i Production 2026-08-07, fullständig verifiering kvarstår**: `main` synkad med `develop` (b3f5a33), migrationerna (inkl. den tidigare ej migrerade `add_response_deadline`) körda mot production-Supabase, vault-secrets och samtliga Vercel-miljövariabler (`BREVO_API_KEY`, `ADMIN_NOTIFICATION_EMAIL`, `NOTIFY_WEBHOOK_SECRET`, `CRON_SECRET`, `APP_URL`) satta med egna production-värden. Ett begränsat test (allmän RFP utan kopplad kurs) återstår/pågår – se punkten nedan om att production saknar kursdata för varför resten av flödet inte kan fullständigt verifieras än.
- [ ] **Production saknar allt kursinnehåll** (identifierat 2026-08-07 vid produktionslansering av e-postnotifieringarna): `providers`, `trainings`, `categories`, `scheduled_starts` och `applications` har alla 0 rader i production. Katalogen/kurssidorna är alltså helt tomma för riktiga besökare, och notifieringsmejl som kräver en kopplad kurs (Ny offertförfrågan, Ny kursanmälan, leverantörshalvan av Bokning bekräftad, Anmälan bekräftad) kan varken triggas av riktiga användare eller testas förrän minst en leverantör/kurs finns på plats. Kräver en riktig onboarding-process för de första leverantörerna (eller en medveten seed) innan lanseringen är meningsfull för användare.
- [ ] **Mall-redigering via admin-UI** (medvetet uteslutet ur v1, 2026-08-07): e-postmallarna är hårdkodade i `api/_lib/emailTemplates.ts`. Om ni vill kunna redigera texten utan kodändring/deploy krävs att mallarna flyttas till databasen plus ett redigeringsgränssnitt i adminpanelen.
- [ ] **Ingen kundstatussida för offertförfrågningar** (identifierat 2026-08-07 när länkar lades till i notifieringsmejlen): mejl 2 ("Leverantören har svarat") och 4 ("Förfrågan avböjd") går till kunden som skickade en offertförfrågan, men det finns ingen inloggning eller "mina förfrågningar"-vy för den kunden att länka till – de två mejlen saknar därför en call-to-action-länk (till skillnad från övriga fem). Kräver en kundinloggning/statussida innan länkar kan läggas till där också.
- [ ] **Justera brandingen i notifieringsmejlen** (identifierat 2026-08-07): en första omgång gjordes redan (avsändarnamn och logga-text i `api/_lib/emailTemplates.ts`/`sendEmail.ts` ändrat från "Uppdragsutbildning.nu" till "Uppdragsutbildning"), men en mer genomgripande branding-pass återstår – t.ex. riktig logotypbild istället för textlogga, och en bredare koll av färger/typografi i mejlens HTML mot varumärkesriktlinjerna.
- [ ] **Leverantörers `contact_email` saknas i staging – tre av sju notifieringsmejl uteblir tyst** (identifierat 2026-08-07 under test av e-postnotifieringar): `getProviderContactEmail()` i `notify-webhook.ts` skickar bara om `providers.contact_email` är ifyllt, annars hoppas mejlet över helt utan att ens en `email_log`-rad skapas – felet syns alltså ingenstans i admin-vyn. Påverkar "Ny offertförfrågan", "Ny kursanmälan" och leverantörshalvan av "Bokning bekräftad". Kräver: (1) `contact_email` blir ett obligatoriskt fält i leverantörsonboardingen (eller valideras vid inloggning), och (2) det tysta hoppet i `notify-webhook.ts` bör istället skriva en `email_log`-rad med `status='failed'` och en tydlig felorsak, så avsaknaden syns i admin-vyn. Otestat i praktiken innan detta är löst – inget test kunde köras eftersom ingen leverantör i staging har fältet ifyllt.
- [ ] **AdminDashboards "Alla Förfrågningar"-flik saknar helt funktion för att ändra status** (identifierat 2026-08-07 vid produktionstest av e-postnotifieringarna): kortlistan (`AdminDashboard.tsx`, `activeTab === 'leads'`) är rent läsande – statusbadgen är bara ett textspann, inget klick, ingen modal, ingen knapp för att svara/acceptera/avböja en förfrågan. Statusändringar görs idag bara via andra vyer (leverantörens `/provider/requests`, eller kundens anmälningsflöde), vilket gör att en admin inte kan hantera en obesvarad/omatchad förfrågan direkt från sin egen översikt. Bör byggas som en riktig funktion (t.ex. klick öppnar detaljvy med svara/acceptera/avböj-knappar).
- [ ] **`partner_organization_members`-platshållartabell (fas 2, partnermarknadsplatser) medvetet inte skapad i Paket A** (2026-09-03): specen ([docs/specs/partnermarknadsplatser.md](docs/specs/partnermarknadsplatser.md) avsnitt 5) föreslår en tom/förberedd tabell för verifierat medlemskap (kopplat per `buyer_organization_id`, inte individ) för att slippa en extra migrering i fas 2. Bedömdes som YAGNI i Paket A – läggs till som egen migration när fas 2-arbetet (delegerad partner-självbetjäning, verifierat medlemskap) faktiskt påbörjas.
- [ ] **Vercel saknar anpassad domän – blockerar riktig subdomän-routing för marknadsplatser** (identifierat 2026-09-03 i Paket C): projektet (`prj_1GL0IE9NQoTb2QXJ2Ih4P8xIo3tv`) har idag bara `*.vercel.app`-domäner, ingen `uppdragsutbildning.nu`. Kräver att Aaron (kontoåtkomst till Vercel + DNS-leverantör) lägger till `uppdragsutbildning.nu` som anpassad domän i Vercel samt en wildcard-subdomän (`*.uppdragsutbildning.nu`) och matchande DNS-poster. `src/lib/marketplaceContext.tsx` har redan stöd för hostname-baserad routing och kräver ingen kodändring när domänen väl är kopplad – `?via=`-fallbacken fungerar oberoende av detta redan nu.
- [ ] **Paket C temar bara den delade headern, inte hela sidan** (2026-09-03): `Root.tsx` visar partnerns logga/tagline/primärfärg och exponerar `--marketplace-primary`/`--marketplace-secondary` som CSS-variabler, men knappar, nav-länkar, hero-sektioner m.m. i övriga delade komponenter använder ännu hårdkodade Tailwind-färger (blue-600/green-600), inte variablerna. Kurslistningen i `CatalogPage` är nu scopad till marknadsplatsen (Paket D) men fortfarande med plattformens standardfärger, inte partnerns.
- [ ] **`CatalogPage`s kategori-/leverantörsfilter är inte scopade till marknadsplatsen** (2026-09-03, Paket D): filtren visar alla kategorier/leverantörer i hela öppna katalogen även när man bläddrar en kuraterad marknadsplats, inte bara de som faktiskt finns i det kuraterade urvalet – kan ge tomma resultat om man kryssar i en kategori som inte finns i urvalet. Mindre UX-polering, blockerar inte lansering.
- [ ] **`HomePage` är medvetet inte scopad till marknadsplatskontext i Paket D** (2026-09-03): specens avsnitt 7.2 pekar ut kursbläddringen (`CatalogPage`) som den yta som ska återanvändas/scopas – `HomePage` gör inga egna `trainings`-queries idag (statiskt/mock-innehåll) och lämnades därför orörd. Om en riktig "storefront-landningssida" (skärm 5 i specens avsnitt 12) med marknadsplats-specifikt hero-innehåll önskas är det ett separat designarbete, inte del av denna arbetspaketindelning.

---

## UI-riktlinjer

Minimalistisk/luftig estetik (Notion/Linear-stil): typsnitt Inter, blue-600 som primärfärg, green-600 som CTA-färg, vita kort. Undvik mörka overlays och tungt färgade sektioner.

---

## Arbetssätt

- Skriv på svenska om inte annat anges.
- Håll ändringar avgränsade till MVP-scope (avsnitt "Kärnfunktioner") – flagga om en uppgift egentligen är post-MVP.
- Kom ihåg tekniska och affärsmässiga beslut vi fattar under sessionen.
- Bekräfta att du förstått git-flödet ovan innan du kör din första commit i en ny session.
