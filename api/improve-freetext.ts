import type { VercelRequest, VercelResponse } from '@vercel/node';

// Formuleringshjälp för fritextfälten i Strategiskt kompetensindex (AF4, KP5, SR4).
// Anonyma användare (Quick Scan) kan anropa den, så inget känsligt får skickas vidare:
//  - klienten skickar inte bolagsnamn, kontaktuppgifter, bransch eller storlek
//  - servern maskerar e-postadresser, telefonnummer, personnummer och organisationsnummer i texten
//  - AI ombeds att inte ta med namn eller lägga till fakta
// Inget sparas här.

const FIELDS: Record<string, { question: string; purpose: string; examples: string }> = {
  af4: {
    question: 'Vilka områden driver störst förändring just nu?',
    purpose: 'de viktigaste drivkrafterna bakom förändringar i arbetet',
    examples: 'teknik och AI, regelverk, kundkrav, konkurrens, hållbarhet, demografi',
  },
  pf5: {
    question: 'Vilka arbetsuppgifter undviks, skjuts upp eller tar längre tid på grund av kompetensbrist?',
    purpose: 'konkreta arbetsuppgifter eller processer som påverkas av kompetensbrist',
    examples: 'offerter, rapportering, tekniska ärenden, onboarding, kvalitetskontroller',
  },
  tr4: {
    question: 'Vilka kompetenser bedömer ni som mest kritiska de kommande 12–24 månaderna?',
    purpose: 'de kompetenser organisationen behöver stärka närmaste 12–24 månaderna',
    examples: 'AI och dataanalys, ledarskap i förändring, digital kompetens, hållbarhetsrapportering',
  },
};

const LEVELS: Record<string, string> = { low: 'lågt', medium: 'måttligt', high: 'högt' };

// Enkel begränsning per IP. Minnet delas inte mellan serverinstanser, så det är ett grovt skydd mot
// missbruk, inte en exakt kvot.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function redact(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-post]')
    .replace(/\b\d{6,8}[-+]?\d{4}\b/g, '[nummer]')
    .replace(/(?:\+46|0046|0)[\s-]?\d(?:[\s-]?\d){6,10}/g, '[telefon]');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key missing' });

  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: 'För många förfrågningar, försök igen om en stund' });

  const field = typeof req.body?.field === 'string' ? req.body.field : '';
  const cfg = FIELDS[field];
  if (!cfg) return res.status(400).json({ error: 'Okänt fält' });

  const raw = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 1500) : '';
  const text = redact(raw);
  const level = LEVELS[req.body?.scaleLevel as string];
  const context = level ? `Respondenten har på skalfrågorna i samma avsnitt angett ${level} grad.` : '';

  const rules = `Regler:
- Skriv på svenska, i "vi"-form, sakligt och konkret.
- Lägg INTE till fakta, siffror, namn eller exempel som respondenten inte själv har nämnt.
- Ta inte med personnamn, företagsnamn eller kontaktuppgifter.
- Svara ENBART med JSON.`;

  const prompt = text
    ? `Du hjälper en HR-ansvarig att formulera ett svar på en enkätfråga. Skriv om respondentens text så att den blir tydlig och välformulerad, utan att ändra innebörden.

Fråga: ${cfg.question}
Respondentens text: """${text}"""
${context}

${rules}
- Behåll alla sakuppgifter. Strukturera och förtydliga. Högst 3 meningar, högst 450 tecken.

Svara med JSON: {"text": "den omskrivna texten"}`
    : `Du hjälper en HR-ansvarig att komma igång med ett svar på en enkätfråga. Föreslå fyra korta, olika formuleringar som respondenten kan klicka in och sedan redigera. De ska vara generella exempel på ${cfg.purpose} (till exempel ${cfg.examples}), inte påståenden om en specifik organisation.

Fråga: ${cfg.question}
${context}

${rules}
- Varje förslag är en enda kort mening, högst 120 tecken.

Svara med JSON: {"suggestions": ["förslag 1", "förslag 2", "förslag 3", "förslag 4"]}`;

  try {
    // Modellen "tänker" innan den svarar och de tokens räknas in i gränsen, så en låg gräns ger avkapade
    // JSON-svar. Gränsen är därför generös, och ett misslyckat försök provas en gång till.
    let parsed: any = null;
    let lastError = '';
    for (const maxOutputTokens of [3000, 6000]) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: text ? 0.3 : 0.6, maxOutputTokens, responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(12000),
        }
      );
      if (!geminiRes.ok) {
        lastError = await geminiRes.text();
        console.error('improve-freetext Gemini error:', lastError);
        continue;
      }
      const data = await geminiRes.json();
      const out: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      try {
        parsed = JSON.parse(out.trim());
        break;
      } catch {
        // Ta ut JSON-objektet om modellen la text runt det.
        const m = out.match(/\{[\s\S]*\}/);
        try {
          if (m) { parsed = JSON.parse(m[0]); break; }
        } catch {
          // faller igenom till nytt försök
        }
        lastError = `ogiltig JSON (finishReason=${data.candidates?.[0]?.finishReason})`;
        console.error('improve-freetext parse error:', lastError, out.slice(0, 120));
      }
    }
    if (!parsed) return res.status(502).json({ error: 'Fick inget förslag just nu, försök igen' });

    if (text) {
      const improved = typeof parsed?.text === 'string' ? redact(parsed.text.trim()).slice(0, 600) : '';
      if (!improved) return res.status(502).json({ error: 'Fick inget förslag, försök igen' });
      return res.status(200).json({ mode: 'improve', text: improved });
    }
    const suggestions: string[] = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 3).map((s: string) => s.trim().slice(0, 160)).slice(0, 4)
      : [];
    if (suggestions.length === 0) return res.status(502).json({ error: 'Fick inga förslag, försök igen' });
    return res.status(200).json({ mode: 'suggest', suggestions });
  } catch (err) {
    console.error('improve-freetext error:', err);
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return res.status(504).json({ error: 'Det tog för lång tid, försök igen' });
    }
    return res.status(500).json({ error: 'Kunde inte hämta förslag' });
  }
}
