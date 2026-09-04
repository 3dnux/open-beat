/**
 * Rebuilds readable paragraphs from the positioned text runs that pdf.js
 * returns. Headings are detected by font size, subtitles by centring and a
 * distinct font, paragraphs by indentation, vertical gaps and short trailing
 * lines. Paragraphs that run over a page break are stitched back together.
 *
 * Pure functions, no Angular or DOM dependencies: shared by the Angular
 * reader and the standalone single-file build.
 */
import { Paragraph } from './models';

/** The subset of pdf.js' TextItem that the extraction needs. */
export interface TextRun {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

export interface Line {
  y: number;
  x: number;
  right: number;
  size: number;
  font: string;
  text: string;
}

/** Document-wide typography, measured over every page before building paragraphs. */
export interface Geometry {
  body: number;
  bodyFont: string;
  left: number;
  right: number;
}

export interface PageLines {
  lines: Line[];
  width: number;
  height: number;
}

const CLOSING = /[.!?»"”’)…:;]$/;

/** Whole book as one flow of paragraphs from the lines of every page. */
export function assembleFlow(pages: PageLines[]): Paragraph[] {
  const geo = measure(pages.flatMap(p => p.lines));
  const out: Paragraph[] = [];
  for (let n = 1; n <= pages.length; n++) {
    const pl = pages[n - 1];
    const paras = buildParagraphs(pl.lines, n, pl.width, pl.height, geo);
    for (const [i, p] of paras.entries()) {
      const prev = out[out.length - 1];
      const lower = /^\p{Ll}/u.test(p.text);
      const continues = i === 0 && prev?.kind === 'p' && p.kind === 'p' && (lower || (prev.open && !p.indented));
      if (continues && prev) {
        prev.text = joinText(prev.text, p.text);
        prev.open = p.open;
        continue;
      }
      out.push(p);
    }
  }
  if (out.length) out[out.length - 1].open = false;
  return out;
}

/** Group text runs into lines ordered top to bottom. */
export function buildLines(items: TextRun[]): Line[] {
  const lines: Line[] = [];
  for (const it of items) {
    if (it.str.length === 0) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const size = it.height || Math.abs(it.transform[3]) || 0;
    const tol = Math.max(2, size * 0.35);
    let line = lines.find(l => Math.abs(l.y - y) <= tol);
    if (!line) {
      lines.push({ y, x, right: x + it.width, size, font: it.fontName, text: it.str });
      continue;
    }
    const gap = x - line.right;
    const needsSpace =
      line.text.length > 0 && !line.text.endsWith(' ') && !it.str.startsWith(' ') && gap > Math.max(1, line.size * 0.12);
    line.text += (needsSpace ? ' ' : '') + it.str;
    line.right = Math.max(line.right, x + it.width);
    line.x = Math.min(line.x, x);
    if (size > 0 && it.str.trim().length > 0) {
      if (line.text.trim().length === 0) line.font = it.fontName;
      line.size = Math.max(line.size, size);
    }
  }
  for (const l of lines) l.text = l.text.replace(/\s+/g, ' ').trim();
  return lines.filter(l => l.text.length > 0).sort((a, b) => b.y - a.y);
}

export function buildParagraphs(lines: Line[], pageNumber: number, pageWidth: number, pageHeight: number, geo: Geometry): Paragraph[] {
  if (lines.length === 0) return [];
  const { body, bodyFont } = geo;

  // Drop page numbers / running headers: tiny text or bare numbers at the very top or bottom.
  const kept = lines.filter(l => {
    const tiny = l.size < body * 0.8;
    const edge = l.y < pageHeight * 0.07 || l.y > pageHeight * 0.93;
    const isNumber = /^\d{1,4}$/.test(l.text);
    return !(edge && (tiny || isNumber));
  });
  if (kept.length === 0) return [];

  const bodyLines = kept.filter(l => Math.abs(l.size - body) < body * 0.15);
  // Margins of this page (mirrored layouts differ per page); fall back to the book's when the page is sparse.
  const left = bodyLines.length >= 3 ? Math.min(...bodyLines.map(l => l.x)) : geo.left;
  const rightEdge = bodyLines.length >= 3 ? Math.max(...bodyLines.map(l => l.right)) : geo.right;
  const center = pageWidth / 2;
  const gaps: number[] = [];
  for (let i = 1; i < bodyLines.length; i++) gaps.push(bodyLines[i - 1].y - bodyLines[i].y);
  gaps.sort((a, b) => a - b);
  const lineGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : body * 1.4;

  const out: Paragraph[] = [];
  let cur: Line[] = [];
  const flush = () => {
    if (!cur.length) return;
    const last = cur[cur.length - 1];
    out.push({
      kind: 'p',
      text: joinLines(cur),
      page: pageNumber,
      indented: cur[0].x - left > body * 0.6,
      open: rightEdge - last.right < body * 1.5 && !CLOSING.test(last.text),
    });
    cur = [];
  };

  for (let i = 0; i < kept.length; i++) {
    const l = kept[i];
    const isHeading = l.size >= body * 1.18;
    const prevLine = kept[i - 1];
    const last = out[out.length - 1];
    if (isHeading) {
      flush();
      const kind = l.size >= body * 1.6 ? 'h1' : 'h2';
      // Merge consecutive heading lines of the same size.
      if (last && last.kind === kind && prevLine && Math.abs(prevLine.size - l.size) < 0.5 && prevLine.y - l.y < l.size * 2.2 && !cur.length) {
        last.text += ' ' + l.text;
      } else {
        out.push({ kind, text: l.text, page: pageNumber });
      }
      continue;
    }
    // Centred line in a different font/size: a subtitle. Right after a heading it may span
    // several lines; elsewhere it must be short and set apart by a vertical gap.
    const centred = Math.abs((l.x + l.right) / 2 - center) < body * 1.2;
    const distinct = l.font !== bodyFont || Math.abs(l.size - body) >= 0.5;
    if (centred && distinct) {
      const afterHeading = !cur.length && last && last.kind !== 'p' && prevLine && prevLine.y - l.y < body * 6;
      const short = l.right - l.x < (rightEdge - left) * 0.6 && !CLOSING.test(l.text);
      const apart = !prevLine || prevLine.y - l.y > lineGap * 1.4;
      if (afterHeading && last?.kind === 'h3') { last.text += ' ' + l.text; continue; }
      if (afterHeading || (short && apart)) {
        flush();
        out.push({ kind: 'h3', text: l.text, page: pageNumber });
        continue;
      }
    }
    const prev = cur[cur.length - 1];
    if (prev) {
      const indent = l.x - left > body * 0.6;
      const bigGap = prev.y - l.y > lineGap * 1.55;
      const prevShort = rightEdge - prev.right > body * 1.5 && CLOSING.test(prev.text);
      if (indent || bigGap || prevShort) flush();
    }
    cur.push(l);
  }
  flush();
  return out;
}
/** Body size, body font and text margins: the values that cover the most characters. */
function measure(lines: Line[]): Geometry {
  const mode = <K>(entries: Iterable<[K, number]>, fallback: K): K => {
    let best = -1;
    let value = fallback;
    for (const [k, w] of entries) if (w > best) { best = w; value = k; }
    return value;
  };
  const sizes = new Map<number, number>();
  const fonts = new Map<string, number>();
  for (const l of lines) {
    const k = Math.round(l.size * 2) / 2;
    sizes.set(k, (sizes.get(k) ?? 0) + l.text.length);
    fonts.set(l.font, (fonts.get(l.font) ?? 0) + l.text.length);
  }
  const body = mode(sizes, 12);
  const bodyFont = mode(fonts, '');
  const bodyLines = lines.filter(l => Math.abs(l.size - body) < body * 0.15);
  const lefts = new Map<number, number>();
  for (const l of bodyLines) lefts.set(Math.round(l.x), (lefts.get(Math.round(l.x)) ?? 0) + 1);
  const left = mode(lefts, bodyLines.length ? Math.min(...bodyLines.map(l => l.x)) : 0);
  const rights = bodyLines.map(l => l.right).sort((a, b) => a - b);
  const right = rights.length ? rights[Math.floor(rights.length * 0.98)] : 0;
  return { body, bodyFont, left, right };
}

function joinText(a: string, b: string): string {
  if (/[\p{L}]-$/u.test(a) && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b;
  return a + ' ' + b;
}

function joinLines(lines: Line[]): string {
  let text = '';
  for (const l of lines) text = text ? joinText(text, l.text) : l.text;
  return text;
}
