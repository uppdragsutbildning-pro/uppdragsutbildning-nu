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
  "summary": "2-3 meningar som sammanfattar situationen och det viktigaste att agera på",
  "recommendations": [
    {"title": "Kort titel", "body": "2-3 meningar med konkret råd", "priority": "high"},
    {"title": "Kort titel", "body": "2-3 meningar med konkret råd", "priority": "medium"},
    {"title": "Kort titel", "body": "2-3 meningar med konkret råd", "priority": "low"}
  ],
  "chiefBriefing": "Max 25 ord för ledningsgruppen",
  "escoTerms": ["kompetensterm1", "kompetensterm2", "kompetensterm3", "kompetensterm4", "kompetensterm5"]
}`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key missing' });

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('Gemini error:', err);
      return res.status(500).json({ error: 'Gemini API error', details: err });
    }

    const data = await geminiRes.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const finishReason = data.candidates?.[0]?.finishReason;
    console.log('Gemini finishReason:', finishReason, '| text preview:', text.substring(0, 100));

    if (!text) throw new Error('Empty response from Gemini');

    const parsed = JSON.parse(text.trim());
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('analyze-cpi error:', err);
    return res.status(500).json({ error: 'Analys misslyckades', details: String(err) });
  }
}
