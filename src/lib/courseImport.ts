export interface ParsedCourseRow {
  _id: string;
  title: string;
  description: string;
  courseCode: string;
  categoryName: string;
  categoryId: string | null;
  format: 'online' | 'onsite' | 'hybrid' | '';
  duration: string;
  credits: number;
  targetAudience: string;
  trainingType: 'custom' | 'scheduled' | 'both' | '';
  learningOutcomes: string[];
  instructorName: string;
  instructorTitle: string;
  instructorBio: string;
  _errors: string[];
  _include: boolean;
}

export interface RawCourseInput {
  title?: string;
  description?: string;
  courseCode?: string;
  category?: string;
  format?: string;
  duration?: string;
  credits?: number | string;
  targetAudience?: string;
  trainingType?: string;
  learningOutcomes?: string[] | string;
  instructorName?: string;
  instructorTitle?: string;
  instructorBio?: string;
}

export interface SimpleCategory {
  id: string;
  name: string;
}

// Excel-mallens rubriker (svenska) → normaliserad form
export function fromExcelRow(row: Record<string, unknown>): RawCourseInput {
  const get = (key: string) => (row[key] != null ? String(row[key]) : '');
  return {
    title: get('Titel'),
    description: get('Beskrivning'),
    courseCode: get('Kurskod'),
    category: get('Kategori'),
    format: get('Format'),
    duration: get('Längd'),
    credits: get('Poäng (hp)'),
    targetAudience: get('Målgrupp'),
    trainingType: get('Typ'),
    learningOutcomes: get('Lärandemål')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    instructorName: get('Lärare namn'),
    instructorTitle: get('Lärare titel'),
    instructorBio: get('Lärare bio'),
  };
}

// AI-extraherat JSON (engelska nycklar, satta av prompten i api/extract-course-from-pdf.ts) → normaliserad form
export function fromExtractedCourse(row: Record<string, unknown>): RawCourseInput {
  return {
    title: row.title as string | undefined,
    description: row.description as string | undefined,
    courseCode: row.courseCode as string | undefined,
    category: row.category as string | undefined,
    format: row.format as string | undefined,
    duration: row.duration as string | undefined,
    credits: row.credits as number | string | undefined,
    targetAudience: row.targetAudience as string | undefined,
    trainingType: row.trainingType as string | undefined,
    learningOutcomes: Array.isArray(row.learningOutcomes) ? (row.learningOutcomes as string[]) : [],
    instructorName: row.instructorName as string | undefined,
    instructorTitle: row.instructorTitle as string | undefined,
    instructorBio: row.instructorBio as string | undefined,
  };
}

function normalizeFormat(value?: string): 'online' | 'onsite' | 'hybrid' | '' {
  const v = (value || '').trim().toLowerCase();
  if (v === 'online') return 'online';
  if (v === 'onsite' || v === 'på plats') return 'onsite';
  if (v === 'hybrid') return 'hybrid';
  return '';
}

function normalizeTrainingType(value?: string): 'custom' | 'scheduled' | 'both' | '' {
  const v = (value || '').trim().toLowerCase();
  if (v === 'custom' || v === 'skräddarsydd') return 'custom';
  if (v === 'scheduled' || v === 'schemalagd') return 'scheduled';
  if (v === 'both' || v === 'både') return 'both';
  return '';
}

export function resolveCategory(name: string, categories: SimpleCategory[]): string | null {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return null;
  const match = categories.find((c) => c.name.trim().toLowerCase() === trimmed);
  return match ? match.id : null;
}

export function validateRow(row: Omit<ParsedCourseRow, '_errors' | '_include'>): string[] {
  const errors: string[] = [];
  if (!row.title) errors.push('Titel saknas');
  if (!row.description) errors.push('Beskrivning saknas');
  if (!row.format) errors.push('Ogiltigt format (online/onsite/hybrid)');
  if (!row.trainingType) errors.push('Ogiltig typ (custom/scheduled/both)');
  if (!row.categoryId) errors.push('Kategori kunde inte matchas');
  return errors;
}

let idCounter = 0;

export function buildParsedRow(raw: RawCourseInput, categories: SimpleCategory[]): ParsedCourseRow {
  const categoryName = (raw.category || '').trim();
  const base = {
    _id: `row-${++idCounter}`,
    title: (raw.title || '').trim(),
    description: (raw.description || '').trim(),
    courseCode: (raw.courseCode || '').trim(),
    categoryName,
    categoryId: resolveCategory(categoryName, categories),
    format: normalizeFormat(raw.format),
    duration: (raw.duration || '').trim(),
    credits: Number(raw.credits) || 0,
    targetAudience: (raw.targetAudience || '').trim(),
    trainingType: normalizeTrainingType(raw.trainingType),
    learningOutcomes: Array.isArray(raw.learningOutcomes)
      ? raw.learningOutcomes.map((s) => String(s).trim()).filter(Boolean)
      : [],
    instructorName: (raw.instructorName || '').trim(),
    instructorTitle: (raw.instructorTitle || '').trim(),
    instructorBio: (raw.instructorBio || '').trim(),
  };
  const errors = validateRow(base);
  return { ...base, _errors: errors, _include: errors.length === 0 };
}

export function revalidateRow(row: ParsedCourseRow): ParsedCourseRow {
  const errors = validateRow(row);
  return { ...row, _errors: errors };
}

export function toTrainingInsertPayload(row: ParsedCourseRow, providerId: string) {
  return {
    title: row.title,
    description: row.description,
    course_code: row.courseCode || null,
    provider_id: providerId,
    category_id: row.categoryId,
    format: row.format,
    duration: row.duration,
    credits: row.credits,
    target_audience: row.targetAudience,
    image_url: '',
    training_type: row.trainingType,
    is_popular: false,
    featured: false,
    learning_outcomes: row.learningOutcomes,
    instructor_name: row.instructorName || null,
    instructor_title: row.instructorTitle || null,
    instructor_bio: row.instructorBio || null,
    is_active: false,
  };
}
