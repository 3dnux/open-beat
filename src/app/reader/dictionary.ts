/**
 * Word definitions from the Spanish Wiktionary (free, CORS-enabled). Needs
 * network access; callers show a friendly message when it is unavailable.
 */

export interface DictionaryEntry {
  word: string;
  definitions: string[];
  url: string;
}

const API = 'https://es.wiktionary.org/w/api.php';

/** Strip punctuation and case so "—Palabra," looks up "palabra". */
export function normalizeWord(text: string): string {
  return text.trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase();
}

export async function lookup(rawWord: string): Promise<DictionaryEntry> {
  const word = normalizeWord(rawWord);
  if (!word) throw new Error('Selecciona una palabra.');
  const params = new URLSearchParams({ action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', titles: word, format: 'json', origin: '*' });
  let res: Response;
  try {
    res = await fetch(`${API}?${params}`);
  } catch {
    throw new Error('No hay conexión con el diccionario.');
  }
  if (!res.ok) throw new Error(`El diccionario no respondió (HTTP ${res.status}). Inténtalo de nuevo en un momento.`);
  const data = (await res.json()) as { query?: { pages?: Record<string, { title?: string; extract?: string; missing?: string }> } };
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined || !page.extract) throw new Error(`No hay entrada para «${word}».`);
  const definitions = parseDefinitions(page.extract);
  if (!definitions.length) throw new Error(`No se encontraron acepciones para «${word}».`);
  return { word: page.title ?? word, definitions, url: `https://es.wiktionary.org/wiki/${encodeURIComponent(page.title ?? word)}` };
}

/**
 * Numbered senses from the Spanish section of a Wiktionary plain-text
 * extract. Each sense is a line with its number (and sometimes a domain
 * label) followed by the definition on the next line, then optional
 * "Uso:", "Sinónimos:" and similar lines.
 */
function parseDefinitions(extract: string): string[] {
  const out: string[] = [];
  let inSpanish = false;
  let pending: { label?: string } | null = null;
  for (const raw of extract.split('\n')) {
    const line = raw.trim();
    if (/^==\s*[^=]+==$/.test(line)) { inSpanish = /español/i.test(line); pending = null; continue; }
    if (!inSpanish) continue;
    const m = /^(\d+)(?:\s+(.+))?$/.exec(line);
    if (m) { pending = { label: m[2]?.trim() }; continue; }
    if (!pending || !line) continue;
    if (/^(Uso|Sin[oó]nimos?|Ant[oó]nimos?|Ejemplos?|[AÁ]mbito|Hip[oó]nimos?|Hiper[oó]nimos?|Relacionados?|Derivados?|Variantes?|Cita)\b/i.test(line)) { pending = null; continue; }
    out.push(pending.label ? `${pending.label}: ${line}` : line);
    pending = null;
    if (out.length >= 6) break;
  }
  return out;
}
