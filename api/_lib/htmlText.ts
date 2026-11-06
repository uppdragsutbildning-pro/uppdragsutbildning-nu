// Plockar ut läsbar text och strukturerad data (JSON-LD) ur en HTML-sida, utan externt beroende.
// Avsikten är inte en perfekt rendering utan tillräckligt rent underlag för AI-extraktion.

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aring: 'å', Aring: 'Å', auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö',
  eacute: 'é', Eacute: 'É', egrave: 'è', uuml: 'ü', Uuml: 'Ü',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  copy: '©', euro: '€', times: '×',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? m;
  });
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() : null;
}

export interface PageText {
  title: string | null;
  description: string | null;
  structuredData: string;
  text: string;
}

const MAX_TEXT = 40000;
const MAX_STRUCTURED = 8000;

export function extractPageText(html: string): PageText {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim() || metaContent(html, 'og:title');
  const description = metaContent(html, 'og:description') ?? metaContent(html, 'description');

  // JSON-LD (schema.org/Course m.fl.) innehåller ofta just det vi söker i ren form.
  const blocks: string[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].trim();
    if (raw) blocks.push(raw);
  }
  const structuredData = blocks.join('\n').slice(0, MAX_STRUCTURED);

  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|nav|footer|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<head\b[\s\S]*?<\/head>/i, ' ');

  body = body
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|section|article|ul|ol|table|h[1-6]|header|main|aside|blockquote|dd|dt)>/gi, '\n')
    .replace(/<(br|tr|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');

  const lines = decodeEntities(body)
    .replace(/[­​-‍⁠﻿]/g, '') // mjuka tryckstreck och osynliga tecken
    .split('\n')
    .map(l => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(l => l.length > 0);

  // Ta bort direkta dubbletter av rader (menyer och upprepade rubriker).
  const deduped: string[] = [];
  for (const line of lines) if (deduped[deduped.length - 1] !== line) deduped.push(line);

  return { title: title || null, description, structuredData, text: deduped.join('\n').slice(0, MAX_TEXT) };
}
