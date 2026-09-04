/**
 * Read-aloud with the Web Speech API: speaks paragraphs one after another
 * and reports the paragraph and the word being spoken so the reader can
 * follow along (like Kindle's Assistive Reader).
 */

export interface ReadAloudEvents {
  paragraph(index: number): void;
  /** Character range of the word being spoken inside the paragraph text. */
  word(index: number, start: number, end: number): void;
  end(): void;
  error(message: string): void;
}

export class ReadAloud {
  rate = 1;
  voiceName = '';
  private index = -1;
  private speaking = false;
  private paused = false;
  private utterance?: SpeechSynthesisUtterance;

  constructor(private readonly textOf: (index: number) => string | undefined, private readonly events: ReadAloudEvents) {}

  static supported(): boolean {
    return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  /** Voices for the given language prefix, best first. */
  static voices(lang = 'es'): SpeechSynthesisVoice[] {
    if (!ReadAloud.supported()) return [];
    const all = speechSynthesis.getVoices();
    const match = all.filter(v => v.lang.toLowerCase().startsWith(lang));
    return (match.length ? match : all).sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name));
  }

  get active(): boolean { return this.speaking; }
  get isPaused(): boolean { return this.paused; }
  get current(): number { return this.index; }

  start(index: number): void {
    if (!ReadAloud.supported()) { this.events.error('Este navegador no puede leer en voz alta.'); return; }
    this.stop();
    this.speaking = true;
    this.paused = false;
    this.speakFrom(index);
  }

  pause(): void {
    if (!this.speaking || this.paused) return;
    this.paused = true;
    speechSynthesis.pause();
  }

  resume(): void {
    if (!this.speaking || !this.paused) return;
    this.paused = false;
    speechSynthesis.resume();
  }

  stop(): void {
    if (!ReadAloud.supported()) return;
    this.speaking = false;
    this.paused = false;
    this.utterance = undefined;
    speechSynthesis.cancel();
  }

  private speakFrom(index: number): void {
    const text = this.textOf(index);
    if (text === undefined) { this.speaking = false; this.events.end(); return; }
    if (!text.trim()) { this.speakFrom(index + 1); return; }
    this.index = index;
    this.events.paragraph(index);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es';
    u.rate = this.rate;
    const voice = ReadAloud.voices().find(v => v.name === this.voiceName);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.onboundary = e => {
      if (e.name !== 'word' || this.utterance !== u) return;
      const start = e.charIndex;
      const length = e.charLength ?? wordLengthAt(text, start);
      this.events.word(index, start, start + length);
    };
    u.onend = () => { if (this.utterance === u && this.speaking) this.speakFrom(index + 1); };
    u.onerror = e => {
      if (this.utterance !== u) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      this.speaking = false;
      this.events.error('No se pudo reproducir la voz (' + e.error + ').');
    };
    this.utterance = u;
    speechSynthesis.speak(u);
  }
}

function wordLengthAt(text: string, start: number): number {
  const m = /^[\p{L}\p{N}'’-]+/u.exec(text.slice(start));
  return m ? m[0].length : 1;
}
