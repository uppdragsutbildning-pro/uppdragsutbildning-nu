// Utkast av offertförfrågan som överlever inloggningen (länken i mejlet öppnar sidan i en
// ny flik, så sessionStorage räcker inte). Rensas när förfrågan skickats eller efter 24 h.

const KEY = 'ub.requestDraft.v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface RequestDraft {
  trainingId: string | null;
  description: string;
  aiSummary: string;
  recommendedCategories: string[];
  suggestedFormat: string;
  formData: {
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
    budget: string;
    timeline: string;
  };
  savedAt: number;
}

export function saveRequestDraft(draft: Omit<RequestDraft, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // localStorage blockerat: utkastet överlever bara koden på samma sida, inte länken.
  }
}

export function loadRequestDraft(trainingId: string | null): RequestDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as RequestDraft;
    if (Date.now() - draft.savedAt > MAX_AGE_MS) return null;
    if (draft.trainingId !== trainingId) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearRequestDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // inget att rensa
  }
}
