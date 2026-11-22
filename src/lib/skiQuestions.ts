// Frågorna i Strategiskt kompetensindex, samlade för rapporterna (PDF och bilaga).
// OBS: texterna speglar de som står i KompetensindexPage.tsx. Ändras en fråga där måste den ändras här också.

import type { DimKey } from './kompetensindexReport';

export interface ScaleQuestion { id: string; field: string; text: string }
export interface DimQuestions {
  key: DimKey;
  reversed: boolean; // OK och SR: högt svar = god förmåga, vilket ger låg poäng
  scale: ScaleQuestion[];
  free?: { id: string; field: string; text: string };
}

export const DIM_QUESTIONS: Record<DimKey, DimQuestions> = {
  AF: {
    key: 'AF', reversed: false,
    scale: [
      { id: 'AF1', field: 'af1', text: 'I vilken grad förändras arbetssätten i er verksamhet idag?' },
      { id: 'AF2', field: 'af2', text: 'I vilken grad förväntas roller och arbetsuppgifter förändras de kommande två åren?' },
      { id: 'AF3', field: 'af3', text: 'I vilken grad har arbetet blivit mer komplext det senaste året?' },
    ],
    free: { id: 'AF4', field: 'af4', text: 'Vilka områden driver störst förändring just nu?' },
  },
  LF: {
    key: 'LF', reversed: false,
    scale: [
      { id: 'KP1', field: 'pf1', text: 'I vilken grad påverkar kompetensbrist kvaliteten i arbetet?' },
      { id: 'KP2', field: 'pf2', text: 'I vilken grad påverkar kompetensbrist tempo eller produktivitet?' },
      { id: 'KP3', field: 'pf3', text: 'I vilken grad påverkar kompetensbrist leveransförmågan?' },
      { id: 'KP4', field: 'pf4', text: 'I vilken grad är verksamheten beroende av ett fåtal nyckelpersoner?' },
    ],
    free: { id: 'KP5', field: 'pf5', text: 'Vilka arbetsuppgifter undviks, skjuts upp eller tar längre tid på grund av kompetensbrist?' },
  },
  OK: {
    key: 'OK', reversed: true,
    scale: [
      { id: 'OK1', field: 'ok1', text: 'I vilken grad har organisationen tid och struktur för lärande i vardagen?' },
      { id: 'OK2', field: 'ok2', text: 'I vilken grad har organisationen förmåga att snabbt lära om och anpassa arbetssätt?' },
      { id: 'OK3', field: 'ok3', text: 'I vilken grad upplever ni att organisationen är trygg i förändring?' },
      { id: 'OK4', field: 'ok4', text: 'I vilken grad utvecklas arbetssätt över team- eller avdelningsgränser?' },
    ],
  },
  TR: {
    key: 'TR', reversed: true,
    scale: [
      { id: 'SR1', field: 'tr1', text: 'I vilken grad är det tydligt vilka förmågor organisationen behöver utveckla framåt?' },
      { id: 'SR2', field: 'tr2', text: 'I vilken grad är framtida kompetensbehov kopplade till affärs- eller verksamhetsmål?' },
      { id: 'SR3', field: 'tr3', text: 'I vilken grad finns en tydlig plan för om kompetens ska rekryteras, kompetensväxlas eller utvecklas internt?' },
    ],
    free: { id: 'SR4', field: 'tr4', text: 'Vilka kompetenser bedömer ni som mest kritiska de kommande 12–24 månaderna?' },
  },
};

export const SI_QUESTIONS: ScaleQuestion[] = [
  { id: 'SI1', field: 'si1', text: 'I vilken grad ser ni behov av rekrytering av ny kompetens?' },
  { id: 'SI2', field: 'si2', text: 'I vilken grad ser ni behov av kompetensväxling för befintliga medarbetare?' },
  { id: 'SI3', field: 'si3', text: 'I vilken grad ser ni behov av kompetensutveckling för befintliga medarbetare?' },
  { id: 'SI4', field: 'si4', text: 'I vilken grad ser ni behov av nya arbetssätt eller processförändringar?' },
];

export const ANSWER_LABEL: Record<number, string> = {
  1: 'Inte alls', 2: 'I låg grad', 3: 'I viss grad', 4: 'I hög grad', 5: 'I mycket hög grad',
};

// Hur ett svar påverkar dimensionens poäng (behov/begränsning).
export function effectOnScore(answer: number, reversed: boolean): 'raises' | 'lowers' | 'neutral' {
  if (!answer) return 'neutral';
  const high = reversed ? answer <= 2 : answer >= 4;
  const low = reversed ? answer >= 4 : answer <= 2;
  return high ? 'raises' : low ? 'lowers' : 'neutral';
}

// Åtgärder och fokusfråga per dimension, sorterade från mest till minst brådskande.
export const DIM_ACTIONS: Record<DimKey, { actions: [string, string, string]; focus: string }> = {
  AF: {
    actions: [
      'Kartlägg vilka roller och arbetsmoment som förändras mest de kommande två åren.',
      'Inled förändringsledning och digital kompetens för de team som berörs först.',
      'Skapa en återkommande dialog mellan chefer och medarbetare om vad som förändras och vilken kompetens det kräver.',
    ],
    focus: 'Vilka roller förändras mest, och vad behöver de kunna om tolv månader?',
  },
  LF: {
    actions: [
      'Identifiera de arbetsuppgifter som stannar upp eller tar längre tid på grund av kompetensbrist.',
      'Sätt in korta, riktade insatser (kurser eller workshops) i de mest kritiska processerna.',
      'Minska beroendet av nyckelpersoner genom att dokumentera, dela kunskap och träna fler.',
    ],
    focus: 'Vilka tre arbetsmoment skulle gå märkbart bättre med rätt kompetens, och vem äger dem?',
  },
  OK: {
    actions: [
      'Skapa tid och struktur för lärande i vardagen, till exempel fasta lärpass och lärcirklar.',
      'Stärk chefernas roll i att möjliggöra lärande och följa upp det.',
      'Bygg mentorskap och kunskapsdelning över team- och avdelningsgränser.',
    ],
    focus: 'Hur frigör vi tid för lärande utan att öka belastningen i det löpande arbetet?',
  },
  TR: {
    actions: [
      'Ta fram en kompetensförsörjningsplan på 1–3 år som kopplar lärande till verksamhetsmålen.',
      'Prioritera 2–3 förmågor och bestäm vad som ska rekryteras, växlas eller utvecklas internt.',
      'Utse ansvarig och följ upp planen minst två gånger per år.',
    ],
    focus: 'Vilka två förmågor är viktigast för verksamhetsmålen, och vem ansvarar för planen?',
  },
};
