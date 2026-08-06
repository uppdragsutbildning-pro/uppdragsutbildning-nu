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

- Multi-tenant subdomänarkitektur: varumärkt subdomän per leverantör (t.ex. `chalmers.uppdragsutbildning.nu`), begränsad till logotyp + primärfärg. `source`-flagga + `provider_id`-fält skiljer subdomän-RFP:er (routas till en leverantör) från marknadsplats-RFP:er (distribueras brett).
- CPI-gapanalys är byggd och driftsatt på `develop`. Gemini 2.0 Flash-integration via `api/analyze-cpi.ts`.
- Betalningsarkitektur: Stripe Connect + Invoicing API (`collection_method: 'send_invoice'`, `days_until_due: 30`, `application_fee_amount` för 20%-delningen). Bankgiro/OCR-kompatibilitet är overifierad – behöver bekräftas i sandbox innan lansering.
- Känd historisk bugg (2026-08-05, bör vara fixad): race condition i `src/contexts/AuthContext.tsx` – `onAuthStateChange` saknade `setLoading(true)` innan async `loadProfile()`, vilket orsakade felaktig redirect till `/login`.
- Det kan finnas en gammal nästlad mapp `uppdragsutbildning-nu/` inuti projektroten med dubbletter av `src/`-filer – bekräfta innan du rör den.

---

## Att göra innan lansering

- [ ] **PDF-broschyr-import timar ut** (`api/extract-course-from-pdf.ts`): Gemini multimodal PDF-analys ryms inte inom Vercel Hobby-planens 10s-tak, testat live även efter att timeouten höjts till 9s. Kräver antingen en Vercel Pro-uppgradering (konfigurerbar `maxDuration`, kostar pengar – Aarons beslut) eller en arkitekturändring (t.ex. asynkron bakgrundsbearbetning/polling). Beslut om Pro avvaktas (2026-08-06). Excel-importen (`ProviderCourseExcelImportPage.tsx`) fungerar och kan användas under tiden.

---

## UI-riktlinjer

Minimalistisk/luftig estetik (Notion/Linear-stil): typsnitt Inter, blue-600 som primärfärg, green-600 som CTA-färg, vita kort. Undvik mörka overlays och tungt färgade sektioner.

---

## Arbetssätt

- Skriv på svenska om inte annat anges.
- Håll ändringar avgränsade till MVP-scope (avsnitt "Kärnfunktioner") – flagga om en uppgift egentligen är post-MVP.
- Kom ihåg tekniska och affärsmässiga beslut vi fattar under sessionen.
- Bekräfta att du förstått git-flödet ovan innan du kör din första commit i en ny session.
