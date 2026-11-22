import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';

// Fördjupad text per dimension till PDF-rapporten i Strategiskt kompetensindex:
// tolkning, vad som ligger bakom, skräddarsydda åtgärder och vad man bör se upp med.
// Kräver inloggad användare (PDF och sparade rapporter kräver inloggning). Bolagsnamn och kontaktuppgifter
// skickas aldrig hit. Inget sparas här; klienten lägger resultatet i rapportens ögonblicksbild.

const DIMS = ['AF', 'KP', 'OK', 'SR'] as const;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 15;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) { hits.set(key, list); return true; }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 2000) hits.clear();
  return false;
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

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

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Inte inloggad' });
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: 'Inte inloggad' });
  if (rateLimited(userData.user.id)) return res.status(429).json({ error: 'För många förfrågningar, försök igen om en stund' });

  const dims = Array.isArray(req.body?.dimensions) ? req.body.dimensions.slice(0, 4) : [];
  if (dims.length === 0) return res.status(400).json({ error: 'Saknar underlag' });

  const block = dims.map((d: any) => {
    const qs = (Array.isArray(d.questions) ? d.questions : []).slice(0, 6)
      .map((q: any) => `  - ${clip(q.id, 8)} "${clip(q.text, 200)}": ${Number(q.answer) || '-'}/5`).join('\n');
    const free = d.free ? `  - Fritext ${clip(d.free.id, 8)} "${clip(d.free.text, 200)}": ${redact(clip(d.free.answer, 800)) || 'ingen'}` : '';
    return `${clip(d.abbr, 4)} ${clip(d.label, 60)}: poäng ${Math.round(Number(d.score) || 0)}/100 (${clip(d.band, 12)})${d.reversed ? ' [OMVÄND SKALA: höga svar = god förmåga = lågt poängvärde]' : ''}\n${qs}\n${free}`;
  }).join('\n\n');

  const prompt = `Du är en svensk HR-strateg och kompetensutvecklingsexpert. Skriv fördjupande text till en rapport till ledningen, en sida per dimension i Strategiskt kompetensindex. Skriv på svenska, sakligt och konkret, i "ni"-form, utan utropstecken. Hitta inte på fakta som inte framgår av svaren.

Alla poäng är 0-100 där HÖGRE POÄNG = STÖRRE BEHOV ELLER STÖRRE BEGRÄNSNING. Nivåer: 0-24 Lågt, 25-49 Måttligt, 50-74 Högt, 75-100 Kritiskt. Bransch: ${clip(req.body?.industry, 120) || 'okänd'}. Storlek: ${clip(req.body?.companySize, 40) || 'okänd'} medarbetare.

Respondentens svar per dimension (skala 1-5):
${block}

För varje dimension, skriv:
- "interpretation": 3-4 meningar som tolkar poängen och svarsmönstret, med hänvisning till konkreta svar.
- "drivers": 2-3 korta punkter om vad i svaren som driver poängen (en mening vardera).
- "actions": exakt 3 konkreta, genomförbara åtgärder anpassade efter svaren (en till två meningar vardera).
- "watchOut": 1-2 meningar om vad man bör se upp med eller en vanlig fallgrop.

Svara ENBART med JSON på formen:
{"AF": {"interpretation": "", "drivers": [""], "actions": ["", "", ""], "watchOut": ""}, "KP": {...}, "OK": {...}, "SR": {...}}`;

  try {
    let parsed: any = null;
    for (const [maxOutputTokens, timeout] of [[5000, 25000], [8000, 15000]] as const) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens, responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(timeout),
        }
      ).catch((e) => { console.error('ski-deep-dive fetch error:', e?.name); return null; });
      if (!r || !r.ok) { if (r) console.error('ski-deep-dive Gemini error:', await r.text()); continue; }
      const data = await r.json();
      const out: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      try { parsed = JSON.parse(out.trim()); break; } catch {
        const m = out.match(/\{[\s\S]*\}/);
        try { if (m) { parsed = JSON.parse(m[0]); break; } } catch { /* nytt försök */ }
        console.error('ski-deep-dive parse error, finishReason=', data.candidates?.[0]?.finishReason);
      }
    }
    if (!parsed) return res.status(502).json({ error: 'Fick inget svar just nu' });

    const out: Record<string, unknown> = {};
    for (const k of DIMS) {
      const d = parsed?.[k];
      if (!d || typeof d.interpretation !== 'string') continue;
      const list = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 3).map((x) => x.trim().slice(0, 400)).slice(0, n) : []);
      out[k] = {
        interpretation: d.interpretation.trim().slice(0, 900),
        drivers: list(d.drivers, 3),
        actions: list(d.actions, 3),
        watchOut: typeof d.watchOut === 'string' ? d.watchOut.trim().slice(0, 400) : '',
      };
    }
    return res.status(200).json({ deepDive: out });
  } catch (err) {
    console.error('ski-deep-dive error:', err);
    return res.status(500).json({ error: 'Kunde inte skapa fördjupningen' });
  }
}
