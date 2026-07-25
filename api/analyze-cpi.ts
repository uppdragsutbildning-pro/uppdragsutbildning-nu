
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { companyName, industry, companySize, scores, freetext, siScores } = req.body;
  const { AF, PF, OK, TR, total } = scores;
  const level =
    total < 25 ? 'Lågt tryck' :
    total < 50 ? 'Måttligt tryck' :
    total < 75 ? 'Högt tryck' : 'Kritiskt tryck';

  const prompt = `Du är en expert på strategisk kompetensutveckling i svenska organisationer.
Svara ALLTID på svenska. Returnera ENBART giltig JSON utan markdown-block.

Analysera Kompetensindex (CPI) för ${companyName} (${industry}, ${companySize} medarbetare):

CPI-total: ${total}/100 (${level})
- Arbetsförändring (AF): ${AF}/100
- Prestationsfriktion (PF): ${PF}/100
- Omställningskapacitet (OK): ${OK}/100
- Transformationsriktning (TR): ${TR}/100

Strategisk insatsprofil:
- Rekryteringsbehov: ${siScores?.SI1}/5
- Reskilling-behov: ${siScores?.SI2}/5
- Upskilling-behov: ${siScores?.SI3}/5
- Nya arbetssätt: ${siScores?.SI4}/5

Fritext – förändringsdrivkrafter: "${freetext?.af4 || 'ej angivet'}"
Fritext – konkreta friktionspunkter: "${freetext?.pf5 || 'ej angivet'}"
Fritext – kritiska förmågor 12–24 mån: "${freetext?.tr4 || 'ej angivet'}"

Returnera JSON med exakt denna struktur:
{
  "summary": "2-3 meningar specifik strategisk analys",
  "recommendations": [
    { "title": "Titel", "body": "Beskrivning", "priority": "high" }
  ],
  "chiefBriefing": "1 mening för VD/styrelse, max 25 ord",
  "escoTerms": ["term1", "term2", "term3"]
}

Regler: exakt 3 rekommendationer, priority: high/medium/low, 3-5 escoTerms.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key missing' });

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 800, responseMimeType: "application/json" },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('Gemini error:', err);
      return res.status(500).json({ error: 'Gemini API error' });
    }

    const data = await geminiRes.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    console.log("Gemini råsvar:", JSON.stringify(text).substring(0, 300));
    const stripped = text.replace(/\\\*/g, '').replace(/\*/g, '');
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('analyze-cpi error:', err);
    return res.status(500).json({ error: 'Analys misslyckades' });
  }
}
