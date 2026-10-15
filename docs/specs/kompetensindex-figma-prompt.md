# Figma-prompt: Strategiskt Kompetensindex®

> Klistra in allt under strecket i Figma (Make). Beskriver nuläget i koden per 2026-09-29
> (`KompetensindexPage.tsx`, `kompetensindex/*`, `ResultsView.tsx`, `api/analyze-cpi.ts`, adminfliken i `AdminDashboard.tsx` + `CpiRecordDrawer.tsx`).

---

Designa det kompletta flödet för **Strategiskt Kompetensindex®** på Uppdragsutbildning.nu – en B2B-marknadsplats som kopplar ihop organisationer (företag, kommuner, regioner) med universitet, högskolor och yrkeshögskolor för uppdragsutbildning. Kompetensindex är ett kostnadsfritt, AI-stött analysverktyg där en ledningsperson (HR-chef, VD, L&D-ansvarig) besvarar 24 frågor och får en ledningsrapport med index, risker, prioriteringar och koppling till relevanta utbildningar. All text på svenska.

## Designprinciper
- Minimalistisk, luftig estetik i Notion/Linear-stil. Typsnitt **Inter**. Vita kort på `slate-50`-bakgrund, rundade hörn (12px kort, 8px knappar/fält), tunna `slate-200`-kanter, subtila skuggor.
- **Primärfärg `blue-600`** (#2563EB), **CTA-färg `green-600`** (#16A34A). Undvik mörka overlays och tungt färgade sektioner.
- **Vitmärkningsbart:** alla primär-/CTA-ytor ska byggas på två variabler/tokens – `marketplace-primary` (default blue-600) och `marketplace-secondary` (default green-600) – så att en partnermarknadsplats (t.ex. TRR, lila) kan byta färg utan att designen går sönder. Semantiska färger (nivåer, dimensioner, prioritet) ändras INTE med varumärket.
- Max innehållsbredd: 768px (formulär och resultat), 896px (introsida). Responsivt ned till mobil (375px).

## Semantiska färger
- **CPI-nivåer** (används för totalpoäng och dimensionspoäng):
  - 0–24 **Lågt tryck** – grön (bg #F0FDF4, kant #86EFAC, text #16A34A)
  - 25–49 **Måttligt tryck** – blå (bg #EFF6FF, kant #93C5FD, text #2563EB)
  - 50–74 **Högt tryck** – amber (bg #FFFBEB, kant #FCD34D, text #D97706)
  - 75–100 **Kritiskt tryck** – röd (bg #FEF2F2, kant #FCA5A5, text #DC2626)
- **Dimensioner:** AF = blå, LF = röd, OK = grön, TR = amber, SI = amber-500, LI = purple-500. (Obs: i dagens formulär har TR blå sektionsmarkering men amber i resultatet – harmonisera till amber.)
- **Prioritet:** Hög = red-100/red-700, Medel = amber-100/amber-700, Låg = green-100/green-700.

## Domänlogik (för att visualiseringarna ska bli rätt)
- Fyra CPI-dimensioner, 0–100:
  - **AF – Arbetsförändring** (direkt scoring): hur snabbt roller/processer förändras.
  - **LF – Leveransfriktion** (direkt): hur mycket kompetensbrist hindrar leveransen.
  - **OK – Omställningskapacitet** (omvänd): förmåga att lära om och ställa om. Högt svar = lägre tryck.
  - **TR – Transformationsriktning** (omvänd): hur tydlig strategin för kompetensförsörjning är.
- Direkt = (svar−1)/4×100. Omvänd = (5−svar)/4×100. **Total CPI = snitt av de fyra.** Högt värde = högt kompetenstryck (sämre läge).
- **SI – Strategisk insats** (4 frågor, 1–5) påverkar inte CPI utan visar vilka insatstyper som prioriteras.
- **LI – Lärande & insatser** är preferenser + val av yrkesroller enligt **SSYK 2012** (Arbetsförmedlingens yrkestaxonomi). Valda roller hämtar automatiskt tillhörande kompetenser som visas i rapporten.

## Skärmar att designa

### 0. Ingång från startsidan (kort)
Hero-kort bredvid "Sök utbildning"-kortet: badge "STRATEGISK KOMPETENSINDEX®" (grön pill med målikon), rubrik "Vilka kompetenser behöver ni?", brödtext "AI-baserad analys av era utvecklingsbehov.", checklista med gröna bockar (Konkreta insikter · Matchning mot kurser · Kostnadsfri analys), full-bredd grön CTA "Genomför analys →". Diskret dekorativ målikon uppe till höger med 10% opacitet.

### 1. Introsida (`/kompetensanalys`)
- **Hero** i primärfärg (mjuk gradient): liten pill "STRATEGISK ANALYS", H1 "Strategiskt Kompetensindex®", ingress: "En analys som hjälper er ledning att identifiera vilka kompetenser organisationen behöver utveckla för att nå sina mål — och var gapet mellan förändringstryck och förmåga att ställa om är som störst." Till höger (desktop) ett 2×2-rutnät av halvtransparenta ikonrutor: Index, AI-analys, Prioritering, Matchning.
- **Fyra infokort** (2×2): *Vem svarar?* (HR-chef, VD eller verksamhetsansvarig) · *Hur går det till?* (24 frågor, sex områden, skalor, flerval, tre öppna frågor) · *Hur lång tid tar det?* (10–15 min) · *Vad händer med era svar?* (AI-analys → ledningsrapport).
- **Datahanteringsnotis** (amber infobox): information om lagring/behandling publiceras inom kort. Designa så den enkelt kan bytas mot en riktig GDPR-länk.
- **"Varför göra analysen?"**-banner. (Dagens version är mörk slate-gradient – föreslå ett ljusare alternativ i linje med principerna.)
- Centrerad primär-CTA **"Starta analysen →"**.

### 2. Frågeformulär – 7 steg
**Stegindikator** överst (vit list, sticky-känsla): "← Avbryt" till vänster, sedan 7 numrerade cirklar med etikett under: Info · AF · LF · OK · TR · SI · LI. Klart = grön med ✓, aktivt = primärfärg, kommande = grå. Förbindelselinjer blir gröna när steget passerats.

**Sektionsrubrik** per steg: vänsterkant 4px i dimensionsfärg, rubrik + underrubrik.

**Frågekort (komponent):** vitt kort, liten blå pill med fråge-id (t.ex. "AF1"), frågetext (medium), valfri kursiv metarad, därunder svarskomponenten.

**Svarskomponenter:**
- **Skala 1–5:** fem lika breda knappar (44px höga), vald = fylld primärfärg; under: "Inte alls" vänster, "Mycket hög grad" höger. Enhetlig skala på alla skalfrågor.
- **Fritext:** textarea (min 100px), plus diskret länk "💡 Hjälp mig tänka" som fäller ut en ljusblå hjälpruta med en reflektionsfråga + "Andra verksamheter nämner ofta:" och 4 exempel. Stängs med ×.
- **Flervalschips:** pill-knappar, vald = ljusblå bakgrund med blå kant.
- **Yrkesrollsväljare (SSYK):** dropdown "Yrkesområde" → sökfält "Yrkesroller" (inaktivt tills område valts, placeholder "Välj yrkesområde först") med autocomplete-lista → valda roller som borttagbara chips (×).
- **Branschsök (SNI):** sökfält med autocomplete där varje rad visar SNI-kod i mono-badge + benämning.

**Stegens innehåll:**
- **Steg 1 – Om er verksamhet:** Namn, E-postadress, Företagets namn, Bransch (SNI, autocomplete), Antal medarbetare (dropdown: 1–9 … 5 000+), Din roll (dropdown: VD/CEO, HR-chef, HR-specialist, Utbildningsansvarig/L&D-chef, Avdelningschef, Ekonomichef, Operativ chef, Inköpsansvarig, Medarbetare utan chefsroll, Annan chef, Styrelseledamot/Ägare, Annat).
- **Steg 2 – Arbetsförändring (AF):** AF1–AF3 skala (förändrade arbetssätt idag, förändrade roller kommande två år, ökad komplexitet senaste året). AF4 fritext "Vilka områden driver störst förändring just nu?" + hjälpruta.
- **Steg 3 – Leveransfriktion (LF):** LF1–LF4 skala (kvalitet, tempo/produktivitet, leveransförmåga, beroende av nyckelpersoner). LF5 fritext "Vilka arbetsuppgifter undviks, skjuts upp eller tar längre tid på grund av kompetensbrist?" + hjälpruta.
- **Steg 4 – Omställningskapacitet (OK):** OK1–OK4 skala (tid/struktur för lärande, förmåga att lära om, trygghet i förändring, utveckling över teamgränser).
- **Steg 5 – Transformationsriktning (TR):** TR1–TR3 skala (tydliga förmågor framåt, koppling till verksamhetsmål, plan för rekrytera/växla/utveckla). TR4 fritext "Vilka kompetenser bedömer ni som mest kritiska de kommande 12–24 månaderna?" (meta: "Används för kompetensmatchning") + hjälpruta.
- **Steg 6 – Strategisk insats (SI):** SI1–SI4 skala (behov av rekrytering, kompetensväxling, kompetensutveckling, nya arbetssätt).
- **Steg 7 – Lärande & insatser (LI):** LI1 chips (Kort kurs 1–3 dagar, Längre program, Workshop, Coaching & mentoring, Företagsanpassad uppdragsutbildning). LI2 chips (Digitalt/online, Fysiskt/på plats, Blandat lärande, Cohort-baserat, Självstudier i egen takt). LI3 SSYK-yrkesrollsväljare (meta: "Kopplas mot SSYK 2012 och används för att grunda rapportens kompetensrekommendationer").

**Navigation:** "← Tillbaka" (sekundär, outline) vänster, "Nästa →" (primär) höger. Sista steget: **"Analysera →"** i CTA-grön. Knappen är inaktiv (40% opacitet) tills alla obligatoriska fält i steget är ifyllda – visa gärna ett förslag på hur man tydliggör *vad* som saknas.

**Avbryt-dialog:** liten centrerad modal "Avbryt analysen?" / "Dina svar sparas inte om du lämnar nu." med "Fortsätt analysen" (primär) och "Lämna ändå" (sekundär).

### 3. Laddningsskärm
Centrerad spinner i primärfärg + tre stegrader som bockas av i grönt: "Beräknar CPI-index…", "Hämtar SSYK-kompetenser…", "Genererar rekommendationer…".

### 4. Resultat – ledningsrapport
Uppifrån och ned:
1. **Header:** "Strategiskt Kompetensindex®", undertext "{Företag} · SNI {bransch}". Knapp till höger: "✏️ Ändra svar" (outline).
2. **Totalpoängkort:** stort tal (72px) i nivåfärg + "/ 100" i grått, nivå-pill (t.ex. "Högt tryck"), en mening som tolkar nivån. Kortets bakgrund/kant i nivåns färger.
3. **Fyra dimensionskort** (2×2): dimensions-pill (AF/LF/OK/TR), namn, poäng i nivåfärg till höger, tunn progress-bar i dimensionsfärg, kort förklarande text om vad dimensionen mäter.
4. **Prioriterade kompetensinsatser (SI):** fyra rader – Rekrytering, Kompetensväxling, Kompetensutveckling, Nya arbetssätt – med horisontell bar och värde 1–5.
5. **AI-analys** (kort med 4px primärfärgad vänsterkant, ✨-ikon): rubrik "CHEFSSAMMANFATTNING" och fyra tonade block:
   - *Övergripande bedömning* (slate)
   - *Viktigaste risk* (röd ton)
   - *Högst prioriterade åtgärd* (amber ton)
   - *Organisationens röst* (blå ton – speglar deras egna fritextsvar)
   Designa även **skeleton-läge** (AI-svaret tar några sekunder) och **fel-läge** ("Analysen kunde inte genereras." + "Försök igen").
6. **Kompetenser kopplade till valda yrkesroller (SSYK):** gröna chips, undertext "Enligt Arbetsförmedlingens yrkestaxonomi SSYK 2012". Visas bara om yrkesroller valts.
7. **Rekommendationer:** numrerad lista (3–6 st), varje rad: nummercirkel, titel + prioritets-pill (Hög/Medel/Låg), 2–3 meningars brödtext, länk "Utforska utbildningar →". Skeleton- och fel-läge.
8. **Avslutande CTA-block** i primärfärg: "Redo att hitta rätt utbildning?" / "Matcha er kompetensprofil mot utbildningar från ledande lärosäten", knappar "Gör en ny analys" (outline vit) och **"Begär offert från lärosäten →"** (vit, primär). Det här är det kommersiellt viktigaste momentet – ge det tyngd.

**"Dina svar"-sidopanel** (öppnas via "Ändra svar"): högerpanel, max 448px, med halvtransparent bakgrund. Rubrik + ×, skalförklaring "1 = Inte alls, 5 = Mycket hög grad", sju fällbara sektioner (numrerade) som listar fråga-id → svar, och en knapp "✏️ Ändra {sektion}" som hoppar tillbaka till steget.

### 5. Admin – "Kompetensindex — Rapporter" (flik i adminpanelen)
- Rubrik + "{n} av {total} genomförda analyser", knapp "⬇ Exportera CSV" (exporterar filtrerat urval).
- **Fyra statistikkort:** AF/LF/OK/TR – snitt för filtrerat urval.
- **Sök + filter:** sökfält ("Sök på företag, kontakt, fritextsvar, yrkesroller..."), dropdowns Alla branscher / Alla storlekar / Alla roller, länk "Rensa filter".
- **Tabell:** Datum, Företag, Kontakt, Bransch, Storlek, Total (fet), AF (blå), LF (röd), OK (grön), TR (amber), Åtgärder (👁 visa, 🗑 ta bort). Paginering 20/sida. Tomt läge + "Inga träffar"-läge + skeleton vid laddning.
- **Detaljpanel** (högerpanel, samma mönster som "Dina svar"): företagsnamn som rubrik, "Inskickad {datum}", sektioner: Kontakt & företag · CPI-poäng · Strategisk insats · Fritextsvar · Lärande & insatser · SSYK-kompetenser (gröna chips).
- Bekräftelsedialog vid radering.

## Leverans
- Desktop (1440) och mobil (375) för introsida, ett representativt formulärsteg (AF), LI-steget (yrkesrollsväljare), resultatsidan (fylld + laddar + fel) och adminfliken.
- Komponentbibliotek: Frågekort, Skala 1–5, Chips, Yrkesrollsväljare, SNI-autocomplete, Stegindikator, Nivå-pill, Dimensionskort, SI-bar, AI-analysblock, Rekommendationsrad, Sidopanel.
- Visa en variant med marknadsplatsfärg (t.ex. lila #7C3AED som `marketplace-primary`) för att bevisa vitmärkningen.

## Utanför scope (designa inte nu)
- Inloggning/konto och "Deep Dive" bakom konto – Kompetensindex är idag öppet/anonymt med kontaktuppgifter i steg 1.
- PDF-export av rapporten, sparade/återupptagbara analyser, jämförelse över tid.
