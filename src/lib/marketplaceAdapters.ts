export interface AdaptedCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
}

export type ProviderType = 'universitet' | 'högskola' | 'yrkeshögskola';

export interface AdaptedProvider {
  id: string;
  name: string;
  type: ProviderType;
  description: string;
  logo?: string;
}

export const providerTypeLabel: Record<ProviderType, string> = {
  universitet: 'Universitet',
  högskola: 'Högskola',
  yrkeshögskola: 'Yrkeshögskola',
};

export interface AdaptedCourseStart {
  id: string;
  startDate: string;
  applicationDeadline: string;
  credits: number;
  duration: string;
  format: 'online' | 'onsite' | 'hybrid';
  maxParticipants: number;
  availableSpots: number;
  price: number;
  admissionRequirements: string;
  language: string;
  location?: string;
  status: 'open' | 'few_spots' | 'full' | 'upcoming';
}

export interface AdaptedTraining {
  id: string;
  title: string;
  description: string;
  courseCode?: string;
  providerId: string;
  categoryId: string;
  format: 'online' | 'onsite' | 'hybrid';
  duration: string;
  credits: number;
  targetAudience: string;
  featured: boolean;
  views: number;
  leads: number;
  imageUrl: string;
  trainingType: 'custom' | 'scheduled' | 'both';
  isPopular?: boolean;
  learningOutcomes?: string[];
  curriculum?: { title: string; topics: string[] }[];
  instructor?: { name: string; title: string; bio: string };
  scheduledStarts?: AdaptedCourseStart[];
  contactPerson?: { name: string; title: string; email: string; phone: string; responseTime: string };
  faq?: { question: string; answer: string }[];
  escoSkills?: { title: string; uri: string }[];
  provider: AdaptedProvider;
  category: AdaptedCategory;
}

interface RawCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
}

interface RawProvider {
  id: string;
  name: string;
  type: ProviderType;
  description: string;
  logo_url?: string | null;
}

interface RawScheduledStart {
  id: string;
  start_date: string;
  application_deadline: string;
  max_participants: number;
  available_spots: number;
  price: number;
  admission_requirements?: string | null;
  language: string;
  location?: string | null;
  status: 'open' | 'few_spots' | 'full' | 'upcoming';
}

interface RawCurriculumModule {
  title: string;
  topics: string[];
  order_index: number;
}

interface RawFaqRow {
  question: string;
  answer: string;
  order_index: number;
}

interface RawTraining {
  id: string;
  title: string;
  description: string;
  course_code?: string | null;
  provider_id: string;
  category_id: string;
  format: 'online' | 'onsite' | 'hybrid';
  duration: string;
  credits: number;
  target_audience: string;
  featured: boolean;
  views: number;
  leads: number;
  image_url: string;
  training_type: 'custom' | 'scheduled' | 'both';
  is_popular?: boolean;
  learning_outcomes?: string[] | null;
  instructor_name?: string | null;
  instructor_title?: string | null;
  instructor_bio?: string | null;
  contact_person_name?: string | null;
  contact_person_title?: string | null;
  contact_person_email?: string | null;
  contact_person_phone?: string | null;
  contact_person_response_time?: string | null;
  esco_skills?: { title: string; uri: string }[] | null;
  providers: RawProvider;
  categories: RawCategory;
  scheduled_starts?: RawScheduledStart[];
  curriculum_modules?: RawCurriculumModule[];
  training_faq?: RawFaqRow[];
}

export function adaptCategory(row: RawCategory): AdaptedCategory {
  return { id: row.id, name: row.name, slug: row.slug, description: row.description };
}

export function adaptProvider(row: RawProvider): AdaptedProvider {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    logo: row.logo_url ?? undefined,
  };
}

export function adaptCourseStart(
  row: RawScheduledStart,
  parentTraining: { format: 'online' | 'onsite' | 'hybrid'; credits: number; duration: string }
): AdaptedCourseStart {
  return {
    id: row.id,
    startDate: row.start_date,
    applicationDeadline: row.application_deadline,
    credits: parentTraining.credits,
    duration: parentTraining.duration,
    format: parentTraining.format,
    maxParticipants: row.max_participants,
    availableSpots: row.available_spots,
    price: row.price,
    admissionRequirements: row.admission_requirements ?? '',
    language: row.language,
    location: row.location ?? undefined,
    status: row.status,
  };
}

export function adaptTraining(row: RawTraining): AdaptedTraining {
  const provider = adaptProvider(row.providers);
  const category = adaptCategory(row.categories);
  const parentInfo = { format: row.format, credits: row.credits, duration: row.duration };

  const curriculum = row.curriculum_modules?.length
    ? [...row.curriculum_modules].sort((a, b) => a.order_index - b.order_index).map((m) => ({ title: m.title, topics: m.topics }))
    : undefined;

  const faq = row.training_faq?.length
    ? [...row.training_faq].sort((a, b) => a.order_index - b.order_index).map((f) => ({ question: f.question, answer: f.answer }))
    : undefined;

  const scheduledStarts = row.scheduled_starts?.length
    ? row.scheduled_starts.map((s) => adaptCourseStart(s, parentInfo))
    : undefined;

  const instructor = row.instructor_name
    ? { name: row.instructor_name, title: row.instructor_title ?? '', bio: row.instructor_bio ?? '' }
    : undefined;

  const contactPerson = row.contact_person_name
    ? {
        name: row.contact_person_name,
        title: row.contact_person_title ?? '',
        email: row.contact_person_email ?? '',
        phone: row.contact_person_phone ?? '',
        responseTime: row.contact_person_response_time ?? '',
      }
    : undefined;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    courseCode: row.course_code ?? undefined,
    providerId: row.provider_id,
    categoryId: row.category_id,
    format: row.format,
    duration: row.duration,
    credits: row.credits,
    targetAudience: row.target_audience,
    featured: row.featured,
    views: row.views,
    leads: row.leads,
    imageUrl: row.image_url,
    trainingType: row.training_type,
    isPopular: row.is_popular ?? undefined,
    learningOutcomes: row.learning_outcomes ?? undefined,
    curriculum,
    instructor,
    scheduledStarts,
    contactPerson,
    faq,
    escoSkills: row.esco_skills ?? undefined,
    provider,
    category,
  };
}
