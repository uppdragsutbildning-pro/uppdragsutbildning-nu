import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { storagePath } = req.body;
  if (!storagePath) {
    return res.status(400).json({ error: 'storagePath saknas' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase service-role-konfiguration saknas' });
  }
  if (!geminiApiKey) {
    return res.status(500).json({ error: 'API key missing' });
  }

  // Service-role används bara för att läsa filen från Storage — trainings
  // skrivs alltid av klienten under RLS, aldrig härifrån.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from('course-brochures')
    .download(storagePath);

  if (downloadError || !fileData) {
    return res.status(400).json({ error: 'Kunde inte hämta filen', details: downloadError?.message });
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  const prompt = `Du är en assistent som extraherar strukturerad kursinformation från utbildningsbroschyrer på svenska.
Läs igenom PDF-dokumentet och identifiera VARJE kurs/utbildning som beskrivs.

Svara ENBART med en JSON-array (ingen markdown, inga förklaringar utanför JSON), en post per kurs:
[
  {
    "title": "Kursens titel",
    "description": "2-4 meningar kursbeskrivning",
    "courseCode": "Kurskod om det finns, annars null",
    "category": "Bäst matchande kategori, t.ex. Ledarskap, Digital Transformation, Hållbarhet, Hälsa & Vård, HR & Personal, Industri & Tillverkning, AI & Teknik, Offentlig Sektor",
    "format": "online, onsite eller hybrid",
    "duration": "Fritext, t.ex. '6 veckor'",
    "credits": <högskolepoäng som tal>,
    "targetAudience": "Vem kursen riktar sig till",
    "trainingType": "custom, scheduled eller both",
    "learningOutcomes": ["lärandemål 1", "lärandemål 2"],
    "instructorName": "Lärarens namn om det anges, annars null",
    "instructorTitle": "Lärarens titel om det anges, annars null",
    "instructorBio": "Kort lärarbeskrivning om det anges, annars null"
  }
]

Om broschyren bara beskriver EN kurs, returnera en array med ett element. Gissa inte fält som inte finns i dokumentet — sätt null istället.`;

  const controller = new AbortController();
  // 9s — nästan hela Vercel Hobby-planens 10s-tak. PDF-multimodal-analys tar
  // längre tid än den rena textanalysen i analyze-cpi.ts, så marginalen är
  // snävare här. Om detta fortfarande timar ut för större broschyrer krävs
  // en Vercel Pro-uppgradering (konfigurerbar maxDuration) för en riktig fix.
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'application/pdf', data: base64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4000,
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

    const courses = JSON.parse(text.trim());
    return res.status(200).json({ courses: Array.isArray(courses) ? courses : [courses] });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI-extraktionen tog för lång tid, försök igen' });
    }
    console.error('extract-course-from-pdf error:', err);
    return res.status(500).json({ error: 'Extraktion misslyckades', details: String(err) });
  }
}
