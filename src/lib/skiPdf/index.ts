// PDF-rapport för Strategiskt kompetensindex. Skapas helt i webbläsaren (inget skickas till en server).
// jsPDF laddas först när PDF:en skapas, så att den inte tynger sidan.

import { DIM_KEYS } from '../kompetensindexReport';
import { COLOR, Kit, PAGE } from './kit';
import {
  appendixPages, coverPage, dimensionPage, messagesPage, methodPage, nextStepsPage, organisationPage, overviewPage,
  priorityPages, profilePage, quadrantPage, recommendationPages, riskMapPage, roadmapPage, skillsPages, voicePage,
  type PdfInput,
} from './pages';

export type { PdfInput } from './pages';

export async function generateSkiPdf(input: PdfInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const kit = new Kit(doc);

  doc.setProperties({
    title: `Strategisk kompetensanalys, ${input.result.answers.companyName}`,
    subject: 'Strategiskt kompetensindex',
    creator: input.brandName ?? 'Uppdragsutbildning.nu',
  });

  coverPage(kit, input);
  overviewPage(kit, input);
  organisationPage(kit, input);
  voicePage(kit, input);
  profilePage(kit, input);
  DIM_KEYS.forEach((d, i) => dimensionPage(kit, input, d, i));
  quadrantPage(kit, input);
  riskMapPage(kit, input);
  messagesPage(kit, input);
  priorityPages(kit, input);
  recommendationPages(kit, input);
  skillsPages(kit, input);
  roadmapPage(kit, input);
  nextStepsPage(kit, input);
  appendixPages(kit, input);
  methodPage(kit, input);

  // Sidfot med sidnummer på alla sidor utom omslag och avslutande sida.
  const total = doc.getNumberOfPages();
  const brand = input.brandName ?? 'Uppdragsutbildning.nu';
  for (let p = 1; p <= total; p++) {
    if (kit.noFooter.has(p)) continue;
    doc.setPage(p);
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.25);
    doc.line(PAGE.mx, PAGE.h - 15, PAGE.w - PAGE.mx, PAGE.h - 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR.muted);
    doc.text(`Strategiskt kompetensindex  ·  ${input.result.answers.companyName}  ·  ${brand}`, PAGE.mx, PAGE.h - 11, { baseline: 'top' });
    doc.text(String(p), PAGE.w - PAGE.mx, PAGE.h - 11, { baseline: 'top', align: 'right' });
  }

  return doc.output('blob');
}

export function pdfFileName(company: string, date: Date): string {
  const slug = company
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'rapport';
  return `kompetensanalys-${slug}-${date.toISOString().slice(0, 10)}.pdf`;
}
