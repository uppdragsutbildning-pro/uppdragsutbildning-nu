import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { companyName, industry, companySize, scores, freetext, siScores } = req.body;
  const { AF, PF, OK, TR, total } = scores;
  const level = total < 25 ? 'Lågt tryck' : total < 50 ? 'Måttligt tryck' : total < 75 ? 'Högt tryck' : 'Kritiskt tryck';

  const prompt = `Du är en svensk HR-strateg och kompetensutvecklingsexpert. Analysera följande Kompetensindex-resultat och ge konkreta rekommendationer.

Företag: ${companyName || 'Okänt'}
Bransch: ${industry || 'Okänd'}
Storlek: ${companySize || 'Okänd'} medarbetare
Kompetensnivå: ${level} (${total}/100)

Delpoäng:
- AF (Arbetsförändring): ${AF}/100
- PF (Prestationsförmåga): ${PF}/100
- OK (Omställningskapacitet): ${OK}/100
- TR (Transformationsriktning): ${TR}/100

Fritext från användaren:
${freetext ? JSON.stringify(freetext) : 'Ingen fritext angiven'}

Svara ENBART med ett JSON-objekt (ingen markdown, inga förklaringar utanför JSON):
{
  "overallAssessment": "2-3 meningar övergripande bedömning av situationen",
  "topRisk": "1-2 meningar om den viktigaste risken om inget görs",
  "topAction": "1-2 meningar om den högst prioriterade åtgärden",
  "orgVoice": "1-2 meningar baserat på fritextsvar som speglar organisationens egna ord",
  "recommendations": [
    {"title": "Kort titel", "body": "2-3 meningar med konkret råd", "priority": "high"},
    {"title": "Kort titel", "body": "2-3 meningar med konkret råd", "priority": "medium"},
    {"title": "Kort titel", "body": "2-3 meningar med konkret råd", "priority": "low"}
  ],
  "escoTerms": ["term1", "term2", "term3", "term4", "term5"]
}`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key missing' });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

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
            maxOutputTokens: 2000,
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
    const finishReason = data.candidates?.[0]?.finishReason;


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
