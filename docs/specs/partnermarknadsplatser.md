# Partnermarknadsplatser för bransch- och omställningsorganisationer
*Specifikation v2 – 2026-09-03. Beslutsklar för handoff till utveckling (Code) och design (Figma Make). Bygger vidare på den befintliga multi-tenant subdomänarkitekturen för leverantörer (se `Uppdragsutbildning-nu_migreringsdokument.md`, avsnitt 5–6).*

*Ändringar sedan v1: alla öppna arkitekturfrågor är nu beslutade (avsnitt 3), konceptet har fått ett fast namn, och dokumentet innehåller nu en skärmlista för Figma Make (avsnitt 12) och en arbetspaketindelning för Code (avsnitt 13).*

---

## 1. Bakgrund och syfte

Uppdragsutbildning.nu är idag en **öppen, gemensam marknadsplats**: alla lärosäten publicerar sina kurser i en delad katalog som alla köpare ser. Parallellt finns en påbörjad mekanism där en enskild **leverantör** kan få en varumärkt subdomän (t.ex. `chalmers.uppdragsutbildning.nu`) som visar leverantörens egna kurser, med logga och primärfärg som varumärkning, och där RFP:er som kommer in via subdomänen routas exklusivt till den leverantören (`source`-flagga + `provider_id`).

Det nya behovet är ett annat: **bransch- och omställningsorganisationer** (t.ex. en TRR-liknande aktör, ett branschförbund, en omställningsfond) ska kunna få en egen, varumärkt marknadsplats – men till skillnad från leverantörssubdomänen ska den inte visa *en* leverantörs kurser, utan ett **kurerat urval från flera leverantörer** hämtat ur den öppna marknadsplatsen. Det är alltså en marknadsplats byggd för en **köpar-/mellanhandsorganisation**, inte för en leverantör.

---

## 2. Begreppsmodell

| Begrepp | Definition |
|---|---|
| **Öppen marknadsplats** | Dagens gemensamma katalog på `uppdragsutbildning.nu`. Alla publicerade kurser från alla leverantörer syns här. |
| **Leverantörssubdomän** (befintlig) | En varumärkt subdomän som visar *en enskild leverantörs* egna kurser. Redan under utveckling. |
| **Partnermarknadsplats** (ny – fastställt namn) | En varumärkt marknadsplats knuten till en **partnerorganisation** (bransch- eller omställningsorganisation), som visar ett **kurerat urval av kurser från flera leverantörer**, hämtade ur den öppna marknadsplatsen. Motsvarar `type = partner_curated` i datamodellen. |
| **Partnerorganisation** | Den bransch- eller omställningsorganisation som äger en partnermarknadsplats (t.ex. en TRR-typ av aktör, ett branschförbund). Inte samma roll som en leverantör (som säljer kurser) eller en köpande organisation (som bokar kurser). |
| **Kursdelning / kuration** | Processen att manuellt välja vilka kurser från den öppna marknadsplatsen som ska visas i en specifik partnermarknadsplats. |
| **Anslutet företag** | En köpande organisation kopplad till en partnerorganisation. Relevant först i fas 2 (se avsnitt 8). |

---

## 3. Beslutade vägval

Samtliga arkitekturfrågor från v1 är nu avgjorda:

| # | Fråga | Beslut |
|---|---|---|
| 1 | Adminmodell | Uppdragsutbildnings interna admin sköter konfiguration och kursurval åt partnern. Inget delegerat självbetjäningsläge i v1 (fas 2-möjlighet, se avsnitt 8). |
| 2 | Tenant-arkitektur | Gemensam `marketplaces`-tabell med typ-fält (`open` \| `provider_storefront` \| `partner_curated`) – se avsnitt 4. Delar branding-/subdomän-/deep-linking-infrastruktur med leverantörssubdomänen. |
| 3 | Kursdelning | Manuell kuration per kurs, en admin väljer aktivt in kurser i respektive partnermarknadsplats. |
| 4 | Åtkomst – vad gatas | Varierar per partner via en flagga på marknadsplatsen (`access_mode`). Rekommenderat default: hela katalogen är öppen och sökbar utan inloggning; att initiera en RFP/bokning kräver ett köparkonto. |
| 5 | Åtkomst – medlemsverifiering | Räcker med ett vanligt Uppdragsutbildning-köparkonto i v1. Verifierat medlemskap hos partnerorganisationen är en fas 2-fråga. |
| 6 | Medlemskapsnivå (för fas 2) | Per **företag** – hela den köpande organisationen räknas som ansluten till partnern, inte enskilda individer. |
| 7 | Namnsättning | **"Partnermarknadsplats"** – används genomgående i produkt, admin och kommunikation med partners. |
| 8 | Kurssynk | Om en kuraterad kurs avpubliceras eller ändras väsentligt på öppna marknadsplatsen försvinner den automatiskt (inte manuellt) från alla partnermarknadsplatser där den är kuraterad. |
| 9 | Partnerrapportering | Ingen inloggad statistikvy för partnern i v1. Endast intern insyn för UB. |
| 10 | Tom marknadsplats | En partnermarknadsplats får publiceras (`status = active`) innan någon kurs är kuraterad. Tomt läge visar ett "inga kurser ännu"-tillstånd. |
| 11 | RFP-attribution | Synlig för leverantören – en förfrågan/bokning som kommer via en partnermarknadsplats taggas med marknadsplatsens namn i leverantörens gränssnitt. |
| 12 | Kursbläddring | Återanvänder marknadsplatsens fullständiga sök-/filter-/kategorikomponenter, omtemat med partnerns varumärke – inte en förenklad lista. |
| 13 | Varumärkningstillgångar | Standardformat låst (se avsnitt 7.1). |

---

## 4. Tenant-arkitektur

En gemensam `marketplaces`-tabell täcker *alla* varumärkta ytor (leverantörssubdomän, partnermarknadsplats, och i förlängningen den öppna marknadsplatsen som en implicit "default"-instans), med **delad infrastruktur** och **typspecifik kursurvalslogik**:

- **Gemensamt för alla typer:** subdomän/slug, branding (logga, färger, hero-bild, tagline), status, deep-linking-mekanik, attribution.
- **Typspecifikt:**
  - `provider_storefront` (befintlig leverantörssubdomän): visar automatiskt *alla* publicerade kurser där `provider_id` matchar ägaren. Ingen manuell kuration.
  - `partner_curated` (ny, denna spec): visar exakt det urval som finns i `marketplace_courses` (avsnitt 5).

Detta undviker att bygga om den redan påbörjade leverantörssubdomänen, samtidigt som det ger en enhetlig, utbyggbar modell för multi-leverantör-scenariot.

---

## 5. Datamodell

> Skiss på Supabase-tabeller. Namn och typer är förslag för Code att verifiera mot befintligt schema.

### `marketplaces`
| Fält | Typ | Beskrivning |
|---|---|---|
| `id` | uuid | PK |
| `type` | enum | `open` \| `provider_storefront` \| `partner_curated` |
| `slug` | text | Subdomän, t.ex. `trr` → `trr.uppdragsutbildning.nu`. Sätts av UB-admin vid skapande, unikt, kollisionskontroll i UI. |
| `owner_type` | enum | `provider` \| `partner_organization` \| `platform` |
| `owner_id` | uuid | FK till `providers` eller `partner_organizations` |
| `name` | text | Visningsnamn |
| `status` | enum | `draft` \| `active` \| `paused` |
| `access_mode` | enum | `open` \| `gated` \| `mixed` |
| `created_at`, `updated_at` | timestamp | |

### `marketplace_branding`
| Fält | Typ | Beskrivning |
|---|---|---|
| `marketplace_id` | uuid | FK |
| `logo_url` | text | Se avsnitt 7.1 för format |
| `primary_color`, `secondary_color` | text | Hex-värden |
| `hero_image_url` | text | Se avsnitt 7.1 för format |
| `tagline` | text | |

### `partner_organizations`
| Fält | Typ | Beskrivning |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | t.ex. "TRR" |
| `org_number` | text | |
| `contact_*` | text | Kontaktperson hos partnern |

### `marketplace_courses` (kuration)
| Fält | Typ | Beskrivning |
|---|---|---|
| `marketplace_id` | uuid | FK |
| `course_id` | uuid | FK till befintlig `courses`-tabell |
| `added_by` | uuid | Admin-användare som gjorde urvalet |
| `added_at`, `removed_at` | timestamp | |

**Viktigt om kurssynk (beslut #8):** `marketplace_courses` lagrar bara *urvalet* (vilka kurser som är valda in), inte en kopia av kursdata. Storefront-frågan som renderar en partnermarknadsplats joinar alltid `marketplace_courses` mot `courses` och filtrerar på `courses.status = 'published'`. En avpublicerad källkurs försvinner därför automatiskt ur alla partnermarknadsplatser utan någon separat synk-jobb eller flagga att städa bort – raden i `marketplace_courses` kan lämnas kvar (blir bara overksam) eller städas bort periodiskt, valfritt för Code.

**RLS-principer:**
- Leverantörer får läsbehörighet (ej skrivbehörighet) på `marketplace_courses` för rader där `course_id` pekar på en kurs de äger.
- Endast intern UB-admin-roll har skrivbehörighet på `marketplaces`, `marketplace_branding` och `marketplace_courses` i v1.
- `partner_organization_members` (medlemsverifiering) byggs inte i v1 (beslut #5) men bör finnas som en tom/förberedd tabell i schemat om Code vill undvika en migrering i fas 2 – kopplas i så fall mot `buyer_organization_id` (beslut #6), inte individ.

---

## 6. Adminfunktionalitet (UB-admin)

Ny sektion i det interna adminpanelen: **"Partnermarknadsplatser"**.

1. **Skapa marknadsplats:** namn, partnerorganisation, subdomän/slug (med kollisionskontroll), initial status (`draft`).
2. **Varumärkning:** ladda upp logga, välja primär-/sekundärfärg, ladda upp hero-bild, sätta tagline. Förhandsgranskning innan publicering.
3. **Kurskuration:** en sökbar/filtrerbar vy över hela den öppna marknadsplatsens kurskatalog (samma ESCO-taggning och filter som befintlig sökning), med en "lägg till i marknadsplats"-knapp per kurs. En separat vy visar aktuellt urval, med möjlighet att ta bort kurser.
4. **Publicera/pausa:** växla `status` mellan `draft`, `active`, `paused`. Publicering tillåts med tomt kursurval (beslut #10).
5. **Åtkomstinställning:** sätt `access_mode` per marknadsplats (beslut #4).

En delegerad självbetjäningsvy för partnern själv är en **fas 2-möjlighet** (se avsnitt 8), inte del av denna spec.

---

## 7. Varumärkning

### 7.1 Tillgångsspecifikation (låst för v1)

| Tillgång | Format | Begränsning |
|---|---|---|
| Logga | SVG eller PNG, transparent bakgrund | Max 2 MB |
| Hero-bild | JPG eller PNG | 1600 × 600 px, max 5 MB |
| Primärfärg / sekundärfärg | Hex-värde | – |
| Tagline | Text | Kort, en rad |

Dessa värden styr både admin-uppladdningskomponenten (Code) och designspecen för uppladdningsformuläret (Figma Make). Kan justeras senare utan att påverka datamodellen.

### 7.2 Rendering på storefront

Kursbläddringen på en partnermarknadsplats **återanvänder marknadsplatsens fullständiga UI-komponenter** (sök, filter, kategorier – samma som öppna marknadsplatsen), scopade till det kuraterade urvalet och omtemade via en branding-kontext som läser `marketplace_id` (via subdomän) och exponerar logga, hero-bild och färger som CSS-variabler/props till delade komponenter (beslut #12). Det innebär i praktiken *ingen ny listningsdesign* i Figma Make – bara temavarianter av befintliga komponenter, plus header/hero.

---

## 8. Fas 2 (uttryckligen utanför denna spec)

- Delegerad självbetjäningsadmin för partnerorganisationen.
- Regelbaserad kursdelning (automatisk synk baserat på ESCO-kategori/bransch) som komplement till manuell kuration.
- Verifierat medlemskap (`partner_organization_members`, kopplat per `buyer_organization_id`) med anslutningsflöde för företag.
- Inloggad statistikvy åt partnern.
- Anpassade domäner (t.ex. `karriar.trr.se` i stället för `trr.uppdragsutbildning.nu`) – redan noterat som fas 2–3 för leverantörssubdomänen, samma lösning återanvänds här.

---

## 9. Leverantörsvy: "Var visas mina kurser?"

Ny vy i leverantörsportalen (samma del som "Min kurser"):

- Per kurs: en lista över de marknadsplatser (öppen + ev. egen subdomän + ev. partnermarknadsplatser) där kursen för närvarande är synlig.
- Läsvy, ingen skrivbehörighet för leverantören i v1.

## 10. RFP-attribution (beslut #11)

En RFP/bokning som skapas via en partnermarknadsplats får `marketplace_id` som attributionsfält (utöver befintlig `source`/`provider_id`). I leverantörens RFP-lista/detaljvy visas en tagg, t.ex. **"Via: TRR"**, med samma visuella mönster som redan finns för leverantörens egen subdomän. Detta kräver:
- Ett nytt fält på RFP/booking-posten (`marketplace_id`, nullable – null = öppna marknadsplatsen).
- En liten UI-komponent i leverantörsportalens RFP-vy (Figma Make, se avsnitt 12).

---

## 11. Deep linking

**Krav:** en specifik kurssida ska kunna länkas direkt, oavsett om länken delas av leverantören, av partnerorganisationen, eller i marknadsföring.

**URL-struktur:**
- **Kanonisk kurssida:** `uppdragsutbildning.nu/kurs/{course-slug}` – SEO-adressen, en per kurs.
- **Marknadsplats-kontextuell länk:** `{marketplace-slug}.uppdragsutbildning.nu/kurs/{course-slug}` – samma kursinnehåll, renderat med partnerns varumärke.
- Kurssidan läser `marketplace_id` (via subdomän, eller `?via=`-parameter som fallback) för att: (a) rendera rätt varumärke, (b) attribuera RFP/bokning (avsnitt 10), (c) om kursen inte längre är kuraterad till den marknadsplatsen (t.ex. borttagen eller källan avpublicerad, se avsnitt 5) – falla tillbaka till den kanoniska sidan i stället för att 404:a.

**Tekniska förutsättningar (React SPA på Vercel):**
- Vercel-routing måste serva appen för alla `/kurs/*`-paths på varje subdomän (verifiera för subdomän-varianten, inte bara huvuddomänen).
- OG-metataggar (bild, titel, beskrivning) bör variera per marknadsplats-kontext, inte bara per kurs.
- `canonical`-taggning pekar alltid mot den kanoniska URL:en, för att undvika duplicerat innehåll i sökmotorer.

---

## 12. Skärmar för Figma Make

| # | Skärm | Yta | Beskrivning |
|---|---|---|---|
| 1 | Partnermarknadsplats – lista | UB-admin | Tabell över alla partnermarknadsplatser: namn, partner, status, antal kurser. Knapp "Skapa ny". |
| 2 | Partnermarknadsplats – skapa/redigera | UB-admin | Formulär: namn, partnerorganisation (välj/skapa), slug (med kollisionsvarning), status-toggle, access_mode-val. |
| 3 | Partnermarknadsplats – varumärkning | UB-admin | Uppladdning av logga och hero-bild (med beskärningsstöd enligt 7.1), färgväljare (primär/sekundär), tagline-fält, live-förhandsgranskning av hur storefronten kommer se ut. |
| 4 | Partnermarknadsplats – kurskuration | UB-admin | Delad vy: vänster = sökbar/filtrerbar hela kurskatalogen (återanvänd befintlig sökkomponent), höger = aktuellt urval för denna marknadsplats med "ta bort"-knapp per rad. |
| 5 | Partnermarknadsplats – storefront (publik) | Publik, på `{slug}.uppdragsutbildning.nu` | Temavariant av öppna marknadsplatsens landningssida: header med partnerns logga/färger, hero-bild, samma sök/filter/kategori-komponenter men scopade till kuraterat urval. Tomt tillstånd: "inga kurser ännu" (beslut #10). |
| 6 | Kursdetaljsida – marknadsplatskontext | Publik | Samma kursdetaljmall som idag, men med partnerns branding i header/chrome när nådd via en partnermarknadsplats-URL eller -subdomän. |
| 7 | Leverantörsportal – "Var visas mina kurser" | Leverantör | Ny flik/sektion under "Min kurser": per kurs, lista av marknadsplatser den är aktiverad i, med status-badge. |
| 8 | Leverantörsportal – RFP-lista med attribution | Leverantör | Befintlig RFP-lista/detaljvy, tillägg: en liten "Via: [marknadsplatsnamn]"-tagg per rad/detalj (null = ingen tagg, kom via öppna marknadsplatsen). |

---

## 13. Arbetspaket för Code

| Paket | Innehåll |
|---|---|
| **A. Datamodell & migrationer** | `marketplaces`, `marketplace_branding`, `partner_organizations`, `marketplace_courses` enligt avsnitt 5. RLS-policyer. Förberedd (men ej aktiverad) plats för `partner_organization_members` inför fas 2. |
| **B. UB-admin: marknadsplatshantering** | CRUD för `marketplaces`/`marketplace_branding`, slug-kollisionskontroll, kurationsvy (läs hela katalogen, skriv `marketplace_courses`). |
| **C. Subdomän-routing & theming** | Middleware/routing som slår upp `marketplace_id` från subdomän, branding-kontext som injicerar logga/färger/hero i delade UI-komponenter. Verifiera Vercel-routing för djuplänkar per subdomän. |
| **D. Storefront-query** | Query som joinar `marketplace_courses` mot `courses` med `status = 'published'`-filter (automatisk kurssynk, avsnitt 5), scopad per `marketplace_id`. |
| **E. Åtkomstlogik** | `access_mode`-kontroll: öppen bläddring alltid, inloggningskrav på RFP/bokning enligt flaggan. Ingen medlemsverifiering i v1 (bara förberedd datamodell). |
| **F. RFP-attribution** | Nytt `marketplace_id`-fält på RFP/booking, sätts vid inkommande förfrågan från en partnermarknadsplats-URL. Ytan i leverantörsportalen (paket G). |
| **G. Leverantörsportal** | "Var visas mina kurser"-vy + RFP-attributiontagg. |
| **H. Deep linking & SEO** | Kanonisk vs. kontextuell URL, `?via=`-fallback, canonical-taggning, OG-metataggar per marknadsplats. |

---

## 14. Kvarstående öppna frågor

Inga arkitektur- eller produktbeslut kvarstår för v1. Det som återstår är implementationsdetaljer som naturligt löses under Code/Figma Make-arbetet, t.ex. exakt slug-valideringsregex och exakt copy för tomma tillstånd – dessa behöver inte blockera byggstart.

---

## Avvikelse från antagen utgångspunkt (tillagd av Claude Code, 2026-09-03)

Specen och `CLAUDE.md` beskriver leverantörssubdomän-infrastrukturen (subdomänrouting, branding, `source`/`provider_id`-attribution) som **redan påbörjad**. En fullständig genomsökning av repot (samtliga branches: `develop`, `main`, `staging`) hittade **ingen sådan kod**: inget hostname-baserat routing, inga branding-tabeller, inget `source`-fält på `custom_requests`. `src/lib/marketplaceAdapters.ts` är namnlikt men orelaterat (datatyper för katalogen, inte multi-tenancy).

**Beslut (bekräftat av Aaron 2026-09-03):** Bygg `marketplaces`-infrastrukturen från grunden för båda typerna (`provider_storefront` *och* `partner_curated`) som en del av detta uppdrag, inte bara `partner_curated` ovanpå en befintlig grund. Schemat i avsnitt 5 påverkas inte (samma delade tabeller täcker båda typerna redan enligt avsnitt 4), men Paket C (subdomän-routing) och F (RFP-attribution) är därmed större i scope än vad specen förutsätter, eftersom ingen befintlig routing/attribution finns att utöka.
