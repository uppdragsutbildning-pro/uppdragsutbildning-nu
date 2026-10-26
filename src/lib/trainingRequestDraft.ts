// Lokalt utkast för efterfrågeformuläret (/efterfraga). Köparen fyller i utan konto;
// utkastet ligger kvar i localStorage tills efterfrågan har skickats.

const STORAGE_KEY = 'ub.trainingRequestDraft.v1';

export type DeliveryFormat = 'on_site' | 'remote' | 'hybrid' | 'flexible';
export type RequestSource = 'search_no_results' | 'search_weak_results' | 'direct';

export interface RequestFormValues {
  title: string;
  description: string;
  learningGoals: string;
  targetGroup: string;
  participantCount: string;
  deliveryFormat: DeliveryFormat | '';
  location: string;
  desiredStart: string;
  budgetRange: string;
}

export interface SkillChip {
  id: string;
  label: string;
}

export interface TrainingRequestDraft {
  // Idempotensnyckel: samma värde ger samma efterfrågan även om submit körs två gånger.
  clientRequestId: string;
  source: RequestSource;
  searchQuery: string;
  // Identifierar sökkontexten utkastet startade i ("q|source"). Tom = öppnat utan sökning.
  contextKey: string;
  step: 1 | 2 | 3;
  form: RequestFormValues;
  skills: SkillChip[];
  // Satt när köparen tryckte Skicka utan inloggning: skickas automatiskt efter inloggning.
  pendingSubmit: boolean;
}

export const EMPTY_FORM: RequestFormValues = {
  title: '',
  description: '',
  learningGoals: '',
  targetGroup: '',
  participantCount: '',
  deliveryFormat: '',
  location: '',
  desiredStart: '',
  budgetRange: '',
};

export function newClientRequestId(): string {
  return crypto.randomUUID();
}

export function loadDraft(): TrainingRequestDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrainingRequestDraft;
    if (!parsed || typeof parsed.clientRequestId !== 'string' || !parsed.form) return null;
    return { ...parsed, form: { ...EMPTY_FORM, ...parsed.form }, skills: parsed.skills ?? [] };
  } catch {
    return null;
  }
}

export function saveDraft(draft: TrainingRequestDraft): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // localStorage kan vara blockerat (privat läge); formuläret fungerar ändå, utan utkast.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // se saveDraft
  }
}
