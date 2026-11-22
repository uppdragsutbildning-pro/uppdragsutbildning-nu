import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';

// Föreslår kompetenstaggar (SSYK och ESCO) för en kurs.
// Gemini läser kursens text och returnerar kompetensfraser, inte ID:n. Varje fras slås sedan upp i
// Arbetsförmedlingens taxonomi, så att allt som returneras är verkliga begrepp. Inget sparas här.

const TAXONOMY = 'https://taxonomy.api.jobtechdev.se/v1/taxonomy/suggesters/autocomplete';
const MAX_PHRASES = 10;
const MAX_SUGGESTIONS = 24;

type Tag = { id: string; title: string; source: 'ssyk' | 'esco' };

async function lookup(phrase: string, type: 'skill' | 'esco-skill', limit: number): Promise<Tag[]> {
  const qs = new URLSearchParams({ 'query-string': phrase, type, limit: String(limit) });
  try {
    const res = await fetch(`${TAXONOMY}?${qs}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const concepts: Record<string, string>[] = await res.json();
    return concepts.map((c) => ({
      id: c['taxonomy/id'],
      title: c['taxonomy/preferred-label'],
      source: type === 'skill' ? 'ssyk' : 'esco',
    }));
  } catch {
    return [];
  }
}

// Flerordsfraser ger ibland inga träffar i autocomplete; då provas det längsta ordet.
async function lookupPhrase(phrase: string): Promise<Tag[]> {
  let [ssyk, esco] = await Promise.all([lookup(phrase, 'skill', 3), lookup(phrase, 'esco-skill', 3)]);
  if (ssyk.length === 0 && esco.length === 0) {
    const longest = phrase.split(/\s+/).sort((a, b) => b.length - a.length)[0];
    if (longest && longest !== phrase && longest.length >= 5) {
      [ssyk, esco] = await Promise.all([lookup(longest, 'skill', 2), lookup(longest, 'esco-skill', 2)]);
    }
  }
  return [...ssyk, ...esco];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) return res.status(500).json({ error: 'API key missing' });

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
    return res.status(403).json({ error: 'Endast leverantörer kan hämta förslag' });
  }

  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const title = clip(req.body?.title, 300);
  const description = clip(req.body?.description, 4000);
  const targetAudience = clip(req.body?.targetAudience, 1000);
  const outcomes = Array.isArray(req.body?.learningOutcomes)
    ? req.body.learningOutcomes.filter((o: unknown) => typeof o === 'string').slice(0, 15).map((o: string) => o.slice(0, 300))
    : [];
  if (!title && !description) return res.status(400).json({ error: 'Fyll i kursens titel och beskrivning först' });

  const prompt = `Du hjälper en utbildningsleverantör att tagga en kurs med kompetenser. Läs kursinformationen och lista de ${MAX_PHRASES} viktigaste kompetenserna som deltagarna utvecklar, som korta svenska fraser (1-3 ord) i den form de brukar stå i yrkes- och kompetenstaxonomier, till exempel "förändringsledning", "projektledning", "artificiell intelligens", "coachande ledarskap".

Undvik breda ord ensamma ("ledarskap", "digital") om en mer specifik kompetens passar. Hitta inte på kompetenser som inte framgår av texten.

Kurs: ${title}
Beskrivning: ${description}
Målgrupp: ${targetAudience}
Lärandemål: ${outcomes.join('; ')}

Svara ENBART med JSON: {"phrases": ["fras 1", "fras 2"]}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 600, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!geminiRes.ok) {
      console.error('suggest-course-skills Gemini error:', await geminiRes.text());
      return res.status(502).json({ error: 'AI-tjänsten svarade inte, försök igen' });
    }
    const data = await geminiRes.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = JSON.parse(text.trim());
    const phrases: string[] = Array.isArray(parsed?.phrases)
      ? [...new Set<string>(parsed.phrases.filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 1).map((p: string) => p.trim().slice(0, 60)))].slice(0, MAX_PHRASES)
      : [];

    const results = await Promise.all(phrases.map(lookupPhrase));
    const seen = new Set<string>();
    const suggestions: Tag[] = [];
    // Rundgång över fraserna så att varje fras får med sina bästa träffar före någons tredje.
    for (let rank = 0; rank < 6 && suggestions.length < MAX_SUGGESTIONS; rank++) {
      for (const list of results) {
        const t = list[rank];
        if (t && !seen.has(t.id)) {
          seen.add(t.id);
          suggestions.push(t);
        }
      }
    }
    return res.status(200).json({ suggestions: suggestions.slice(0, MAX_SUGGESTIONS) });
  } catch (err) {
    console.error('suggest-course-skills error:', err);
    return res.status(500).json({ error: 'Kunde inte hämta förslag' });
  }
}
