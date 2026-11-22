import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { companyName, industry, companySize, scores, freetext, siScores, occupations } = req.body;
  const { AF, LF, OK, TR, total } = scores;
  const level = total < 25 ? 'Lågt tryck' : total < 50 ? 'Måttligt tryck' : total < 75 ? 'Högt tryck' : 'Kritiskt tryck';

  // Bara de svar som behövs för analysen skickas vidare. Kontaktuppgifter (namn, e-post) hålls utanför.
  const ft = freetext ?? {};
  const answersBlock = JSON.stringify({
    forandringsdrivare_AF4: ft.af4 || null,
    vardagsfriktion_KP5: ft.pf5 || null,
    kritiska_formagor_SR4: ft.tr4 || null,
    onskad_insatstyp_LI1: Array.isArray(ft.li1) ? ft.li1 : [],
    onskat_upplagg_LI2: Array.isArray(ft.li2) ? ft.li2 : [],
  });

  const occupationsBlock = Array.isArray(occupations) && occupations.length > 0
    ? occupations.map((occ: { label: string; definition?: string; ssykGroupLabel?: string | null; skills?: string[] }) =>
        `- ${occ.label}${occ.ssykGroupLabel ? ` (SSYK-grupp: ${occ.ssykGroupLabel})` : ''}: ${
          occ.skills && occ.skills.length > 0
            ? `kompetenser enligt SSYK: ${occ.skills.join(', ')}`
            : occ.definition || 'ingen ytterligare beskrivning tillgänglig'
        }`
      ).join('\n')
    : 'Inga yrkesroller valda';

  const prompt = `Du är en svensk HR-strateg och kompetensutvecklingsexpert. Skriv en rapport till ledningen utifrån följande resultat från Strategiskt kompetensindex. Skriv på svenska, konkret och sakligt, utan utropstecken och utan att överdriva.

Företag: ${companyName || 'Okänt'}
Bransch: ${industry || 'Okänd'}
Storlek: ${companySize || 'Okänd'} medarbetare
Kompetenstryck totalt: ${level} (${total}/100)

Alla poäng är 0–100 och har samma riktning: HÖGRE POÄNG = STÖRRE BEHOV ELLER STÖRRE BEGRÄNSNING.
- AF (Arbetsförändring): ${AF}/100 – hög poäng = arbetet förändras snabbt
- KP (Kompetenspåverkan): ${LF}/100 – hög poäng = kompetensbrist påverkar kvalitet, tempo och leverans
- OK (Omställningskapacitet): ${OK}/100 – hög poäng = BEGRÄNSAD kapacitet att lära och ställa om
- SR (Strategisk riktning): ${TR}/100 – hög poäng = OTYDLIG riktning och plan för kompetensförsörjning
Nivåer: 0–24 Lågt, 25–49 Måttligt, 50–74 Högt, 75–100 Kritiskt.

Behov av insatser (skala 1–5): rekrytering ${siScores?.si1}, kompetensväxling ${siScores?.si2}, kompetensutveckling ${siScores?.si3}, nya arbetssätt ${siScores?.si4}.

Respondentens egna svar (en person, inte en grupp):
${answersBlock}

Yrkesroller organisationen vill prioritera kompetensutveckling för (enligt SSYK 2012), med tillhörande kompetenser:
${occupationsBlock}

Grunda rekommendationerna i de konkreta kompetenser och yrkesroller som listas ovan, inte i generiska begrepp. Svaren kommer från en enda respondent: skriv "i era svar" eller "respondenten", aldrig "flera medarbetare" eller "på gruppnivå". Hitta inte på fakta som inte framgår av underlaget.

Svara ENBART med ett JSON-objekt (ingen markdown, inga förklaringar utanför JSON) med exakt dessa fält:
{
  "overallAssessment": "2-3 meningar övergripande bedömning",
  "topRisk": "1-2 meningar om den viktigaste risken om inget görs",
  "topAction": "1-2 meningar om den högst prioriterade åtgärden",
  "messages": {
    "strength": {"title": "kort rubrik", "body": "1-2 meningar"},
    "weakness": {"title": "kort rubrik", "body": "1-2 meningar"},
    "risk": {"title": "kort rubrik", "body": "1-2 meningar"},
    "opportunity": {"title": "kort rubrik", "body": "1-2 meningar"}
  },
  "voice": {
    "drivers": "1-2 meningar: vad driver förändringen enligt respondenten",
    "friction": "1-2 meningar: vad tar längre tid eller skjuts upp på grund av kompetensbrist",
    "capabilities": "1-2 meningar: vilka förmågor behöver stärkas de kommande 12-24 månaderna",
    "wishes": "1-2 meningar: hur organisationen vill utveckla kompetensen (insatstyp och upplägg)"
  },
  "recommendations": [
    {"title": "Kort titel", "body": "2-3 meningar med konkret råd", "priority": "high", "dimension": "KP", "searchTerms": ["4-6 specifika sökord och synonymer som kan finnas i en kurstitel, t.ex. 'förändringsledning', 'förändringshantering'"]}
  ],
  "roadmap": [
    {"title": "Diagnos", "text": "1-2 meningar för månad 0-3"},
    {"title": "Design", "text": "1-2 meningar för månad 3-6"},
    {"title": "Genomför", "text": "1-2 meningar för månad 6-9"},
    {"title": "Effekt", "text": "1-2 meningar för månad 9-12"}
  ],
  "focus": {
    "profile": "En fråga till ledningen om profilen",
    "quadrant": "En fråga till ledningen om förändringstryck mot omställningskapacitet",
    "messages": "En fråga till ledningen om styrkor, svagheter, risker och möjligheter",
    "priority": "En fråga till ledningen om vilka insatser som ska prioriteras"
  }
}
Krav: "searchTerms" ska vara specifika kompetensord (gärna sammansatta ord), inte breda ord som "digital", "ledarskap" eller "strategi" ensamma. "recommendations" ska innehålla 4 poster. "priority" är "high", "medium" eller "low". "dimension" är ett av "AF", "KP", "OK", "SR", "SI". "roadmap" ska innehålla exakt 4 poster i den ordningen. Frågorna i "focus" ska vara öppna frågor som slutar med frågetecken.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key missing' });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 4500,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('Gemini error:', err);
      return res.status(500).json({ error: 'Gemini API error', details: err });
    }

    const data = await geminiRes.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text) throw new Error('Empty response from Gemini');

    const parsed = JSON.parse(text.trim());
    return res.status(200).json(parsed);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI-analysen tog för lång tid, försök igen' });
    }
    console.error('analyze-cpi error:', err);
    return res.status(500).json({ error: 'Analys misslyckades', details: String(err) });
  }
}
