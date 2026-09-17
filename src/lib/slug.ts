import { supabase } from './supabase';

const CHAR_MAP: Record<string, string> = {
  å: 'a', ä: 'a', ö: 'o', é: 'e', è: 'e', ü: 'u', à: 'a', ø: 'o',
};

export function slugify(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[åäöéèüàø]/g, (c) => CHAR_MAP[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'kurs';
}

// Anropas sekventiellt (en kurs i taget) vid skapande, så en tidigare
// genererad slug i samma batch (t.ex. Excel-import) redan finns i databasen
// när nästa slug slås upp - ingen separat batch-dedup behövs.
export async function generateUniqueTrainingSlug(title: string): Promise<string> {
  const base = slugify(title);
  const { data, error } = await supabase
    .from('trainings')
    .select('slug')
    .or(`slug.eq.${base},slug.like.${base}-%`);
  if (error) throw error;

  const existing = new Set((data ?? []).map((row) => row.slug));
  if (!existing.has(base)) return base;

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}
