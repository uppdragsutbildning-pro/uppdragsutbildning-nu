import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as zlib from 'node:zlib';
import type { Readable } from 'node:stream';

// Säker hämtning av en webbsida på en adress som användaren angett (SSRF-skydd).
//
//  * Bara http/https på port 80/443, ingen inloggningsinformation i adressen.
//  * Adressen slås upp av en egen lookup-funktion som nekar privata, loopback-, länklokala och
//    reserverade adresser. Anslutningen görs mot exakt den adress som godkändes, så en DNS-omkoppling
//    mellan kontroll och anslutning hjälper inte.
//  * Omdirigeringar följs manuellt (högst 3) och varje steg valideras på nytt.
//  * Tak på storlek (efter avkomprimering) och tid, och bara HTML eller ren text godtas.

export class UnsafeUrlError extends Error {}
export class FetchPageError extends Error {
  constructor(message: string, public status: number = 502) {
    super(message);
  }
}

function expandIPv6(address: string): number[] | null {
  let a = address.toLowerCase();
  const zone = a.indexOf('%');
  if (zone >= 0) a = a.slice(0, zone);
  // Inbäddad IPv4 på slutet (::ffff:1.2.3.4)
  const v4 = a.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const parts = v4[1].split('.').map(Number);
    if (parts.some(p => p > 255)) return null;
    a = a.slice(0, a.length - v4[1].length) + ((parts[0] << 8) | parts[1]).toString(16) + ':' + ((parts[2] << 8) | parts[3]).toString(16);
  }
  const halves = a.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const full = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (full.length !== 8) return null;
  const nums = full.map(h => parseInt(h || '0', 16));
  return nums.some(n => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : nums;
}

function isBlockedIPv4(parts: number[]): boolean {
  const [p, q] = parts;
  return (
    p === 0 ||
    p === 10 ||
    p === 127 ||
    (p === 100 && q >= 64 && q <= 127) || // CGNAT
    (p === 169 && q === 254) || // länklokal, inkl. molnens metadata-adress
    (p === 172 && q >= 16 && q <= 31) ||
    (p === 192 && q === 0) ||
    (p === 192 && q === 168) ||
    (p === 198 && (q === 18 || q === 19)) ||
    p >= 224 // multicast och reserverat
  );
}

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isBlockedIPv4(address.split('.').map(Number));
  if (family === 6) {
    const h = expandIPv6(address);
    if (!h) return true;
    if (h.every(x => x === 0)) return true; // ::
    if (h.slice(0, 7).every(x => x === 0) && h[7] === 1) return true; // ::1
    if (h[0] >> 9 === 0x7e) return true; // fc00::/7
    if (h[0] >> 6 === 0x3fa) return true; // fe80::/10
    if (h[0] >> 8 === 0xff) return true; // multicast
    if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // dokumentation
    if (h[0] === 0x64 && h[1] === 0xff9b) return true; // NAT64
    // IPv4-mappad (::ffff:a.b.c.d) och IPv4-kompatibel: bedöm den inbäddade adressen
    if (h.slice(0, 5).every(x => x === 0) && (h[5] === 0xffff || h[5] === 0)) {
      return isBlockedIPv4([h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255]);
    }
    return false;
  }
  return true; // okänt format: neka
}

export function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError('Adressen är inte en giltig länk');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new UnsafeUrlError('Bara http- och https-länkar stöds');
  if (url.username || url.password) throw new UnsafeUrlError('Länken får inte innehålla inloggningsuppgifter');
  if (url.port && url.port !== '80' && url.port !== '443') throw new UnsafeUrlError('Länken använder en port som inte stöds');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new UnsafeUrlError('Länken pekar på en adress som inte är tillåten');
  }
  // new URL() normaliserar t.ex. 2130706433 och 0x7f.1 till dotted IPv4, så literal-kontrollen täcker dem.
  if (net.isIP(host) && isBlockedAddress(host)) throw new UnsafeUrlError('Länken pekar på en adress som inte är tillåten');
  return url;
}

const safeLookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: any[]) => void) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    if (!addresses || addresses.length === 0 || addresses.some(a => isBlockedAddress(a.address))) {
      return callback(new UnsafeUrlError('Länken pekar på en adress som inte är tillåten'), '', 0);
    }
    if (options && (options as any).all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}) as unknown as net.LookupFunction;

interface FetchedPage {
  finalUrl: string;
  html: string;
}

const MAX_REDIRECTS = 3;

function requestOnce(url: URL, timeoutMs: number, maxBytes: number): Promise<{ status: number; location?: string; contentType: string; body?: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Uppdragsutbildning-kursimport/1.0',
          Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5',
          'Accept-Language': 'sv,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      res => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: String(res.headers.location), contentType });
        }
        if (status !== 200) {
          res.resume();
          return resolve({ status, contentType });
        }
        if (!/text\/html|application\/xhtml\+xml|text\/plain/.test(contentType)) {
          res.resume();
          return reject(new FetchPageError('Länken pekar inte på en webbsida (HTML)', 422));
        }
        let stream: Readable = res;
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        let total = 0;
        stream.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            req.destroy();
            stream.destroy();
            return reject(new FetchPageError('Sidan är för stor för att läsas in', 422));
          }
          chunks.push(chunk);
        });
        stream.on('end', () => {
          const buf = Buffer.concat(chunks);
          const charset = (contentType.match(/charset=([^;\s]+)/)?.[1] ?? 'utf-8').replace(/["']/g, '');
          let text: string;
          try {
            text = new TextDecoder(charset).decode(buf);
          } catch {
            text = buf.toString('utf8');
          }
          resolve({ status, contentType, body: text });
        });
        stream.on('error', err => reject(new FetchPageError(`Kunde inte läsa sidan: ${err.message}`)));
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new FetchPageError('Sidan svarade inte i tid', 504));
    });
    req.on('error', err => {
      if (err instanceof UnsafeUrlError) return reject(err);
      reject(new FetchPageError(`Kunde inte hämta sidan: ${err.message}`));
    });
    req.end();
  });
}

export async function fetchPage(rawUrl: string, opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<FetchedPage> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  let url = validateUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const result = await requestOnce(url, timeoutMs, maxBytes);
    if (result.location) {
      if (hop === MAX_REDIRECTS) throw new FetchPageError('Länken omdirigeras för många gånger', 422);
      url = validateUrl(new URL(result.location, url).toString());
      continue;
    }
    if (result.status !== 200 || result.body === undefined) {
      throw new FetchPageError(`Sidan svarade med status ${result.status}`, result.status === 404 ? 404 : 422);
    }
    return { finalUrl: url.toString(), html: result.body };
  }
  throw new FetchPageError('Länken omdirigeras för många gånger', 422);
}
