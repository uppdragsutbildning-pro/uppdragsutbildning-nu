// Sidorna i PDF-rapporten. Varje funktion ritar en eller flera sidor med hjälp av Kit.
// Innehållet kommer från rapportens ögonblicksbild (svar, poäng, AI-texter) och från regelbiblioteken.

import {
  BANDS, DIMS, DIM_KEYS, SI_LABELS, TOTAL_BAND_TEXT, ZONES, bandFor, computeFindings, recommendedStart,
  selectInitiatives, siToPct, zoneFor, type Analysis, type DimKey, type Finding, type Initiative,
} from '../kompetensindexReport';
import { ADVISORY_BOOKING_URL, ADVISORY_LABEL } from '../advisory';
import { ANSWER_LABEL, DIM_ACTIONS, DIM_QUESTIONS, SI_QUESTIONS, effectOnScore } from '../skiQuestions';
import type { MatchedCourse } from '../reportCourseMatching';
import type { CPIResult } from '../../app/components/pages/KompetensindexPage';
import { CONTENT_W, COLOR, Kit, PAGE, bandBg, bandBorder, bandColor, hex, type RGB } from './kit';

export interface PdfInput {
  result: CPIResult;
  analysis: Analysis;
  courseMap: Map<number, MatchedCourse[]>;
  origin: string;
  via: string | null;
  showAdvisory: boolean;
  createdAt: Date;
  // Partnermarknadsplatsens namn (vitmärkning). Null = Uppdragsutbildning.nu.
  brandName: string | null;
}

const X = PAGE.mx;
const dateStr = (d: Date) => d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
const dimAbbr = (k: DimKey) => DIMS[k].abbr;

// ── 1. Omslag ───────────────────────────────────────────────────────────

export function coverPage(k: Kit, inp: PdfInput) {
  const { result } = inp;
  const doc = k.doc;
  k.fill(COLOR.accent);
  doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
  k.fill(COLOR.white);
  k.opacity(0.1, () => doc.circle(PAGE.w - 8, 8, 62, 'F'));
  k.opacity(0.06, () => doc.circle(PAGE.w - 30, 52, 38, 'F'));

  k.text((inp.brandName ?? 'Uppdragsutbildning.nu').toUpperCase(), X + 4, 30, { size: 9, bold: true, color: COLOR.white });
  k.text('STRATEGISKT KOMPETENSINDEX', X + 4, 74, { size: 9.5, bold: true, color: hex('#C9D6F5') });
  let y = 84;
  y += k.text('Strategisk kompetensanalys', X + 4, y, { size: 36, bold: true, color: COLOR.white, w: 140, lineHeight: 1.12 });
  y += 6;
  y += k.text(result.answers.companyName, X + 4, y, { size: 17, color: COLOR.white, w: 150 });
  y += 3;
  k.text(`Rapport från ${dateStr(inp.createdAt)}`, X + 4, y, { size: 10.5, color: hex('#C9D6F5') });

  const band = bandFor(result.scores.total);
  const cy = 200;
  k.card(X + 4, cy, 96, 52, { fill: COLOR.white, border: null, r: 5 });
  k.text('STRATEGISKT KOMPETENSINDEX', X + 10, cy + 7, { size: 7.5, color: COLOR.muted });
  k.text(String(result.scores.total), X + 10, cy + 14, { size: 34, bold: true, color: COLOR.fg });
  const nw = k.doc.getTextWidth(String(result.scores.total));
  k.text('/100', X + 12 + nw + 2, cy + 24.5, { size: 11, color: COLOR.muted });
  k.chip(`${band.label.toUpperCase()} KOMPETENSTRYCK`, X + 10, cy + 40, { bg: bandColor(band), color: COLOR.white, size: 7.5 });

  k.text(`${dateStr(inp.createdAt)}  ·  Konfidentiell`, X + 4, PAGE.h - 20, { size: 9, color: hex('#C9D6F5') });
  k.noFooter.add(1);
}

// ── 2. Ledningsöversikt ─────────────────────────────────────────────────

function measureFinding(k: Kit, f: Finding, w: number): number {
  return k.textHeight(k.wrap(f.title, w, 9, true).length, 9) + k.textHeight(k.wrap(f.text, w, 8.5).length, 8.5) + 3;
}

function findingColumn(k: Kit, title: string, items: Finding[], empty: string, x: number, y: number, w: number, color: RGB, bg: RGB): number {
  const innerW = w - 14;
  const bodyH = items.length
    ? items.reduce((s, f) => s + measureFinding(k, f, innerW), 0)
    : k.textHeight(k.wrap(empty, innerW, 8.5).length, 8.5);
  const h = bodyH + 16;
  k.card(x, y, w, h, { fill: bg, border: null, r: 4 });
  k.text(title, x + 6, y + 5, { size: 11, bold: true, color });
  let cy = y + 12;
  if (!items.length) k.text(empty, x + 6, cy, { size: 8.5, color: COLOR.muted, w: innerW });
  for (const f of items) {
    k.fill(color);
    k.doc.circle(x + 7, cy + 1.6, 0.9, 'F');
    cy += k.text(f.title, x + 10, cy, { size: 9, bold: true, w: innerW - 4 });
    cy += k.text(f.text, x + 10, cy, { size: 8.5, color: COLOR.muted, w: innerW - 4 }) + 3;
  }
  return h;
}

export function overviewPage(k: Kit, inp: PdfInput) {
  const { result, analysis } = inp;
  const { scores } = result;
  const band = bandFor(scores.total);
  const strongest = DIM_KEYS.reduce((a, b) => (scores[a] <= scores[b] ? a : b));
  const weakest = DIM_KEYS.reduce((a, b) => (scores[a] >= scores[b] ? a : b));

  k.newPage();
  let y = k.header('01 / Överblick', 'Ledningsöversikt', 'Det viktigaste på en sida, utformat för snabb genomläsning.');

  // Nyckelkort
  const facts: [string, string, RGB?][] = [
    ['INDEX', `${scores.total}/100`, bandColor(band)],
    ['NIVÅ', band.label, bandColor(band)],
    ['STARKAST', DIMS[strongest].label],
    ['PRIORITET', DIMS[weakest].label],
  ];
  const fw = (CONTENT_W - 3 * 4) / 4;
  facts.forEach(([label, value, color], i) => {
    const x = X + i * (fw + 4);
    k.card(x, y, fw, 21, { r: 3 });
    k.text(label, x + 4, y + 4, { size: 7, bold: true, color: COLOR.subtle });
    k.text(value, x + 4, y + 9.5, { size: 10, bold: true, color: color ?? COLOR.fg, w: fw - 8, lineHeight: 1.2 });
  });
  y += 21 + 5;

  // Mätare + bedömning
  const gh = 70;
  k.card(X, y, 66, gh, { r: 4 });
  k.gauge(X + 33, y + 38, 24, scores.total);
  k.chip(`${band.label.toUpperCase()} TRYCK`, X + 33 - 17, y + 42, { bg: bandBg(band), color: bandColor(band), border: bandBorder(band), size: 7 });
  k.text(TOTAL_BAND_TEXT[band.index], X + 5, y + 53, { size: 7.5, color: COLOR.muted, w: 56, lineHeight: 1.3 });

  const rx = X + 70;
  const rw = CONTENT_W - 70;
  k.card(rx, y, rw, gh, { r: 4 });
  k.text('ÖVERGRIPANDE BEDÖMNING', rx + 6, y + 5, { size: 7.5, bold: true, color: COLOR.accent });
  const ay = y + 11 + k.text(analysis.overallAssessment, rx + 6, y + 11, { size: 9.5, w: rw - 12 }) + 3;
  const half = (rw - 12 - 4) / 2;
  const boxH = y + gh - 5 - ay;
  k.card(rx + 6, ay, half, boxH, { fill: COLOR.redBg, border: null, r: 2.5 });
  k.text('VIKTIGASTE RISK', rx + 9, ay + 3, { size: 7, bold: true, color: COLOR.red });
  k.text(analysis.topRisk, rx + 9, ay + 7.5, { size: 7.8, w: half - 6, lineHeight: 1.28 });
  k.card(rx + 10 + half, ay, half, boxH, { fill: COLOR.accentDim, border: null, r: 2.5 });
  k.text('HÖGST PRIORITERADE ÅTGÄRD', rx + 13 + half, ay + 3, { size: 7, bold: true, color: COLOR.accent });
  k.text(analysis.topAction, rx + 13 + half, ay + 7.5, { size: 7.8, w: half - 6, lineHeight: 1.28 });
  y += gh + 5;

  // Styrkor och risker
  const { strengths, risks } = computeFindings(scores);
  const colW = (CONTENT_W - 5) / 2;
  const h1 = findingColumn(k, 'Styrkor', strengths, 'Ingen dimension ligger under 50 poäng.', X, y, colW, COLOR.green, COLOR.greenBg);
  const h2 = findingColumn(k, 'Risker', risks, 'Ingen dimension ligger på 50 poäng eller mer.', X + colW + 5, y, colW, COLOR.red, COLOR.redBg);
  y += Math.max(h1, h2) + 5;

  // Dimensioner som staplar
  k.card(X, y, CONTENT_W, 4 * 8 + 14, { r: 4 });
  k.text('Resultat per dimension', X + 6, y + 5, { size: 10, bold: true });
  DIM_KEYS.forEach((d, i) => {
    const ry = y + 13 + i * 8;
    const b = bandFor(scores[d]);
    k.text(`${dimAbbr(d)}  ${DIMS[d].label}`, X + 6, ry, { size: 8.5 });
    k.bar(X + 62, ry + 0.4, CONTENT_W - 62 - 22, scores[d], bandColor(b), 2.6);
    k.text(String(scores[d]), X + CONTENT_W - 6, ry, { size: 9, bold: true, color: bandColor(b), align: 'right' });
  });
}

// ── 3. Organisationen och så läser du rapporten ─────────────────────────

export function organisationPage(k: Kit, inp: PdfInput) {
  const { answers } = inp.result;
  k.newPage();
  let y = k.header('02 / Organisationsprofil', 'Om organisationen', 'Grunduppgifter och hur rapporten ska läsas.');

  const rows: [string, string][] = [
    ['FÖRETAG', answers.companyName],
    ['BRANSCH', answers.industry || '-'],
    ['ANTAL ANSTÄLLDA', answers.companySize || '-'],
    ['RESPONDENTENS ROLL', answers.userRole || '-'],
    ['DATUM', dateStr(inp.createdAt)],
  ];
  for (const [label, value] of rows) {
    k.card(X, y, CONTENT_W, 11, { fill: COLOR.bg, border: null, r: 3 });
    k.text(label, X + 5, y + 4.1, { size: 7.5, color: COLOR.muted });
    k.text(value, X + 60, y + 3.4, { size: 10.5, bold: true, w: CONTENT_W - 66 });
    y += 13;
  }
  y += 4;

  // Så läser du rapporten
  const boxH = 92;
  k.card(X, y, CONTENT_W, boxH, { fill: COLOR.accentDim, border: null, r: 4 });
  k.text('Så läser du rapporten', X + 6, y + 6, { size: 12, bold: true, color: COLOR.accent });
  let cy = y + 14;
  cy = k.para(
    'Resultatet bygger på självskattning i fyra dimensioner, med värden mellan 0 och 100. Högre poäng betyder alltid större behov eller större begränsning, så ett lågt värde är bra. Totalpoängen är medelvärdet av de fyra dimensionerna.',
    X + 6, cy, CONTENT_W - 12, { size: 9, color: COLOR.fg }
  ) + 3;
  const bw = (CONTENT_W - 12 - 3 * 3) / 4;
  BANDS.forEach((b, i) => {
    const bx = X + 6 + i * (bw + 3);
    k.card(bx, cy, bw, 22, { fill: bandBg(b), border: bandBorder(b), r: 2.5 });
    k.text(b.label, bx + 3, cy + 3, { size: 9, bold: true, color: bandColor(b) });
    k.text(`${b.range} p`, bx + 3, cy + 8, { size: 7.5, color: COLOR.muted });
    k.text(['Goda förutsättningar', 'Områden att stärka', 'Riktade insatser', 'Omedelbara insatser'][i], bx + 3, cy + 12, { size: 7.5, color: COLOR.muted, w: bw - 5, lineHeight: 1.25 });
  });
  cy += 27;
  for (const d of DIM_KEYS) {
    cy = k.para(`${dimAbbr(d)} ${DIMS[d].label}: ${DIMS[d].reading}`, X + 6, cy, CONTENT_W - 12, { size: 8, color: COLOR.muted, lineHeight: 1.3 }) + 1.2;
  }
  k.focusQuestion('Vilka återkommande teman i organisationens svar behöver ledningen ta ställning till?');
}

// ── 4. Organisationens röst ─────────────────────────────────────────────

export function voicePage(k: Kit, inp: PdfInput) {
  const { voice } = inp.analysis;
  k.newPage();
  let y = k.header('03 / Organisationens röst', 'Era egna ord', 'Svaren på de öppna frågorna och era val av insatser, sammanfattade. Underlaget är en respondents svar.');
  const cards = [
    { k: 'FÖRÄNDRINGSDRIVARE', q: 'Vad driver förändringen?', t: voice.drivers, c: COLOR.accent },
    { k: 'FRIKTION I VARDAGEN', q: 'Vad tar längre tid eller skjuts upp?', t: voice.friction, c: COLOR.red },
    { k: 'KRITISKA FÖRMÅGOR', q: 'Vad behöver stärkas de närmaste 12-24 månaderna?', t: voice.capabilities, c: COLOR.orange },
    { k: 'ÖNSKADE INSATSER', q: 'Hur vill ni utveckla kompetensen?', t: voice.wishes, c: COLOR.green },
  ];
  const w = (CONTENT_W - 5) / 2;
  cards.forEach((c, i) => {
    const x = X + (i % 2) * (w + 5);
    const cy = y + Math.floor(i / 2) * 62;
    k.accentCard(x, cy, w, 57, c.c);
    k.text(c.k, x + 6, cy + 5, { size: 7.5, bold: true, color: c.c });
    const qh = k.text(c.q, x + 6, cy + 10.5, { size: 10.5, bold: true, w: w - 12 });
    k.text(c.t, x + 6, cy + 11 + qh + 2, { size: 9, color: COLOR.muted, w: w - 12 });
  });
  y += 2 * 62 + 2;
  k.card(X, y, CONTENT_W, 24, { fill: COLOR.bg, border: null, r: 3 });
  k.text('Så läser du sidan', X + 6, y + 5, { size: 10, bold: true });
  k.para('Texterna är en sammanfattning av vad respondenten skrev, omformulerad för läsbarhet. Inga uppgifter har lagts till. De hjälper dig att tolka indexvärdena med verksamhetsnära exempel.', X + 6, y + 10.5, CONTENT_W - 12, { size: 8.5, color: COLOR.muted });
  k.focusQuestion('Vilka teman i era svar bekräftar, förklarar eller utmanar indexresultaten?');
}

// ── 5. Profil ───────────────────────────────────────────────────────────

export function profilePage(k: Kit, inp: PdfInput) {
  const { scores } = inp.result;
  k.newPage();
  let y = k.header('04 / Profil', 'Era fyra dimensioner', 'Varje dimension visas på skalan 0 till 100. Högre poäng betyder större behov eller större begränsning.');
  k.card(X, y, CONTENT_W, 78, { r: 4 });
  k.radar(PAGE.w / 2, y + 40, 29, DIM_KEYS.map((d) => scores[d]), DIM_KEYS.map((d) => `${dimAbbr(d)} ${DIMS[d].label}`));
  y += 78 + 5;
  const w = (CONTENT_W - 5) / 2;
  DIM_KEYS.forEach((d, i) => {
    const x = X + (i % 2) * (w + 5);
    const cy = y + Math.floor(i / 2) * 47;
    const b = bandFor(scores[d]);
    k.card(x, cy, w, 43, { r: 3 });
    k.chip(dimAbbr(d), x + 5, cy + 4, { bg: COLOR.accentDim, color: COLOR.accent, size: 7 });
    k.text(DIMS[d].label, x + 5, cy + 11, { size: 9.5, bold: true });
    k.text(String(scores[d]), x + w - 5, cy + 4, { size: 20, bold: true, color: bandColor(b), align: 'right' });
    k.chip(b.label, x + w - 5 - 17, cy + 14, { bg: bandBg(b), color: bandColor(b), border: bandBorder(b), size: 6.5 });
    k.scaleBar(x + 5, cy + 22, w - 10, scores[d], 2.2);
    k.text(DIMS[d].bandText[b.index], x + 5, cy + 27.5, { size: 7.8, color: COLOR.muted, w: w - 10, lineHeight: 1.28 });
  });
  k.focusQuestion(inp.analysis.focus.profile);
}

// ── 6–9. En sida per dimension ──────────────────────────────────────────

export function dimensionPage(k: Kit, inp: PdfInput, d: DimKey, index: number) {
  const { scores, answers } = inp.result;
  const meta = DIMS[d];
  const b = bandFor(scores[d]);
  const q = DIM_QUESTIONS[d];
  const a = answers as unknown as Record<string, any>;

  k.newPage();
  let y = k.header(`05.${index + 1} / Dimension ${meta.abbr}`, meta.label, meta.question);

  // Poängkort
  const topH = 40;
  k.card(X, y, CONTENT_W, topH, { r: 4 });
  k.text(String(scores[d]), X + 7, y + 6, { size: 30, bold: true, color: bandColor(b) });
  k.chip(b.label, X + 7, y + 22, { bg: bandBg(b), color: bandColor(b), border: bandBorder(b), size: 7 });
  k.scaleBar(X + 44, y + 8, CONTENT_W - 44 - 8, scores[d], 2.4);
  k.text('0', X + 44, y + 13, { size: 6.5, color: COLOR.subtle });
  k.text('100', X + CONTENT_W - 8, y + 13, { size: 6.5, color: COLOR.subtle, align: 'right' });
  const ty = y + 18;
  const th = k.text(meta.bandText[b.index], X + 44, ty, { size: 9.5, w: CONTENT_W - 44 - 8 });
  k.text(meta.reading, X + 44, ty + th + 1.5, { size: 7.8, color: COLOR.muted, w: CONTENT_W - 44 - 8, lineHeight: 1.28 });
  y += topH + 5;

  // Svarstabell
  k.text('ERA SVAR I DEN HÄR DIMENSIONEN', X, y, { size: 7.5, bold: true, color: COLOR.accent });
  y += 5;
  const qW = 104;
  for (const sq of q.scale) {
    const val = Number(a[sq.field]) || 0;
    const lines = k.wrap(sq.text, qW, 8.5);
    const rh = Math.max(9, k.textHeight(lines.length, 8.5) + 4);
    k.doc.setDrawColor(...COLOR.border);
    k.doc.setLineWidth(0.2);
    k.doc.line(X, y + rh, X + CONTENT_W, y + rh);
    k.text(sq.id, X, y + 2, { size: 8, bold: true, color: COLOR.accent });
    k.text(sq.text, X + 12, y + 2, { size: 8.5, w: qW });
    k.text(val ? `${val}/5  ${ANSWER_LABEL[val]}` : '-', X + 12 + qW + 4, y + 2, { size: 8.5, bold: true });
    const eff = effectOnScore(val, q.reversed);
    const effTxt = eff === 'raises' ? 'Höjer poängen' : eff === 'lowers' ? 'Sänker poängen' : 'Neutral';
    const effCol = eff === 'raises' ? COLOR.red : eff === 'lowers' ? COLOR.green : COLOR.muted;
    k.text(effTxt, X + CONTENT_W, y + 2, { size: 7.5, color: effCol, align: 'right' });
    y += rh;
  }
  if (q.reversed) {
    y += 1.5;
    y = k.para('Frågorna är positivt formulerade: ett högt svar betyder god förmåga och ger därför ett lågt behovsvärde (omvänd skala).', X, y, CONTENT_W, { size: 7.5, color: COLOR.muted }) ;
  }
  y += 4;

  // Fritext
  if (q.free) {
    const t = String(a[q.free.field] ?? '').trim();
    const lines = k.wrap(t || 'Inget angavs i enkäten.', CONTENT_W - 14, 9);
    const h = k.textHeight(lines.length, 9) + 14;
    k.accentCard(X, y, CONTENT_W, h, COLOR.accent);
    k.text(`${q.free.id}  ${q.free.text}`.toUpperCase().slice(0, 95), X + 6, y + 4, { size: 6.8, bold: true, color: COLOR.accent });
    k.text(t || 'Inget angavs i enkäten.', X + 6, y + 9.5, { size: 9, color: t ? COLOR.fg : COLOR.muted, w: CONTENT_W - 14 });
    y += h + 5;
  }

  // Åtgärder
  k.text('REKOMMENDERADE ÅTGÄRDER', X, y, { size: 7.5, bold: true, color: COLOR.accent });
  y += 5;
  DIM_ACTIONS[d].actions.forEach((act, i) => {
    k.circleNumber(i + 1, X + 3.2, y + 2.6, 3.2, COLOR.accent, COLOR.white, 8);
    y += Math.max(7, k.text(act, X + 10, y, { size: 9, w: CONTENT_W - 10 }) + 2.5);
  });
  k.focusQuestion(DIM_ACTIONS[d].focus);
}

// ── 10. Tryck mot kapacitet ─────────────────────────────────────────────

export function quadrantPage(k: Kit, inp: PdfInput) {
  const { scores } = inp.result;
  const zone = zoneFor(scores.AF, scores.OK);
  k.newPage();
  let y = k.header('06 / Förändringstryck', 'Tryck mot omställningskapacitet', 'Visar var genomförandeovisshet uppstår: hur snabbt arbetet förändras (AF) mot hur begränsad förmågan att ställa om är (OK).');

  const px = X + 18, pw = 140, ph = 100, py = y + 4;
  k.card(X, y - 2, CONTENT_W, ph + 24, { r: 4 });
  const zones: { id: keyof typeof ZONES; x: number; y: number; c: RGB; t: string }[] = [
    { id: 'vulnerable', x: px, y: py, c: COLOR.orange, t: 'Sårbar' },
    { id: 'critical', x: px + pw / 2, y: py, c: COLOR.red, t: 'Kritisk zon' },
    { id: 'stable', x: px, y: py + ph / 2, c: COLOR.green, t: 'Stabil' },
    { id: 'equipped', x: px + pw / 2, y: py + ph / 2, c: COLOR.yellow, t: 'Rustad' },
  ];
  zones.forEach((z) => {
    k.fill(z.c);
    k.opacity(zone.id === z.id ? 0.22 : 0.07, () => k.doc.rect(z.x, z.y, pw / 2, ph / 2, 'F'));
    k.text(z.t, z.x + 3, z.y + 3, { size: 8.5, bold: true, color: z.c });
  });
  k.stroke(COLOR.border);
  k.doc.setLineWidth(0.25);
  k.doc.rect(px, py, pw, ph, 'S');
  k.doc.line(px + pw / 2, py, px + pw / 2, py + ph);
  k.doc.line(px, py + ph / 2, px + pw, py + ph / 2);
  const mx = px + (scores.AF / 100) * pw;
  const my = py + ph - (scores.OK / 100) * ph;
  k.fill(COLOR.accent);
  k.stroke(COLOR.white);
  k.doc.setLineWidth(0.9);
  k.doc.circle(mx, my, 3, 'FD');
  k.text('Ni', mx + (scores.AF > 70 ? -6 : 5), my - 2, { size: 9, bold: true });
  k.text('Förändringstryck (AF): 0 till 100', px + pw / 2, py + ph + 4, { size: 8.5, color: COLOR.muted, align: 'center' });
  k.doc.setFont('helvetica', 'normal');
  k.doc.setFontSize(8.5);
  k.ink(COLOR.muted);
  k.doc.text('Begränsad omställning (OK): 0 till 100', px - 8, py + ph / 2 + 30, { angle: 90 });
  y += ph + 26;

  k.card(X, y, CONTENT_W, 28, { fill: zone.id === "critical" ? COLOR.redBg : COLOR.bg, border: null, r: 3 });
  const zc = ZONES[zone.id].color;
  k.text(`Er zon: ${zone.label}`, X + 6, y + 5, { size: 11, bold: true, color: hex(zc) });
  k.text(zone.text, X + 6, y + 11.5, { size: 9.2, color: COLOR.muted, w: CONTENT_W - 12 });
  k.focusQuestion(inp.analysis.focus.quadrant);
}

// ── 11. Risk- och möjlighetskarta ───────────────────────────────────────

type MapRow = { area: string; type: 'Risk' | 'Styrka' | 'Behov' | 'Möjlighet'; priority: 'Hög' | 'Medel' | 'Låg'; direction: string };

const SI_DIRECTION = [
  'Rikta rekrytering mot kritiska roller som inte kan utbildas fram.',
  'Bygg rollnära utvecklingsspår för befintlig personal.',
  'Prioritera riktad kompetensutveckling i berörda team.',
  'Kombinera lärande med processutveckling.',
];

function buildMapRows(inp: PdfInput): MapRow[] {
  const { scores, siScores } = inp.result;
  const prio = (s: number): MapRow['priority'] => (s >= 65 ? 'Hög' : s >= 40 ? 'Medel' : 'Låg');
  const rows: MapRow[] = DIM_KEYS.map((d) => {
    const s = scores[d];
    const need = s >= 50;
    return {
      area: `${dimAbbr(d)} ${DIMS[d].label}`,
      type: need ? (d === 'AF' ? 'Behov' : 'Risk') : 'Styrka',
      priority: prio(s),
      direction: need ? DIMS[d].direction : 'Behåll nuvarande nivå och följ upp regelbundet.',
    } as MapRow;
  });
  const si = [siScores.si1, siScores.si2, siScores.si3, siScores.si4]
    .map((v, i) => ({ i, pct: siToPct(v) }))
    .sort((a, b) => b.pct - a.pct)
    .filter((x) => x.pct >= 50)
    .slice(0, 2);
  for (const x of si) {
    rows.push({
      area: SI_LABELS[x.i],
      type: x.i === 1 || x.i === 2 ? 'Möjlighet' : 'Behov',
      priority: prio(x.pct),
      direction: SI_DIRECTION[x.i],
    });
  }
  return rows;
}

export function riskMapPage(k: Kit, inp: PdfInput) {
  k.newPage();
  let y = k.header('07 / Risk- och möjlighetskarta', 'Var behöver organisationen agera?', 'Kartan samlar de områden som bör förstärkas, säkras eller omsättas i handling.');
  const cols = { area: X + 3, type: X + 58, prio: X + 90, dir: X + 112 };
  k.fill(COLOR.accent);
  k.doc.roundedRect(X, y, CONTENT_W, 9, 2, 2, 'F');
  [['Område', cols.area], ['Typ', cols.type], ['Prioritet', cols.prio], ['Rekommenderad riktning', cols.dir]].forEach(([t, x]) =>
    k.text(String(t), Number(x), y + 2.8, { size: 8.5, bold: true, color: COLOR.white })
  );
  y += 11;
  const typeColor: Record<MapRow['type'], RGB> = { Risk: COLOR.red, Styrka: COLOR.green, Behov: COLOR.orange, Möjlighet: COLOR.accent };
  buildMapRows(inp).forEach((r, i) => {
    const dw = CONTENT_W - 112 - 3;
    const lines = k.wrap(r.direction, dw, 8.5);
    const aLines = k.wrap(r.area, 52, 9, true);
    const rh = Math.max(13, k.textHeight(Math.max(lines.length, aLines.length), 8.8) + 6);
    if (i % 2 === 0) { k.fill(COLOR.bg); k.doc.roundedRect(X, y, CONTENT_W, rh, 2, 2, 'F'); }
    k.text(r.area, cols.area, y + rh / 2 - k.textHeight(aLines.length, 9) / 2, { size: 9, bold: true, w: 52 });
    k.chip(r.type, cols.type, y + rh / 2 - 3, { bg: typeColor[r.type], color: COLOR.white, size: 7 });
    k.text(r.priority, cols.prio, y + rh / 2 - 1.6, { size: 9, bold: true });
    k.text(r.direction, cols.dir, y + rh / 2 - k.textHeight(lines.length, 8.5) / 2, { size: 8.5, w: dw });
    y += rh + 1.5;
  });
  k.focusQuestion('Vilka två områden behöver ledningen prioritera först för att minska risk och öka genomförandekraft?');
}

// ── 12. Fyra budskap ────────────────────────────────────────────────────

export function messagesPage(k: Kit, inp: PdfInput) {
  const { messages } = inp.analysis;
  k.newPage();
  const y = k.header('08 / Viktigaste insikterna', 'Fyra budskap att ta vidare', 'Styrka, svaghet, risk och möjlighet sammanfattar vad resultaten betyder.');
  const items = [
    { k: 'STYRKA', m: messages.strength, c: COLOR.green },
    { k: 'SVAGHET', m: messages.weakness, c: COLOR.orange },
    { k: 'RISK', m: messages.risk, c: COLOR.red },
    { k: 'MÖJLIGHET', m: messages.opportunity, c: COLOR.accent },
  ];
  const w = (CONTENT_W - 5) / 2;
  items.forEach((it, i) => {
    const x = X + (i % 2) * (w + 5);
    const cy = y + Math.floor(i / 2) * 66;
    k.accentCard(x, cy, w, 61, it.c);
    k.text(it.k, x + 6, cy + 5, { size: 7.5, bold: true, color: it.c });
    const th = k.text(it.m.title, x + 6, cy + 10.5, { size: 11.5, bold: true, w: w - 12, lineHeight: 1.22 });
    k.text(it.m.body, x + 6, cy + 12 + th + 1.5, { size: 9, color: COLOR.muted, w: w - 12 });
  });
  k.focusQuestion(inp.analysis.focus.messages);
}

// ── 13–14. Prioritering ─────────────────────────────────────────────────

function initiativeColor(i: Initiative): RGB {
  if (i.effect >= 50 && i.effort < 50) return COLOR.green;
  if (i.effect >= 50) return COLOR.orange;
  if (i.effort < 50) return COLOR.accent;
  return COLOR.red;
}

export function priorityPages(k: Kit, inp: PdfInput) {
  const items = selectInitiatives(inp.result);
  k.newPage();
  let y = k.header('09 / Prioritering', 'Effekt kontra genomförandeinsats', 'Insatserna är valda utifrån er profil och placerade efter förväntad effekt och hur mycket arbete de kräver.');

  const px = X + 6, pw = CONTENT_W - 12, ph = 84, py = y + 4;
  k.fill(COLOR.green);
  k.opacity(0.07, () => k.doc.rect(px, py, pw / 2, ph / 2, 'F'));
  k.stroke(COLOR.border);
  k.doc.setLineWidth(0.25);
  k.doc.rect(px, py, pw, ph, 'S');
  k.doc.line(px + pw / 2, py, px + pw / 2, py + ph);
  k.doc.line(px, py + ph / 2, px + pw, py + ph / 2);
  k.text('HÖG EFFEKT', px, py - 4.5, { size: 7.5, bold: true, color: COLOR.muted });
  k.text('LÅG INSATS', px, py + ph + 2, { size: 7.5, bold: true, color: COLOR.muted });
  k.text('HÖG INSATS', px + pw, py + ph + 2, { size: 7.5, bold: true, color: COLOR.muted, align: 'right' });
  k.text('Bra start', px + 2.5, py + 2.5, { size: 7.5, bold: true, color: COLOR.green });
  items.forEach((it, n) => {
    const cx = px + (it.effort / 100) * pw;
    const cy = py + ph - (it.effect / 100) * ph;
    k.circleNumber(n + 1, cx, cy, 3.6, initiativeColor(it), COLOR.white, 8.5);
  });
  y = py + ph + 9;

  const colW = (CONTENT_W - 6) / 2;
  items.forEach((it, n) => {
    const x = X + (n % 2) * (colW + 6);
    const cy = y + Math.floor(n / 2) * 24;
    k.circleNumber(n + 1, x + 3.4, cy + 3.4, 3.4, initiativeColor(it), COLOR.white, 8);
    k.text(it.label, x + 9, cy, { size: 9.5, bold: true, w: colW - 9 });
    k.text(it.why, x + 9, cy + 5, { size: 8, color: COLOR.muted, w: colW - 9, lineHeight: 1.28 });
  });
  k.focusQuestion(inp.analysis.focus.priority);

  // Sida 2: insatsbehov, val, rekommenderad start
  k.newPage();
  y = k.header('09 / Prioritering', 'Insatsbehov och val', 'Hur stort behov ni själva ser av olika insatser, och vilken typ av insats och upplägg ni valde.');
  const { siScores } = inp.result;
  const vals = [siScores.si1, siScores.si2, siScores.si3, siScores.si4];
  k.card(X, y, CONTENT_W, 50, { r: 4 });
  k.text('Insatsbehov ni själva ser (0-100)', X + 6, y + 5, { size: 10, bold: true });
  SI_LABELS.forEach((label, i) => {
    const ry = y + 13 + i * 8.5;
    const pct = siToPct(vals[i]);
    k.text(label, X + 6, ry, { size: 9 });
    k.bar(X + 60, ry + 0.6, CONTENT_W - 60 - 20, pct, bandColor(bandFor(pct)), 2.6);
    k.text(String(pct), X + CONTENT_W - 6, ry, { size: 9, bold: true, color: bandColor(bandFor(pct)), align: 'right' });
  });
  y += 55;

  const li1 = inp.result.answers.li1 ?? [];
  const li2 = inp.result.answers.li2 ?? [];
  const w = (CONTENT_W - 5) / 2;
  [['ÖNSKAD INSATSTYP', li1], ['ÖNSKAT UPPLÄGG', li2]].forEach(([title, list], i) => {
    const x = X + i * (w + 5);
    k.card(x, y, w, 30, { r: 3 });
    k.text(String(title), x + 5, y + 5, { size: 7.5, bold: true, color: COLOR.accent });
    const arr = list as string[];
    let cx = x + 5, cy = y + 11;
    if (!arr.length) k.text('Inget valt.', x + 5, cy, { size: 9, color: COLOR.muted });
    arr.forEach((label) => {
      k.doc.setFont('helvetica', 'bold');
      k.doc.setFontSize(7.5);
      const cw = k.doc.getTextWidth(label) + 5;
      if (cx + cw > x + w - 5) { cx = x + 5; cy += 7; }
      k.chip(label, cx, cy, { bg: COLOR.chip, color: COLOR.fg, size: 7.5 });
      cx += cw + 2;
    });
  });
  y += 36;

  const start = recommendedStart(items);
  [
    { t: 'Rekommenderad start', b: `${start.map((s) => s.label).join(', ')} ger hög effekt med rimlig insats och skapar förutsättningar för mer träffsäkra satsningar.`, c: COLOR.green },
    { t: 'Beslutsprincip', b: 'Börja med hög effekt och låg till måttlig insats. Starta större program först när målgrupp, behov och effektmått är tydliga.', c: COLOR.orange },
  ].forEach((c, i) => {
    const x = X + i * (w + 5);
    k.accentCard(x, y, w, 40, c.c);
    k.text(c.t, x + 6, y + 5, { size: 11, bold: true });
    k.text(c.b, x + 6, y + 12, { size: 9, color: COLOR.muted, w: w - 12 });
  });
  k.focusQuestion('Vilka initiativ ger tillräcklig effekt för att motivera genomförandeinsatsen?');
}

// ── 15–16. Rekommendationer ─────────────────────────────────────────────

const PRIORITY_LABEL = { high: 'Hög prioritet', medium: 'Medel', low: 'Låg' } as const;
const PRIORITY_COLOR = { high: COLOR.red, medium: COLOR.yellow, low: COLOR.green } as const;

export function recommendationPages(k: Kit, inp: PdfInput) {
  const { analysis, courseMap, origin, via, showAdvisory } = inp;
  k.newPage();
  k.header('10 / Rekommendationer', 'Vad vi rekommenderar', 'Under varje rekommendation visas utbildningar som matchar. Finns ingen färdig utbildning kan ni begära offert eller boka rådgivning.');
  const suffix = via ? `?via=${encodeURIComponent(via)}` : '';

  analysis.recommendations.forEach((rec, i) => {
    const courses = courseMap.get(i) ?? [];
    const w = CONTENT_W;
    const bodyLines = k.wrap(rec.body, w - 18, 9);
    const titleLines = k.wrap(rec.title, w - 18, 11, true);
    let h = k.textHeight(titleLines.length, 11) + k.textHeight(bodyLines.length, 9) + 14;
    h += 6;
    if (courses.length) {
      h += 6 + courses.length * (courses.some((c) => c.matchedTags.length) ? 14 : 10);
    } else {
      h += 12;
    }
    h += showAdvisory ? 8 : 0;
    k.ensure(h + 4);
    const y = k.y;
    k.card(X, y, w, h, { r: 3 });
    k.circleNumber(i + 1, X + 8, y + 8, 3.6, COLOR.accent, COLOR.white, 9);
    let cy = y + 4.5;
    cy += k.text(rec.title, X + 15, cy, { size: 11, bold: true, w: w - 18, lineHeight: 1.25 }) + 1;
    const pw = k.chip(PRIORITY_LABEL[rec.priority], X + 15, cy, { bg: hex('#FFFFFF'), color: PRIORITY_COLOR[rec.priority], border: PRIORITY_COLOR[rec.priority], size: 6.8 });
    k.chip(rec.dimension, X + 15 + pw + 2, cy, { bg: COLOR.accentDim, color: COLOR.accent, size: 6.8 });
    cy += 7;
    cy += k.text(rec.body, X + 15, cy, { size: 9, color: COLOR.muted, w: w - 18 }) + 3;
    k.stroke(COLOR.border);
    k.doc.setLineWidth(0.2);
    k.doc.line(X + 15, cy, X + w - 4, cy);
    cy += 3.5;

    if (courses.length) {
      k.text('REKOMMENDERAD UTBILDNING', X + 15, cy, { size: 6.8, bold: true, color: COLOR.subtle });
      cy += 5;
      courses.forEach((c) => {
        const url = `${origin}${c.slug ? `/kurs/${c.slug}` : `/training/${c.id}`}${suffix}`;
        k.text(c.title, X + 15, cy, { size: 9.5, bold: true, color: COLOR.accent, w: w - 20 });
        k.doc.link(X + 15, cy - 0.5, w - 20, 5, { url });
        k.text(c.providerName ?? '', X + 15, cy + 4.3, { size: 7.8, color: COLOR.muted });
        if (c.matchedTags.length) {
          let tx = X + 15;
          const ty = cy + 8;
          c.matchedTags.forEach((t) => {
            const label = `${t.title.length > 34 ? t.title.slice(0, 33) + '...' : t.title} ${t.source.toUpperCase()}`;
            tx += k.chip(label, tx, ty, { bg: COLOR.chip, color: COLOR.fg, size: 6.2 }) + 2;
          });
        }
        cy += c.matchedTags.length ? 14 : 10;
      });
    } else {
      cy += k.text('Ingen färdig utbildning matchar rekommendationen. Begär offert så tar vi fram förslag från lärosäten:', X + 15, cy, { size: 8.5, color: COLOR.muted, w: w - 20 });
      const url = `${origin}/efterfraga?q=${encodeURIComponent(rec.title.slice(0, 200))}${via ? `&via=${encodeURIComponent(via)}` : ''}`;
      k.text('Begär offert', X + 15, cy + 1, { size: 9, bold: true, color: COLOR.accent });
      k.doc.link(X + 15, cy, 28, 5, { url });
      cy += 6;
    }
    if (showAdvisory) {
      k.text(ADVISORY_LABEL, X + 15, cy + 1.5, { size: 8.5, bold: true, color: COLOR.accent });
      k.doc.link(X + 15, cy + 0.5, 70, 5, { url: ADVISORY_BOOKING_URL });
    }
    k.y = y + h + 4;
  });
}

// ── 17. Kompetensfokus ──────────────────────────────────────────────────

export function skillsPages(k: Kit, inp: PdfInput) {
  const { occupations, ssykSkills } = inp.result;
  k.newPage();
  k.header('11 / Kompetensfokus', 'Kompetenser kopplade till era yrkesroller', 'Enligt Arbetsförmedlingens yrkestaxonomi SSYK 2012. Kompetenserna används för att matcha rekommendationerna mot utbildningar.');

  const chips = (labels: string[], x0: number, w: number, y0: number): number => {
    let cx = x0, cy = y0;
    for (const label of labels) {
      k.doc.setFont('helvetica', 'bold');
      k.doc.setFontSize(7.3);
      const text = label.length > 48 ? label.slice(0, 47) + '...' : label;
      const cw = k.doc.getTextWidth(text) + 5;
      if (cx + cw > x0 + w) { cx = x0; cy += 7; }
      k.chip(text, cx, cy, { bg: COLOR.accentDim, color: COLOR.accent, size: 7.3 });
      cx += cw + 2;
    }
    return cy + 7;
  };

  if (!occupations.length && !ssykSkills.length) {
    k.card(X, k.y, CONTENT_W, 20, { r: 3 });
    k.text('Inga yrkesroller valdes i enkäten.', X + 6, k.y + 7, { size: 10, color: COLOR.muted });
    return;
  }
  const groups = occupations.length
    ? occupations.map((o) => ({ label: o.label, sub: o.ssykGroupLabel, skills: o.skills.map((s) => s.title) }))
    : [{ label: 'Valda kompetenser', sub: null as string | null, skills: ssykSkills.map((s) => s.title) }];

  for (const g of groups) {
    const shown = g.skills.slice(0, 30);
    const extra = g.skills.length - shown.length;
    const est = 22 + Math.ceil(shown.length / 3) * 7;
    k.ensure(Math.min(est, 80));
    const y = k.y;
    const endY = chips(shown, X + 6, CONTENT_W - 12, y + 14);
    const h = endY - y + 3 + (extra > 0 ? 5 : 0);
    k.card(X, y, CONTENT_W, h, { r: 3 });
    k.text(g.label, X + 6, y + 4.5, { size: 10.5, bold: true });
    if (g.sub) k.text(g.sub, X + 6, y + 9.5, { size: 7.8, color: COLOR.muted });
    chips(shown, X + 6, CONTENT_W - 12, y + 14);
    if (extra > 0) k.text(`och ${extra} fler kompetenser`, X + 6, endY - 1, { size: 7.5, color: COLOR.muted });
    k.y = y + h + 4;
  }
}

// ── 18. Handlingsplan ───────────────────────────────────────────────────

export function roadmapPage(k: Kit, inp: PdfInput) {
  k.newPage();
  const y = k.header('12 / Handlingsplan', 'Föreslagen väg framåt', 'En enkel 12-månadersplan från nuläge till effekt.');
  const steps = inp.analysis.roadmap;
  const gap = 46;
  k.fill(COLOR.border);
  k.doc.roundedRect(X + 5.2, y + 6, 1.4, gap * (steps.length - 1) + 4, 0.7, 0.7, 'F');
  steps.forEach((s, i) => {
    const cy = y + 4 + i * gap;
    k.circleNumber(i + 1, X + 5.9, cy + 6, 6, i < 2 ? COLOR.accent : COLOR.accentHover, COLOR.white, 11);
    k.text(s.period.toUpperCase(), X + 18, cy, { size: 8, bold: true, color: COLOR.accent });
    k.text(s.title, X + 18, cy + 5, { size: 15, bold: true });
    k.text(s.text, X + 18, cy + 14, { size: 10, color: COLOR.muted, w: CONTENT_W - 24 });
  });
}

// ── 19. Nästa steg ──────────────────────────────────────────────────────

export function nextStepsPage(k: Kit, inp: PdfInput) {
  k.newPage(COLOR.accent);
  k.fill(COLOR.white);
  k.opacity(0.08, () => k.doc.circle(PAGE.w - 6, PAGE.h - 10, 60, 'F'));
  k.text('REKOMMENDERAT NÄSTA STEG', X + 4, 32, { size: 9, bold: true, color: COLOR.white });
  let y = 44;
  y += k.text('Från analys till handling', X + 4, y, { size: 28, bold: true, color: COLOR.white, w: 150, lineHeight: 1.12 });
  y += 6;
  y += k.text('Ledning och HR håller ihop arbetet från gemensam tolkning till prioriterade initiativ, ansvar och uppföljning.', X + 4, y, { size: 12, color: hex('#DCE5FA'), w: 150 });
  y += 14;
  ['Gemensam genomgång med ledning och HR', 'Prioriteringsworkshop med val av 2-3 fokusområden', 'Utse ägare, målgrupper och effektmått', 'Planera pilot, kommunikation och uppföljning'].forEach((t, i) => {
    k.circleNumber(i + 1, X + 8, y + 4, 4.2, COLOR.white, COLOR.accent, 10);
    k.text(t, X + 18, y + 1.4, { size: 12, bold: true, color: COLOR.white, w: 140 });
    y += 17;
  });
  y += 6;

  const lines: [string, string][] = [
    ['Hitta utbildning', `${inp.origin}/catalog${inp.via ? `?via=${encodeURIComponent(inp.via)}` : ''}`],
    ['Begär offert på anpassad utbildning', `${inp.origin}/efterfraga${inp.via ? `?via=${encodeURIComponent(inp.via)}` : ''}`],
  ];
  if (inp.showAdvisory) lines.push([ADVISORY_LABEL, ADVISORY_BOOKING_URL]);
  const h = 18 + lines.length * 12;
  k.card(X + 4, y, CONTENT_W - 8, h, { fill: COLOR.white, border: null, r: 5 });
  k.text('Gå vidare', X + 11, y + 6, { size: 13, bold: true });
  lines.forEach(([label, url], i) => {
    const ly = y + 15 + i * 12;
    k.text(label, X + 11, ly, { size: 9.5, bold: true, color: COLOR.accent });
    k.doc.link(X + 11, ly - 0.5, 110, 5, { url });
    k.text(url.replace(/^https?:\/\//, ''), X + 11, ly + 4.4, { size: 7.8, color: COLOR.muted });
  });
  k.noFooter.add(k.pageCount);
}

// ── Bilaga A: svar ──────────────────────────────────────────────────────

export function appendixPages(k: Kit, inp: PdfInput) {
  const { answers } = inp.result;
  const a = answers as unknown as Record<string, any>;
  k.newPage();
  k.header('Bilaga A', 'Era svar', 'Skala: 1 = Inte alls, 5 = I mycket hög grad. OK och SR är positivt formulerade och räknas om med omvänd skala.');

  const row = (id: string, text: string, ans: string) => {
    const lines = k.wrap(text, 108, 8.3);
    const aLines = k.wrap(ans, 44, 8.3, true);
    const rh = Math.max(7.5, k.textHeight(Math.max(lines.length, aLines.length), 8.3) + 3.5);
    k.ensure(rh + 1);
    const y = k.y;
    k.doc.setDrawColor(...COLOR.border);
    k.doc.setLineWidth(0.15);
    k.doc.line(X, y + rh, X + CONTENT_W, y + rh);
    k.text(id, X, y + 1.5, { size: 7.8, bold: true, color: COLOR.accent });
    k.text(text, X + 12, y + 1.5, { size: 8.3, w: 108 });
    k.text(ans, X + 12 + 112, y + 1.5, { size: 8.3, bold: true, w: 44 });
    k.y = y + rh;
  };
  const section = (title: string) => {
    k.ensure(14);
    k.y += 3;
    k.text(title.toUpperCase(), X, k.y, { size: 8, bold: true, color: COLOR.accent });
    k.y += 5.5;
  };

  section('Info');
  row('-', 'Företag', answers.companyName || '-');
  row('-', 'Bransch (SNI)', answers.industry || '-');
  row('-', 'Antal medarbetare', answers.companySize || '-');
  row('-', 'Roll', answers.userRole || '-');

  for (const d of DIM_KEYS) {
    const q = DIM_QUESTIONS[d];
    section(`${DIMS[d].abbr} ${DIMS[d].label}`);
    for (const sq of q.scale) {
      const v = Number(a[sq.field]) || 0;
      row(sq.id, sq.text, v ? `${v}/5  ${ANSWER_LABEL[v]}` : '-');
    }
    if (q.free) row(q.free.id, q.free.text, String(a[q.free.field] ?? '').trim() || '-');
  }
  section('Strategisk insats (SI)');
  for (const sq of SI_QUESTIONS) {
    const v = Number(a[sq.field]) || 0;
    row(sq.id, sq.text, v ? `${v}/5  ${ANSWER_LABEL[v]}` : '-');
  }
  section('Lärande och insatser (LI)');
  row('LI1', 'Vilken typ av kompetensinsats tror ni skulle ge störst effekt?', (answers.li1 ?? []).join(', ') || '-');
  row('LI2', 'Vilket upplägg passar er verksamhet bäst?', (answers.li2 ?? []).join(', ') || '-');
  row('LI3', 'Vilka yrkesroller vill ni prioritera kompetensutveckling för?', (answers.li3 ?? []).map((o: any) => o.label).join(', ') || '-');
}

// ── Bilaga B: metod ─────────────────────────────────────────────────────

export function methodPage(k: Kit, inp: PdfInput) {
  k.newPage();
  let y = k.header('Bilaga B', 'Metod och om indexet');
  const blocks: [string, string][] = [
    ['Vad indexet mäter', 'Strategiskt kompetensindex är ett självskattningsverktyg som visar hur stort kompetenstrycket är i en organisation. Det bygger på fyra dimensioner: Arbetsförändring (AF), Kompetenspåverkan (KP), Omställningskapacitet (OK) och Strategisk riktning (SR). Därtill kommer insatsbehov (SI) och önskade insatser (LI), som inte räknas in i totalpoängen men styr rekommendationerna.'],
    ['Så räknas poängen', 'Varje fråga besvaras på skalan 1 till 5. För AF och KP räknas dimensionens poäng som (svar - 1) / 4 x 100. För OK och SR, som är positivt formulerade, räknas den omvänt: (5 - svar) / 4 x 100. Dimensionens värde är medelvärdet av dess frågor. Totalpoängen är medelvärdet av de fyra dimensionerna. Högre poäng betyder alltid större behov eller större begränsning.'],
    ['Nivåer', 'Poängen delas in i fyra nivåer: Lågt (0-24), Måttligt (25-49), Högt (50-74) och Kritiskt (75-100).'],
    ['Yrkesroller och kompetenser', 'Yrkesroller och tillhörande kompetenser hämtas ur Arbetsförmedlingens yrkestaxonomi (JobTech Taxonomy, SSYK 2012). Kurser kan även vara taggade med kompetenser ur EU:s taxonomi ESCO.'],
    ['Så används AI', 'Berättande texter i rapporten (bedömning, budskap, sammanfattning av era svar, rekommendationer och plan) är skrivna med stöd av AI utifrån era svar. Tolkningen av enskilda poäng, nivåer och zoner är regelbaserad och därför likadan för alla. AI ombeds att inte lägga till uppgifter som inte framgår av era svar, men texterna bör läsas som förslag och underlag för diskussion.'],
    ['Begränsningar', 'Resultatet bygger på en persons självskattning vid ett tillfälle och speglar den personens bild av organisationen. Det är ett underlag för samtal och prioritering, inte en objektiv mätning. Rapporten är inte juridisk rådgivning eller en rekommendation av enskilda leverantörer.'],
  ];
  for (const [title, body] of blocks) {
    const h = k.textHeight(k.wrap(body, CONTENT_W, 9).length, 9) + 9;
    k.ensure(h);
    y = k.y;
    k.text(title, X, y, { size: 10.5, bold: true });
    k.text(body, X, y + 5.5, { size: 9, color: COLOR.muted, w: CONTENT_W });
    k.y = y + h + 2;
  }
  k.text(`Rapporten skapades ${dateStr(inp.createdAt)}${inp.brandName ? ` via ${inp.brandName}` : ' via Uppdragsutbildning.nu'}.`, X, k.y + 2, { size: 8, color: COLOR.subtle });
}
