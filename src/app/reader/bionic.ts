/**
 * Bionic reading: bold the first part of every word so the eye can jump
 * between "fixation points" and the brain completes the rest of the word.
 */

const WORD_RE = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;

/** Number of leading characters to bold for a word of the given length. */
export function fixationLength(wordLength: number, fixation: number): number {
  if (wordLength <= 1) return 1;
  if (wordLength <= 3) return fixation >= 0.55 ? 2 : 1;
  const n = Math.round(wordLength * fixation);
  return Math.max(1, Math.min(wordLength - 1, n));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convert plain text into HTML with the leading part of each word wrapped in <b>. */
export function toBionicHtml(text: string, fixation: number): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    const word = m[0];
    const start = m.index ?? 0;
    out += escapeHtml(text.slice(last, start));
    const letters = Array.from(word);
    const n = fixationLength(letters.length, fixation);
    out += `<b>${escapeHtml(letters.slice(0, n).join(''))}</b>${escapeHtml(letters.slice(n).join(''))}`;
    last = start + word.length;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

/** Plain (non-bionic) HTML, escaped. */
export function toPlainHtml(text: string): string {
  return escapeHtml(text);
}
