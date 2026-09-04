import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, OnInit,
  computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Book, Paragraph, ReaderFont, ReaderTheme } from '../models';
import { LibraryService } from '../library.service';
import { PdfTextService } from '../pdf-text.service';
import { toBionicHtml, toPlainHtml } from '../bionic';
import { PageTurn, TurnDirection } from '../page-turn';
import { TocEntry, buildToc, chapterEnd, chapterStart } from '../toc';
import { ReadingSpeed, countWords, formatMinutes } from '../reading-speed';
import { ReadAloud } from '../speech';
import { Rsvp, RsvpWord, rsvpWords } from '../rsvp';
import { highlightRange, rangeForText } from '../text-range';
import { Annotation, AnnotationStore, HIGHLIGHT_COLORS, HighlightColor, SelectionInfo, markupWithHighlights, selectionInfo } from '../annotations';
import { DictionaryEntry, lookup } from '../dictionary';

/** Horizontal gap between screens (CSS columns). */
const GAP = 48;
/** Chapters longer than this are split into several chunks. */
const MAX_CHUNK = 100;
/** Do not start a new chunk at a heading if the current one is this short (title pages). */
const MIN_CHUNK = 4;
const RSVP_KEY = 'bionic-reader:rsvp-wpm';

interface Chunk { start: number; end: number; }
type Pending = { type: 'first' } | { type: 'last' } | { type: 'index'; index: number } | { type: 'screen'; screen: number };

@Component({
  selector: 'app-reader',
  imports: [RouterLink],
  templateUrl: './reader.html',
  styleUrl: './reader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Reader implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly library = inject(LibraryService);
  private readonly pdf = inject(PdfTextService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly columns = viewChild<ElementRef<HTMLElement>>('columns');

  readonly settings = this.library.settings;
  readonly book = signal<Book | undefined>(undefined);
  readonly totalPages = signal(0);
  readonly flow = signal<Paragraph[]>([]);
  readonly chunks = signal<Chunk[]>([]);
  readonly chunk = signal(0);
  readonly screen = signal(0);
  readonly screens = signal(1);
  /** Index (in the flow) of the paragraph at the top of the current screen. */
  readonly index = signal(0);
  readonly loading = signal(true);
  readonly prepared = signal(0);
  readonly error = signal('');
  readonly showSettings = signal(false);
  readonly showToc = signal(false);
  readonly showChrome = signal(true);
  readonly size = signal({ w: 0, h: 0 });
  readonly fullscreenEnabled = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  readonly isFullscreen = signal(false);

  readonly html = computed<SafeHtml>(() => {
    // Generated from escaped text only: safe to bypass the sanitizer (keeps data-* attributes).
    const c = this.chunks()[this.chunk()];
    return c ? this.sanitizer.bypassSecurityTrustHtml(this.chunkHtml(this.chunk())) : '';
  });

  /** HTML of a chunk for the current typography, memoised so neighbouring chunks can be prepared ahead. */
  private readonly htmlCache = new Map<string, string>();
  private chunkHtml(index: number): string {
    const s = this.settings();
    const c = this.chunks()[index];
    if (!c) return '';
    const notes = this.notes();
    const key = `${index}|${s.bionic ? s.fixation : 'plain'}|${this.notesVersion()}`;
    let html = this.htmlCache.get(key);
    if (html === undefined) {
      const flow = this.flow();
      const render = (t: string) => (s.bionic ? toBionicHtml(t, s.fixation) : toPlainHtml(t));
      const parts: string[] = [];
      for (let i = c.start; i < c.end; i++) {
        const p = flow[i];
        const inner = markupWithHighlights(p.text, notes ? notes.forParagraph(i) : [], render);
        parts.push(`<${p.kind} data-i="${i}">${inner}</${p.kind}>`);
      }
      html = parts.join('');
      if (this.htmlCache.size > 12) this.htmlCache.clear();
      this.htmlCache.set(key, html);
    }
    return html;
  }

  /** Build the neighbouring chunks' HTML while the reader is idle, so chapter changes stay quick. */
  private warmNeighbours(): void {
    const chunk = this.chunk();
    setTimeout(() => { this.chunkHtml(chunk + 1); this.chunkHtml(chunk - 1); }, 80);
  }

  readonly page = computed(() => this.flow()[this.index()]?.page ?? 1);
  readonly percent = computed(() => {
    const n = this.flow().length;
    if (!n) return 0;
    if (this.isLast()) return 100;
    return Math.min(99, Math.floor((this.index() / n) * 100));
  });
  readonly offset = computed(() => -this.screen() * (this.size().w + GAP));
  readonly isFirst = computed(() => this.chunk() === 0 && this.screen() === 0);
  readonly isLast = computed(() => this.chunk() >= this.chunks().length - 1 && this.screen() >= this.screens() - 1);

  /* ---- table of contents & time left ---- */
  readonly toc = computed<TocEntry[]>(() => buildToc(this.flow()));
  readonly currentChapter = computed(() => chapterStart(this.toc(), this.index()));
  private readonly speed = new ReadingSpeed();
  /** Bumped whenever the pace estimate changes so `eta` recomputes. */
  private readonly paceTick = signal(0);
  readonly eta = computed(() => {
    this.paceTick();
    const flow = this.flow();
    if (!flow.length) return '';
    const from = this.index();
    const end = chapterEnd(this.toc(), from, flow.length);
    const chapter = this.speed.minutesFor(this.wordsOf(from, end));
    const book = this.speed.minutesFor(this.wordsOf(from, flow.length));
    return `≈ ${formatMinutes(chapter)} para acabar el capítulo · ${formatMinutes(book)} para acabar el libro`;
  });

  /* ---- highlights, notes, dictionary ---- */
  readonly notes = signal<AnnotationStore | undefined>(undefined);
  readonly notesVersion = signal(0);
  readonly annotations = computed<Annotation[]>(() => { this.notesVersion(); return this.notes()?.all() ?? []; });
  readonly tocTab = signal<'chapters' | 'notes'>('chapters');
  readonly selection = signal<SelectionInfo | null>(null);
  readonly activeHl = signal<Annotation | null>(null);
  readonly popPos = signal<{ left: number; top: number } | null>(null);
  readonly noteOpen = signal(false);
  readonly noteDraft = signal('');
  readonly dict = signal<{ word: string; entry?: DictionaryEntry; error?: string; loading?: boolean } | null>(null);
  readonly colors = HIGHLIGHT_COLORS;
  private popRect: DOMRect | null = null;
  private selTimer?: ReturnType<typeof setTimeout>;
  private readonly onSelection = () => { clearTimeout(this.selTimer); this.selTimer = setTimeout(() => this.selectionChanged(), 250); };
  readonly popover = viewChild<ElementRef<HTMLElement>>('popover');
  readonly readerEl = viewChild<ElementRef<HTMLElement>>('reader');

  /* ---- read aloud ---- */
  readonly ttsOpen = signal(false);
  readonly ttsMsg = signal('');
  readonly ttsPlaying = signal(false);
  readonly ttsRate = signal(1);
  readonly ttsVoice = signal('');
  readonly voices = signal<SpeechSynthesisVoice[]>([]);
  readonly ttsSupported = ReadAloud.supported();
  private tts?: ReadAloud;

  /* ---- burst mode (RSVP) ---- */
  readonly rsvpOpen = signal(false);
  readonly rsvpWord = signal<{ l: string; o: string; r: string }>({ l: '', o: '', r: '' });
  readonly rsvpProgress = signal(0);
  readonly rsvpPlaying = signal(false);
  readonly rsvpWpm = signal(300);
  readonly rsvpAtEnd = signal(false);
  private rsvp?: Rsvp;
  private rsvpWords: RsvpWord[] = [];

  readonly themes: { id: ReaderTheme; label: string }[] = [
    { id: 'white', label: 'Blanco' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'green', label: 'Verde' },
    { id: 'dark', label: 'Oscuro' },
  ];
  readonly fonts: { id: ReaderFont; label: string; family: string; hint: string }[] = [
    { id: 'serif', label: 'Literata', family: "'Literata', Georgia, serif", hint: 'Serif clásica' },
    { id: 'lexend', label: 'Lexend', family: "'Lexend', sans-serif", hint: 'Diseñada para leer con fluidez' },
    { id: 'atkinson', label: 'Atkinson', family: "'Atkinson Hyperlegible', sans-serif", hint: 'Letras que no se confunden entre sí' },
    { id: 'sans', label: 'Sistema', family: 'system-ui, sans-serif', hint: 'La fuente del dispositivo' },
  ];
  readonly fixations = [
    { value: 0.35, label: 'Baja' },
    { value: 0.5, label: 'Media' },
    { value: 0.65, label: 'Alta' },
  ];

  private id = '';
  private pending: Pending = { type: 'first' };
  private resizeObserver?: ResizeObserver;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private pageTurn?: PageTurn;
  private wakeLock?: { release(): Promise<void> };
  private readonly chunkWords = new Map<number, number>();
  private readonly onVisibility = () => { if (document.hidden) this.speed.pause(); else this.requestWakeLock(); };
  private readonly onFullscreen = () => this.isFullscreen.set(!!document.fullscreenElement);

  constructor() {
    // Re-measure whenever the content, the viewport or the typography change.
    effect(() => {
      this.html();
      this.size();
      requestAnimationFrame(() => this.measure());
    });
    // Keep the anchor paragraph up to date, time the pace and persist the position.
    effect(() => {
      const screen = this.screen();
      const flow = this.flow();
      if (!this.id || !flow.length) return;
      const top = this.topIndex(screen);
      if (top !== null) this.index.set(top);
      this.speed.screenShown(this.wordsPerScreen());
      this.paceTick.update(n => n + 1);
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.save(), 300);
    });
  }

  async ngOnInit(): Promise<void> {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    const book = await this.library.get(this.id);
    if (!book) {
      this.router.navigate(['/biblioteca']);
      return;
    }
    this.book.set(book);
    this.notes.set(new AnnotationStore(book.id));
    this.observeSize();
    document.addEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('selectionchange', this.onSelection);
    document.addEventListener('fullscreenchange', this.onFullscreen);
    try {
      const doc = await this.pdf.open(book.id, book.src ?? book.data!);
      this.totalPages.set(doc.numPages);
      const flow = await this.pdf.flow(book.id, (done, total) => this.prepared.set(Math.round((done / total) * 100)));
      if (!flow.length) throw new Error('El PDF no contiene texto');
      this.flow.set(flow);
      this.chunks.set(buildChunks(flow));
      const progress = this.library.progress(book.id);
      let index = progress?.index ?? 0;
      if (progress && progress.index === undefined) index = this.indexOfPage(progress.page);
      this.goToIndex(Math.min(Math.max(0, index), flow.length - 1));
      this.requestWakeLock();
    } catch (e) {
      this.error.set('No se pudo abrir el PDF.' + (e instanceof Error && e.message ? ` (${e.message})` : ''));
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.tts?.stop();
    this.rsvp?.pause();
    this.speed.pause();
    this.wakeLock?.release().catch(() => undefined);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('fullscreenchange', this.onFullscreen);
    document.removeEventListener('selectionchange', this.onSelection);
    clearTimeout(this.selTimer);
    this.pageTurn?.detach();
    this.resizeObserver?.disconnect();
    clearTimeout(this.saveTimer);
    if (this.id) {
      this.save();
      this.pdf.close(this.id);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (this.rsvpOpen()) {
      if (event.key === 'Escape') this.closeRsvp();
      else if (event.key === ' ') { this.rsvpToggle(); event.preventDefault(); }
      return;
    }
    switch (event.key) {
      case 'ArrowRight': case 'PageDown': case ' ': this.next(); event.preventDefault(); break;
      case 'ArrowLeft': case 'PageUp': this.prev(); event.preventDefault(); break;
      case 'Escape': this.showSettings.set(false); this.showToc.set(false); this.closePops(); break;
    }
  }

  onTap(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const mark = target.closest<HTMLElement>('mark.hl');
    if (mark) { this.openHighlight(mark.dataset['h']!, mark.getBoundingClientRect()); return; }
    if (this.activeHl() || this.dict() || this.selection()) { this.closePops(); return; }
    if (!document.getSelection()?.isCollapsed) return;
    if (this.showSettings() || this.showToc()) { this.showSettings.set(false); this.showToc.set(false); return; }
    const el = this.stage()?.nativeElement;
    if (!el) return;
    // With a mouse, a double click selects a word: hold the single tap briefly so it can be cancelled.
    clearTimeout(this.tapTimer);
    if (event.detail > 1) return;
    const x = (event.clientX - el.getBoundingClientRect().left) / el.clientWidth;
    const run = () => {
      if (!document.getSelection()?.isCollapsed) return;
      if (x < 0.3) this.prev();
      else if (x > 0.7) this.next();
      else this.showChrome.update(v => !v);
    };
    if (matchMedia('(hover: hover)').matches) this.tapTimer = setTimeout(run, 260); else run();
  }
  private tapTimer?: ReturnType<typeof setTimeout>;

  next(): void { this.turn(1); }
  prev(): void { this.turn(-1); }

  /** Animated page turn; falls back to a plain change before the gesture layer exists. */
  private turn(dir: TurnDirection): void {
    if (this.loading()) return;
    if (this.pageTurn) this.pageTurn.flip(dir);
    else this.advance(dir);
  }

  private canAdvance(dir: TurnDirection): boolean {
    return !this.loading() && (dir === 1 ? !this.isLast() : !this.isFirst());
  }

  private advance(dir: TurnDirection): void {
    if (dir === 1) {
      if (this.screen() < this.screens() - 1) this.screen.update(s => s + 1);
      else if (this.chunk() < this.chunks().length - 1) this.setChunk(this.chunk() + 1, { type: 'first' });
    } else {
      if (this.screen() > 0) this.screen.update(s => s - 1);
      else if (this.chunk() > 0) this.setChunk(this.chunk() - 1, { type: 'last' });
    }
  }

  onSlider(event: Event): void {
    const page = Number((event.target as HTMLInputElement).value);
    if (page !== this.page()) this.goToIndex(this.indexOfPage(page));
  }

  toggleSettings(): void { this.showToc.set(false); this.showSettings.update(v => !v); }
  toggleToc(): void { this.showSettings.set(false); this.showToc.update(v => !v); }
  goToChapter(index: number): void { this.showToc.set(false); this.goToIndex(index); }

  toggleBionic(): void { this.anchor(); this.library.updateSettings({ bionic: !this.settings().bionic }); }
  setTheme(theme: ReaderTheme): void { this.library.updateSettings({ theme }); }
  setFont(font: ReaderFont): void { this.anchor(); this.library.updateSettings({ font }); }
  setFixation(fixation: number): void { this.anchor(); this.library.updateSettings({ fixation }); }
  setWarmth(event: Event): void { this.library.updateSettings({ warmth: Number((event.target as HTMLInputElement).value) }); }
  fontSize(delta: number): void {
    this.anchor();
    this.library.updateSettings({ fontSize: Math.min(34, Math.max(14, this.settings().fontSize + delta)) });
  }
  lineHeight(delta: number): void {
    this.anchor();
    const lineHeight = Math.round(Math.min(2.2, Math.max(1.2, this.settings().lineHeight + delta)) * 10) / 10;
    this.library.updateSettings({ lineHeight });
  }
  toggleFullscreen(): void {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen().catch(() => undefined);
  }

  /* ---- read aloud ---- */
  toggleTts(): void {
    const open = !this.ttsOpen();
    this.ttsOpen.set(open);
    if (open) {
      this.ensureTts();
      this.voices.set(ReadAloud.voices());
    } else {
      this.tts?.stop();
      this.clearSpeaking();
      this.ttsPlaying.set(false);
    }
  }
  ttsPlayPause(): void {
    const tts = this.ensureTts();
    this.ttsMsg.set('');
    if (!tts.active) tts.start(this.index());
    else if (tts.isPaused) tts.resume();
    else tts.pause();
    this.ttsPlaying.set(tts.active && !tts.isPaused);
  }
  ttsStop(): void { this.tts?.stop(); this.clearSpeaking(); this.ttsPlaying.set(false); }
  ttsChangeRate(delta: number): void {
    const tts = this.ensureTts();
    tts.rate = Math.round(Math.min(2, Math.max(0.6, tts.rate + delta)) * 10) / 10;
    this.ttsRate.set(tts.rate);
    if (tts.active) tts.start(tts.current);
  }
  ttsSetVoice(event: Event): void {
    const tts = this.ensureTts();
    tts.voiceName = (event.target as HTMLSelectElement).value;
    this.ttsVoice.set(tts.voiceName);
    if (tts.active) tts.start(tts.current);
  }
  private ensureTts(): ReadAloud {
    if (!this.tts) {
      this.tts = new ReadAloud(i => this.flow()[i]?.text, {
        paragraph: i => this.showSpeaking(i),
        word: (i, start, end) => {
          const el = this.columnsEl()?.querySelector<HTMLElement>(`[data-i="${i}"]`);
          highlightRange('tts-word', el ? rangeForText(el, start, end) : null);
        },
        end: () => { this.clearSpeaking(); this.ttsPlaying.set(false); },
        error: msg => { this.ttsMsg.set(msg); this.clearSpeaking(); this.ttsPlaying.set(false); },
      });
      if (ReadAloud.supported()) speechSynthesis.addEventListener('voiceschanged', () => this.voices.set(ReadAloud.voices()), { once: true });
    }
    return this.tts;
  }
  private showSpeaking(i: number): void {
    this.clearSpeaking();
    const root = this.columnsEl();
    let el = root?.querySelector<HTMLElement>(`[data-i="${i}"]`) ?? null;
    const c = this.chunks()[this.chunk()];
    if (!el || i < c.start || i >= c.end || this.columnOf(el) !== this.screen()) {
      if (el && i >= c.start && i < c.end) this.screen.set(this.columnOf(el));
      else { this.goToIndex(i); el = null; }
    }
    if (el) el.classList.add('speaking');
    else setTimeout(() => this.columnsEl()?.querySelector(`[data-i="${i}"]`)?.classList.add('speaking'), 60);
  }
  private clearSpeaking(): void {
    highlightRange('tts-word', null);
    this.columnsEl()?.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking'));
  }

  /* ---- highlights, notes, dictionary ---- */
  private selectionChanged(): void {
    if (this.rsvpOpen()) return;
    const root = this.columnsEl();
    const info = root ? selectionInfo(root) : null;
    this.selection.set(info);
    if (info) { this.activeHl.set(null); this.popRect = info.rect; this.placePopover(); }
    else if (!this.activeHl()) this.popPos.set(null);
  }
  private placePopover(): void {
    // The popover renders on the next change detection; position it once it exists.
    setTimeout(() => {
      const pop = this.popover()?.nativeElement;
      const host = this.readerEl()?.nativeElement;
      const rect = this.popRect;
      if (!pop || !host || !rect) return;
      const hb = host.getBoundingClientRect();
      const w = pop.offsetWidth, h = pop.offsetHeight;
      const left = Math.max(8, Math.min(rect.left - hb.left + rect.width / 2 - w / 2, hb.width - w - 8));
      let top = rect.top - hb.top - h - 10;
      if (top < 60) top = rect.bottom - hb.top + 10;
      this.popPos.set({ left, top });
    });
  }
  private refreshHighlights(): void {
    this.pending = { type: 'screen', screen: this.screen() };
    this.notesVersion.update(n => n + 1);
  }
  addHighlight(color: HighlightColor): void {
    const sel = this.selection();
    const store = this.notes();
    if (!sel || !store) return;
    store.add({ index: sel.index, start: sel.start, end: sel.end, text: sel.text, color });
    document.getSelection()?.removeAllRanges();
    this.closePops();
    this.refreshHighlights();
  }
  private openHighlight(id: string, rect: DOMRect): void {
    const a = this.notes()?.get(id);
    if (!a) return;
    document.getSelection()?.removeAllRanges();
    this.selection.set(null);
    this.activeHl.set(a);
    this.popRect = rect;
    this.placePopover();
  }
  setHighlightColor(color: HighlightColor): void {
    const a = this.activeHl();
    if (!a) return;
    this.notes()?.update(a.id, { color });
    this.activeHl.set({ ...a, color });
    this.refreshHighlights();
  }
  removeHighlight(): void {
    const a = this.activeHl();
    if (!a) return;
    this.notes()?.remove(a.id);
    this.closePops();
    this.refreshHighlights();
  }
  copySelection(): void {
    const sel = this.selection();
    if (sel) navigator.clipboard?.writeText(sel.text).catch(() => undefined);
    this.closePops();
  }
  isSingleWord(text: string): boolean { return !/\s/.test(text.trim()); }
  openNote(): void {
    const sel = this.selection();
    const store = this.notes();
    if (sel && !this.activeHl() && store) {
      const a = store.add({ index: sel.index, start: sel.start, end: sel.end, text: sel.text, color: 'yellow' });
      document.getSelection()?.removeAllRanges();
      this.selection.set(null);
      this.activeHl.set(a);
      this.refreshHighlights();
    }
    const a = this.activeHl();
    if (!a) return;
    this.noteDraft.set(a.note ?? '');
    this.noteOpen.set(true);
  }
  saveNote(value: string): void {
    const a = this.activeHl();
    if (a) this.notes()?.update(a.id, { note: value.trim() || undefined });
    this.noteOpen.set(false);
    this.activeHl.set(null);
    this.popPos.set(null);
    this.refreshHighlights();
  }
  cancelNote(): void { this.noteOpen.set(false); this.activeHl.set(null); this.popPos.set(null); }
  closePops(): void {
    this.activeHl.set(null);
    this.selection.set(null);
    this.popPos.set(null);
    this.noteOpen.set(false);
    this.dict.set(null);
  }
  async define(): Promise<void> {
    const text = this.selection()?.text ?? this.activeHl()?.text ?? '';
    if (!text) return;
    document.getSelection()?.removeAllRanges();
    this.activeHl.set(null); this.selection.set(null); this.popPos.set(null);
    this.dict.set({ word: text, loading: true });
    try { this.dict.set({ word: text, entry: await lookup(text) }); }
    catch (e) { this.dict.set({ word: text, error: e instanceof Error ? e.message : 'No se pudo consultar.' }); }
  }
  closeDict(): void { this.dict.set(null); }
  goToNote(index: number): void { this.showToc.set(false); this.goToIndex(index); }

  /* ---- burst mode ---- */
  openRsvp(): void {
    this.showSettings.set(false);
    this.ttsStop();
    this.rsvpWords = rsvpWords(this.flow(), this.index());
    if (!this.rsvpWords.length) return;
    let wpm = 300;
    try { wpm = Number(localStorage.getItem(RSVP_KEY)) || 300; } catch { /* ignore */ }
    this.rsvp = new Rsvp(this.rsvpWords, (w, pos) => this.showRsvpWord(w, pos), () => { this.rsvpPlaying.set(false); this.rsvpAtEnd.set(true); });
    this.rsvp.wpm = wpm;
    this.rsvpWpm.set(wpm);
    this.rsvpAtEnd.set(false);
    this.rsvpOpen.set(true);
    this.rsvp.seek(0);
    this.rsvp.play();
    this.rsvpPlaying.set(true);
  }
  rsvpToggle(): void {
    if (!this.rsvp) return;
    if (this.rsvp.playing) this.rsvp.pause(); else this.rsvp.play();
    this.rsvpPlaying.set(this.rsvp.playing);
  }
  rsvpBack(): void { this.rsvp?.back(); }
  rsvpStep(delta: number): void { this.rsvpSetWpm(this.rsvpWpm() + delta); }
  rsvpSlider(event: Event): void { this.rsvpSetWpm(Number((event.target as HTMLInputElement).value)); }
  private rsvpSetWpm(wpm: number): void {
    wpm = Math.min(800, Math.max(100, wpm));
    if (this.rsvp) this.rsvp.wpm = wpm;
    this.rsvpWpm.set(wpm);
    try { localStorage.setItem(RSVP_KEY, String(wpm)); } catch { /* ignore */ }
  }
  closeRsvp(): void {
    const r = this.rsvp;
    if (!r) return;
    r.pause();
    const w = this.rsvpWords[r.position];
    this.rsvp = undefined;
    this.rsvpOpen.set(false);
    if (w && w.paragraph !== this.index()) this.goToIndex(w.paragraph);
  }
  private showRsvpWord(w: RsvpWord, pos: number): void {
    const letters = Array.from(w.text);
    this.rsvpWord.set({ l: letters.slice(0, w.orp).join(''), o: letters[w.orp] ?? '', r: letters.slice(w.orp + 1).join('') });
    this.rsvpProgress.set((pos / Math.max(1, this.rsvpWords.length - 1)) * 100);
  }

  /* ---- helpers ---- */
  private columnsEl(): HTMLElement | undefined { return this.columns()?.nativeElement; }

  private wordsOf(from: number, to: number): number {
    const flow = this.flow();
    let n = 0;
    for (let i = from; i < to; i++) n += countWords(flow[i].text);
    return n;
  }
  private wordsPerScreen(): number {
    const c = this.chunks()[this.chunk()];
    if (!c) return 1;
    let words = this.chunkWords.get(this.chunk());
    if (words === undefined) { words = this.wordsOf(c.start, c.end); this.chunkWords.set(this.chunk(), words); }
    return Math.max(1, Math.round(words / Math.max(1, this.screens())));
  }
  private async requestWakeLock(): Promise<void> {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      if (!nav.wakeLock || document.hidden) return;
      this.wakeLock = await nav.wakeLock.request('screen');
    } catch { /* not allowed here */ }
  }

  /** Keep the current paragraph on screen across typography changes. */
  private anchor(): void {
    this.pending = { type: 'index', index: this.index() };
  }

  private goToIndex(index: number): void {
    const chunk = this.chunks().findIndex(c => index >= c.start && index < c.end);
    this.setChunk(Math.max(0, chunk), { type: 'index', index });
  }

  private setChunk(chunk: number, pending: Pending): void {
    this.pending = pending;
    if (chunk === this.chunk()) {
      this.measure();
      return;
    }
    this.screen.set(0);
    this.chunk.set(chunk);
  }

  private indexOfPage(page: number): number {
    const flow = this.flow();
    const i = flow.findIndex(p => p.page >= page);
    return i < 0 ? Math.max(0, flow.length - 1) : i;
  }

  private observeSize(): void {
    const el = this.stage()?.nativeElement;
    if (!el) return;
    this.pageTurn = new PageTurn({
      stage: el,
      columns: () => this.columns()!.nativeElement,
      screen: () => this.screen(),
      stride: () => this.size().w + GAP,
      inline: dir => (dir === 1 ? this.screen() < this.screens() - 1 : this.screen() > 0),
      canTurn: dir => this.canAdvance(dir),
      turn: dir => this.advance(dir),
      snapshot: () => ({ chunk: this.chunk(), screen: this.screen() }),
      restore: snap => {
        const { chunk, screen } = snap as { chunk: number; screen: number };
        if (chunk === this.chunk()) this.screen.set(screen);
        else this.setChunk(chunk, { type: 'screen', screen });
      },
    });
    this.pageTurn.attach();
    const update = () => {
      if (this.size().w) this.anchor();
      this.size.set({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(update);
      this.resizeObserver.observe(el);
    }
  }

  private columnOf(el: HTMLElement): number {
    return Math.round(el.offsetLeft / (this.size().w + GAP));
  }

  /** Flow index of the paragraph at the top of the given screen (null when not rendered yet). */
  private topIndex(screen: number): number | null {
    const root = this.columnsEl();
    if (!root || !this.size().w) return null;
    // First paragraph starting on this screen, or the one flowing into it from the previous screen.
    let found: number | null = null;
    for (const child of Array.from(root.children) as HTMLElement[]) {
      const col = this.columnOf(child);
      if (col > screen) break;
      found = Number(child.dataset['i']);
      if (col === screen) break;
    }
    return found;
  }

  private measure(): void {
    const el = this.columnsEl();
    const { w } = this.size();
    if (!el || !w) return;
    const screens = Math.max(1, Math.round((el.scrollWidth + GAP) / (w + GAP)));
    this.screens.set(screens);
    this.warmNeighbours();
    const pending = this.pending;
    this.pending = { type: 'first' };
    let screen = this.screen();
    if (pending.type === 'last') screen = screens - 1;
    else if (pending.type === 'screen') screen = pending.screen;
    else if (pending.type === 'index') {
      const target = el.querySelector<HTMLElement>(`[data-i="${pending.index}"]`);
      if (target) screen = this.columnOf(target);
    }
    screen = Math.min(Math.max(0, screen), screens - 1);
    if (screen === this.screen()) {
      const top = this.topIndex(screen);
      if (top !== null) this.index.set(top);
    } else {
      this.screen.set(screen);
    }
  }

  private save(): void {
    if (!this.id || !this.flow().length) return;
    this.library.saveProgress(this.id, {
      page: this.page(),
      index: this.index(),
      percent: this.percent(),
      totalPages: this.totalPages(),
      updatedAt: Date.now(),
    });
  }
}

/** Split the flow into chapter-sized chunks, starting new ones at headings. */
function buildChunks(flow: Paragraph[]): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  for (let i = 1; i < flow.length; i++) {
    const heading = flow[i].kind === 'h1' || flow[i].kind === 'h2';
    const tooLong = i - start >= MAX_CHUNK;
    if ((heading && i - start >= MIN_CHUNK) || tooLong) {
      chunks.push({ start, end: i });
      start = i;
    }
  }
  chunks.push({ start, end: flow.length });
  return chunks;
}
