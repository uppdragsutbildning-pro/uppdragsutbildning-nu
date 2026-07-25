import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const {
    companyName, industry, companySize,
    scores, freetext, siScores
  } = await req.json();

  const { AF, PF, OK, TR, total } = scores;
  const level =
    total < 25 ? "Lågt tryck" :
    total < 50 ? "Måttligt tryck" :
    total < 75 ? "Högt tryck" : "Kritiskt tryck";

  const prompt = `
Du är en expert på strategisk kompetensutveckling i svenska organisationer.
Svara ALLTID på svenska. Returnera ENBART giltig JSON utan markdown-block.

Analysera Kompetensindex (CPI) för ${companyName} (${industry}, ${companySize} medarbetare):

CPI-total: ${total}/100 (${level})
- Arbetsförändring (AF): ${AF}/100 — mäter förändringstryck
- Prestationsfriktion (PF): ${PF}/100 — kompetensbristen bromsar leverans
- Omställningskapacitet (OK): ${OK}/100 — förmåga att lära om (högt = svårare)
- Transformationsriktning (TR): ${TR}/100 — strategisk otydlighet (högt = oklart)

Strategisk insatsprofil:
- Rekryteringsbehov: ${siScores.SI1}/5
- Reskilling-behov: ${siScores.SI2}/5
- Upskilling-behov: ${siScores.SI3}/5
- Nya arbetssätt: ${siScores.SI4}/5

Fritext – förändringsdrivkrafter: "${freetext.af4 || 'ej angivet'}"
Fritext – konkreta friktionspunkter: "${freetext.pf5 || 'ej angivet'}"
Fritext – kritiska förmågor 12–24 mån: "${freetext.tr4 || 'ej angivet'}"

Returnera JSON med exakt denna struktur:
{
  "summary": "2-3 meningar specifik strategisk analys för just detta företag",
  "recommendations": [
    {
      "title": "Titel på insats",
      "body": "Konkret beskrivning med koppling till företagets svar",
      "priority": "high"
    }
  ],
  "chiefBriefing": "1 mening anpassad för VD/styrelse",
  "escoTerms": ["term1", "term2", "term3"]
}

Regler:
- summary ska referera till specifika svar, inte vara generisk
- recommendations: exakt 3 st, priority: high/medium/low
- escoTerms: 3-5 svenska kompetensbegrepp för ESCO-matchning
- chiefBriefing: max 25 ord, affärsfokuserat
`;

  try {
    const genAI = new GoogleGenerativeAI(
      process.env.GEMINI_API_KEY as string
    );
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 800,
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Gemini error:", err);
    return new Response(
      JSON.stringify({ error: "Analys misslyckades" }),
      { status: 500 }
    );
  }
}