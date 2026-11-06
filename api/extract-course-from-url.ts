import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { buildWebpageExtractionPrompt } from './_lib/courseExtraction.js';
import { FetchPageError, UnsafeUrlError, fetchPage } from './_lib/safeFetch.js';
import { extractPageText } from './_lib/htmlText.js';

// Importera kursinformation från en länk: hämtar sidan (SSRF-säkert), plockar ut texten och låter
// Gemini föreslå kurser. Resultatet sparas aldrig här: klienten visar det i förhandsgranskningen där
// leverantören granskar och väljer vad som importeras som utkast.

const MIN_TEXT_CHARS = 300;
const MAX_COURSES = 50;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return res.status(500).json({ error: 'API key missing' });
  }

  // Bara inloggade, aktiva leverantörer och administratörer.
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Inte inloggad' });
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: 'Inte inloggad' });
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .single();
  if (!profile || !['provider', 'admin'].includes(profile.role as string) || profile.is_active === false) {
    return res.status(403).json({ error: 'Endast leverantörer kan importera kurser' });
  }

  const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
  if (!rawUrl || rawUrl.length > 2000) {
    return res.status(400).json({ error: 'Ange en länk' });
  }

  let page;
  try {
    page = await fetchPage(rawUrl, { timeoutMs: 8000 });
  } catch (err) {
    if (err instanceof UnsafeUrlError) return res.status(400).json({ error: err.message });
    if (err instanceof FetchPageError) return res.status(err.status === 504 ? 504 : 422).json({ error: err.message });
    console.error('extract-course-from-url fetch error:', err);
    return res.status(502).json({ error: 'Kunde inte hämta sidan' });
  }

  const extracted = extractPageText(page.html);
  if (extracted.text.length < MIN_TEXT_CHARS && !extracted.structuredData) {
    return res.status(422).json({
      error:
        'Sidan innehåller nästan ingen text. Den kan kräva JavaScript för att visa sitt innehåll, vilket importen inte stöder. Prova en annan sida eller använd PDF- eller Excel-import.',
    });
  }

  const pageData = [
    `Källa: ${page.finalUrl}`,
    extracted.title ? `Sidtitel: ${extracted.title}` : '',
    extracted.description ? `Beskrivning: ${extracted.description}` : '',
    extracted.structuredData ? `\nSTRUKTURERAD DATA (JSON-LD):\n${extracted.structuredData}` : '',
    `\nSIDANS TEXT:\n${extracted.text}`,
  ]
    .filter(Boolean)
    .join('\n');

  const controller = new AbortController();
  // Funktionens maxDuration är 60 s (vercel.json). Hämtningen får högst ta ca 10 s, så Gemini får 45 s.
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildWebpageExtractionPrompt() }, { text: pageData }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4000, responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', errText);
      return res.status(500).json({ error: 'Gemini API error' });
    }

    const data = await geminiRes.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) throw new Error('Empty response from Gemini');

    const parsed = JSON.parse(text.trim());
    const courses = (Array.isArray(parsed) ? parsed : [parsed]).filter(c => c && typeof c === 'object').slice(0, MAX_COURSES);
    return res.status(200).json({ courses, sourceUrl: page.finalUrl });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI-extraktionen tog för lång tid, försök igen' });
    }
    console.error('extract-course-from-url error:', err);
    return res.status(500).json({ error: 'Extraktion misslyckades' });
  }
}
