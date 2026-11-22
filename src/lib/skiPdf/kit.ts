// Layouthjälp och diagram för PDF-rapporten. Allt ritas med jsPDF:s grundfunktioner (vektorer), utan bilder.
// Mått är i millimeter på A4 stående. Typsnittet är Helvetica, som täcker svenska tecken men inte pilar eller
// specialtecken: använd bara bokstäver, siffror och vanlig interpunktion i texter.

import type { jsPDF } from 'jspdf';
import { BANDS, bandFor, type Band } from '../kompetensindexReport';

export type RGB = [number, number, number];

export const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const COLOR = {
  accent: hex('#2655C4'),
  accentHover: hex('#1E44A8'),
  accentDim: hex('#EEF2FC'),
  bg: hex('#F7F5F1'),
  card: hex('#FFFFFF'),
  fg: hex('#1C1917'),
  muted: hex('#78716C'),
  subtle: hex('#A8A29E'),
  border: hex('#E7E3DC'),
  chip: hex('#EDEAE4'),
  white: hex('#FFFFFF'),
  green: hex('#15803D'),
  greenBg: hex('#F0FDF4'),
  red: hex('#B91C1C'),
  redBg: hex('#FEF2F2'),
  orange: hex('#C2410C'),
  yellow: hex('#A16207'),
};

export const bandColor = (b: Band): RGB => hex(b.color);
export const bandBg = (b: Band): RGB => hex(b.bg);
export const bandBorder = (b: Band): RGB => hex(b.border);

export const PAGE = { w: 210, h: 297, mx: 18, top: 24, bottom: 22 };
export const CONTENT_W = PAGE.w - PAGE.mx * 2;
const PT = 0.3528; // mm per punkt
const LH = 1.35;

export interface TextOpts {
  size?: number;
  bold?: boolean;
  color?: RGB;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
}

export class Kit {
  doc: jsPDF;
  y = PAGE.top;
  pageCount = 1;
  noFooter = new Set<number>();

  constructor(doc: jsPDF) {
    this.doc = doc;
  }

  // ── Grundläggande ─────────────────────────────────────────────────────

  fill(c: RGB) { this.doc.setFillColor(c[0], c[1], c[2]); }
  stroke(c: RGB) { this.doc.setDrawColor(c[0], c[1], c[2]); }
  ink(c: RGB) { this.doc.setTextColor(c[0], c[1], c[2]); }

  opacity(o: number, fn: () => void) {
    const d: any = this.doc;
    d.setGState(new d.GState({ opacity: o }));
    fn();
    d.setGState(new d.GState({ opacity: 1 }));
  }

  newPage(background?: RGB): void {
    this.doc.addPage();
    this.pageCount += 1;
    this.y = PAGE.top;
    if (background) {
      this.fill(background);
      this.doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
    }
  }

  // Börja ny sida om innehållet inte ryms.
  ensure(h: number): boolean {
    if (this.y + h > PAGE.h - PAGE.bottom - 4) {
      this.newPage();
      return true;
    }
    return false;
  }

  // ── Text ──────────────────────────────────────────────────────────────

  wrap(str: string, w: number, size: number, bold = false): string[] {
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    return this.doc.splitTextToSize(String(str ?? ''), w) as string[];
  }

  textHeight(lines: number, size: number, lh = LH): number {
    return lines * size * PT * lh;
  }

  // Skriver text med övre kant i y. Returnerar höjden. Radbryts om w anges.
  text(str: string, x: number, y: number, o: TextOpts & { w?: number } = {}): number {
    const size = o.size ?? 10;
    const lh = o.lineHeight ?? LH;
    const lines = o.w ? this.wrap(str, o.w, size, o.bold) : [String(str ?? '')];
    this.doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    this.ink(o.color ?? COLOR.fg);
    this.doc.text(lines, x, y, { baseline: 'top', align: o.align ?? 'left', lineHeightFactor: lh });
    return this.textHeight(lines.length, size, lh);
  }

  // Stycke med bredd w. Returnerar y efter stycket.
  para(str: string, x: number, y: number, w: number, o: TextOpts = {}): number {
    return y + this.text(str, x, y, { ...o, w });
  }

  // ── Former ────────────────────────────────────────────────────────────

  card(x: number, y: number, w: number, h: number, o: { fill?: RGB; border?: RGB | null; r?: number } = {}) {
    const style = o.border === null ? 'F' : 'FD';
    this.fill(o.fill ?? COLOR.card);
    this.stroke(o.border ?? COLOR.border);
    this.doc.setLineWidth(0.25);
    this.doc.roundedRect(x, y, w, h, o.r ?? 3, o.r ?? 3, style);
  }

  // Kort med färgad kant till vänster.
  accentCard(x: number, y: number, w: number, h: number, color: RGB) {
    this.card(x, y, w, h);
    this.fill(color);
    this.doc.roundedRect(x, y, 1.6, h, 0.8, 0.8, 'F');
    this.fill(color);
    this.doc.rect(x + 0.8, y, 0.8, h, 'F');
  }

  chip(label: string, x: number, y: number, o: { bg: RGB; color: RGB; size?: number; border?: RGB }): number {
    const size = o.size ?? 7.5;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(size);
    const tw = this.doc.getTextWidth(label);
    const w = tw + 5;
    const h = size * PT + 3.2;
    this.fill(o.bg);
    if (o.border) { this.stroke(o.border); this.doc.setLineWidth(0.25); }
    this.doc.roundedRect(x, y, w, h, h / 2, h / 2, o.border ? 'FD' : 'F');
    this.ink(o.color);
    this.doc.text(label, x + w / 2, y + h / 2, { baseline: 'middle', align: 'center' });
    return w;
  }

  circleNumber(n: number | string, cx: number, cy: number, r: number, bg: RGB, fg: RGB = COLOR.white, size = 9) {
    this.fill(bg);
    this.doc.circle(cx, cy, r, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(size);
    this.ink(fg);
    this.doc.text(String(n), cx, cy, { baseline: 'middle', align: 'center' });
  }

  // ── Sidstruktur ───────────────────────────────────────────────────────

  // Etikett, rubrik och ingress överst på en innehållssida. Returnerar y under.
  header(eyebrow: string, title: string, intro?: string): number {
    const x = PAGE.mx;
    let y = PAGE.top;
    y += this.text(eyebrow.toUpperCase(), x, y, { size: 8, bold: true, color: COLOR.accent });
    y += 2;
    y += this.text(title, x, y, { size: 22, bold: true, w: CONTENT_W, lineHeight: 1.15 });
    y += 3;
    if (intro) y = this.para(intro, x, y, CONTENT_W * 0.9, { size: 10.5, color: COLOR.muted }) + 3;
    this.y = y + 3;
    return this.y;
  }

  // Ledningens fokusfråga, ankrad längst ner på sidan.
  focusQuestion(q: string) {
    const w = CONTENT_W;
    const lines = this.wrap(q, w - 12, 11, true);
    const h = this.textHeight(lines.length, 11) + 14;
    const y = PAGE.h - PAGE.bottom - h - 2;
    this.card(PAGE.mx, y, w, h, { fill: COLOR.accentDim, border: null, r: 3 });
    this.text('LEDNINGENS FOKUSFRÅGA', PAGE.mx + 6, y + 5, { size: 7.5, bold: true, color: COLOR.accent });
    this.text(q, PAGE.mx + 6, y + 10, { size: 11, bold: true, w: w - 12 });
  }

  // ── Mätare och staplar ────────────────────────────────────────────────

  // Polygon (stängd) med fyllning, av absoluta punkter.
  polygon(points: [number, number][], style: 'F' | 'S' | 'FD') {
    if (points.length < 3) return;
    const rel: number[][] = [];
    for (let i = 1; i < points.length; i++) rel.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]);
    this.doc.lines(rel, points[0][0], points[0][1], [1, 1], style, true);
  }

  // Ring-sektor (för halvcirkelmätaren). Vinklar i grader: 180 = vänster, 0 = höger.
  sector(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number, color: RGB, alpha: number) {
    const pts: [number, number][] = [];
    const steps = Math.max(6, Math.ceil(Math.abs(a1 - a2) / 2));
    for (let i = 0; i <= steps; i++) {
      const a = ((a1 + ((a2 - a1) * i) / steps) * Math.PI) / 180;
      pts.push([cx + r2 * Math.cos(a), cy - r2 * Math.sin(a)]);
    }
    for (let i = steps; i >= 0; i--) {
      const a = ((a1 + ((a2 - a1) * i) / steps) * Math.PI) / 180;
      pts.push([cx + r1 * Math.cos(a), cy - r1 * Math.sin(a)]);
    }
    this.fill(color);
    this.opacity(alpha, () => this.polygon(pts, 'F'));
  }

  gauge(cx: number, cy: number, r: number, score: number) {
    const band = bandFor(score);
    const thick = r * 0.2;
    const gap = 1.2;
    for (const b of BANDS) {
      const a1 = 180 - (b.from / 100) * 180 - gap;
      const a2 = 180 - (Math.min(b.to - 1, 100) / 100) * 180 + gap;
      this.sector(cx, cy, r - thick, r, a1, a2, bandColor(b), b.index === band.index ? 1 : 0.28);
    }
    // markör
    const a = ((180 - (score / 100) * 180) * Math.PI) / 180;
    const mr = r - thick / 2;
    this.fill(COLOR.white);
    this.stroke(bandColor(band));
    this.doc.setLineWidth(1.1);
    this.doc.circle(cx + mr * Math.cos(a), cy - mr * Math.sin(a), thick * 0.42, 'FD');
    this.text(String(score), cx, cy - r * 0.46, { size: r * 1.25, bold: true, color: bandColor(band), align: 'center' });
    this.text('av 100', cx, cy - r * 0.08, { size: 9, color: COLOR.muted, align: 'center' });
  }

  // Skalstapel med markör (som webbens ScaleBar).
  scaleBar(x: number, y: number, w: number, score: number, h = 2.6) {
    const band = bandFor(score);
    const segW = w / 4;
    BANDS.forEach((b, i) => {
      this.fill(bandColor(b));
      this.opacity(b.index === band.index ? 0.9 : 0.25, () => {
        if (i === 0) this.doc.roundedRect(x, y, segW + 1, h, h / 2, h / 2, 'F');
        else if (i === 3) this.doc.roundedRect(x + segW * 3 - 1, y, segW + 1, h, h / 2, h / 2, 'F');
        else this.doc.rect(x + segW * i, y, segW, h, 'F');
      });
    });
    const mx = x + (Math.min(Math.max(score, 0), 100) / 100) * w;
    this.fill(COLOR.white);
    this.stroke(bandColor(band));
    this.doc.setLineWidth(0.9);
    this.doc.circle(mx, y + h / 2, h * 0.95, 'FD');
  }

  // Vågrät stapel 0–100.
  bar(x: number, y: number, w: number, value: number, color: RGB, h = 3) {
    this.fill(COLOR.chip);
    this.doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
    const bw = Math.max(h, (Math.min(Math.max(value, 0), 100) / 100) * w);
    this.fill(color);
    this.doc.roundedRect(x, y, bw, h, h / 2, h / 2, 'F');
  }

  // Radar med fyra axlar: topp, höger, botten, vänster.
  radar(cx: number, cy: number, r: number, values: number[], labels: string[]) {
    const ang = [90, 0, -90, 180].map((d) => (d * Math.PI) / 180);
    const pt = (i: number, v: number): [number, number] => [cx + (r * v / 100) * Math.cos(ang[i]), cy - (r * v / 100) * Math.sin(ang[i])];
    this.stroke(COLOR.border);
    this.doc.setLineWidth(0.25);
    for (const ring of [25, 50, 75, 100]) this.polygon([0, 1, 2, 3].map((i) => pt(i, ring)), 'S');
    for (let i = 0; i < 4; i++) {
      const p = pt(i, 100);
      this.doc.line(cx, cy, p[0], p[1]);
    }
    const data = values.map((v, i) => pt(i, v));
    this.fill(COLOR.accent);
    this.opacity(0.18, () => this.polygon(data, 'F'));
    this.stroke(COLOR.accent);
    this.doc.setLineWidth(0.8);
    this.polygon(data, 'S');
    data.forEach((p) => { this.fill(COLOR.accent); this.doc.circle(p[0], p[1], 1.1, 'F'); });
    // etiketter
    const off = 4.5;
    labels.forEach((l, i) => {
      const p = pt(i, 100);
      const align = i === 1 ? 'left' : i === 3 ? 'right' : 'center';
      const lx = i === 1 ? p[0] + off : i === 3 ? p[0] - off : p[0];
      const ly = i === 0 ? p[1] - off - 3 : i === 2 ? p[1] + off : p[1] - 1.5;
      this.text(l, lx, ly, { size: 8.5, color: COLOR.muted, align: align as any });
    });
    // skalnummer
    [50, 100].forEach((v) => this.text(String(v), cx + 1.2, cy - (r * v) / 100 - 3, { size: 6.5, color: COLOR.subtle }));
  }
}
