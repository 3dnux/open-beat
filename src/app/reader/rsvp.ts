/**
 * Rapid serial visual presentation ("burst mode"): one word at a time, each
 * anchored on its optimal recognition point so the eyes never move. Pauses a
 * little longer on long words and at punctuation, like Spritz does.
 */
import { Paragraph } from './models';

export interface RsvpWord {
  text: string;
  /** Index of the letter to anchor (the optimal recognition point). */
  orp: number;
  /** Flow index of the paragraph the word belongs to. */
  paragraph: number;
  /** Delay multiplier for this word. */
  weight: number;
}

const TOKEN_RE = /\S+/g;

export function orpIndex(word: string): number {
  const letters = Array.from(word.replace(/^[^\p{L}\p{N}]+/u, ''));
  const n = letters.length;
  const lead = Array.from(word).length - n;
  if (n <= 1) return lead;
  if (n <= 3) return lead + 1;
  if (n <= 5) return lead + 1;
  if (n <= 9) return lead + 2;
  if (n <= 13) return lead + 3;
  return lead + 4;
}

export function rsvpWords(flow: Paragraph[], from: number, to = flow.length): RsvpWord[] {
  const out: RsvpWord[] = [];
  for (let i = from; i < to; i++) {
    const p = flow[i];
    const tokens = p.text.match(TOKEN_RE) ?? [];
    tokens.forEach((t, k) => {
      const letters = Array.from(t).length;
      let weight = 1;
      if (letters > 8) weight += 0.3;
      if (letters > 12) weight += 0.3;
      if (/[.!?…»"”]$/.test(t)) weight += 1.2;
      else if (/[,;:—]$/.test(t)) weight += 0.6;
      if (k === tokens.length - 1) weight += 0.6; // end of paragraph
      out.push({ text: t, orp: orpIndex(t), paragraph: i, weight });
    });
  }
  return out;
}

export class Rsvp {
  wpm = 300;
  position = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(private readonly words: RsvpWord[], private readonly onWord: (w: RsvpWord, position: number) => void, private readonly onEnd: () => void) {}

  get playing(): boolean { return this.running; }
  get length(): number { return this.words.length; }

  play(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  pause(): void {
    this.running = false;
    clearTimeout(this.timer);
  }

  seek(position: number): void {
    this.position = Math.min(Math.max(0, position), Math.max(0, this.words.length - 1));
    const w = this.words[this.position];
    if (w) this.onWord(w, this.position);
  }

  /** Jump back to the start of the current sentence or the previous one. */
  back(): void {
    let i = Math.max(0, this.position - 2);
    while (i > 0 && !/[.!?…»"”]$/.test(this.words[i - 1].text)) i--;
    this.seek(i);
  }

  private tick(): void {
    if (!this.running) return;
    const w = this.words[this.position];
    if (!w) { this.running = false; this.onEnd(); return; }
    this.onWord(w, this.position);
    const delay = (60000 / this.wpm) * w.weight;
    this.timer = setTimeout(() => { this.position++; this.tick(); }, delay);
  }
}
