/**
 * Estimates the reader's pace from the time spent on each screen and turns
 * remaining words into "minutes left", the way Kindle does.
 */
const KEY = 'bionic-reader:pace';
const DEFAULT_WPM = 220;
/** Weight of the default pace, in words, so the estimate is stable at first. */
const PRIOR_WORDS = 600;
const MIN_MS = 2500;
const MAX_MS = 4 * 60 * 1000;

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function countWords(text: string): number {
  let n = 0;
  for (const _ of text.matchAll(WORD_RE)) n++;
  return n;
}

export class ReadingSpeed {
  private words = 0;
  private ms = 0;
  private since = 0;
  private pendingWords = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw) as { words: number; ms: number }; this.words = s.words || 0; this.ms = s.ms || 0; }
    } catch { /* ignore */ }
  }

  /** Words per minute, blended with the default pace until enough has been read. */
  get wpm(): number {
    const minutes = this.ms / 60000;
    return (this.words + PRIOR_WORDS) / (minutes + PRIOR_WORDS / DEFAULT_WPM);
  }

  /** Call whenever a new screen is shown, with the number of words it holds. */
  screenShown(words: number): void {
    const now = Date.now();
    if (this.since && this.pendingWords > 0) {
      const dt = now - this.since;
      if (dt >= MIN_MS && dt <= MAX_MS) {
        this.words += this.pendingWords;
        this.ms += dt;
        this.save();
      }
    }
    this.since = now;
    this.pendingWords = words;
  }

  /** Stop timing (the reader was left or hidden). */
  pause(): void {
    this.since = 0;
    this.pendingWords = 0;
  }

  minutesFor(words: number): number {
    return words / this.wpm;
  }

  private save(): void {
    try { localStorage.setItem(KEY, JSON.stringify({ words: this.words, ms: this.ms })); } catch { /* ignore */ }
  }
}

/** "3 min", "1 h 20 min", "menos de 1 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return 'menos de 1 min';
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
