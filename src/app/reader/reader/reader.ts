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

/** Horizontal gap between screens (CSS columns). */
const GAP = 48;
/** Chapters longer than this are split into several chunks. */
const MAX_CHUNK = 320;
/** Do not start a new chunk at a heading if the current one is this short (title pages). */
const MIN_CHUNK = 4;

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
  readonly showChrome = signal(true);
  readonly size = signal({ w: 0, h: 0 });

  readonly html = computed<SafeHtml>(() => {
    const s = this.settings();
    const c = this.chunks()[this.chunk()];
    if (!c) return '';
    const parts: string[] = [];
    const flow = this.flow();
    for (let i = c.start; i < c.end; i++) {
      const p = flow[i];
      const inner = s.bionic ? toBionicHtml(p.text, s.fixation) : toPlainHtml(p.text);
      parts.push(`<${p.kind} data-i="${i}">${inner}</${p.kind}>`);
    }
    // Generated from escaped text only: safe to bypass the sanitizer (keeps data-* attributes).
    return this.sanitizer.bypassSecurityTrustHtml(parts.join(''));
  });

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

  readonly themes: { id: ReaderTheme; label: string }[] = [
    { id: 'white', label: 'Blanco' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'green', label: 'Verde' },
    { id: 'dark', label: 'Oscuro' },
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

  constructor() {
    // Re-measure whenever the content, the viewport or the typography change.
    effect(() => {
      this.html();
      this.size();
      requestAnimationFrame(() => this.measure());
    });
    // Keep the anchor paragraph up to date and persist the position.
    effect(() => {
      const screen = this.screen();
      const flow = this.flow();
      if (!this.id || !flow.length) return;
      const top = this.topIndex(screen);
      if (top !== null) this.index.set(top);
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
    this.observeSize();
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
    } catch (e) {
      this.error.set('No se pudo abrir el PDF.' + (e instanceof Error && e.message ? ` (${e.message})` : ''));
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
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
    if (event.target instanceof HTMLInputElement) return;
    switch (event.key) {
      case 'ArrowRight': case 'PageDown': case ' ': this.next(); event.preventDefault(); break;
      case 'ArrowLeft': case 'PageUp': this.prev(); event.preventDefault(); break;
      case 'Escape': this.showSettings.set(false); break;
    }
  }

  onTap(event: MouseEvent): void {
    if (this.showSettings()) { this.showSettings.set(false); return; }
    const el = this.stage()?.nativeElement;
    if (!el) return;
    const x = (event.clientX - el.getBoundingClientRect().left) / el.clientWidth;
    if (x < 0.3) this.prev();
    else if (x > 0.7) this.next();
    else this.showChrome.update(v => !v);
  }

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

  toggleBionic(): void { this.anchor(); this.library.updateSettings({ bionic: !this.settings().bionic }); }
  setTheme(theme: ReaderTheme): void { this.library.updateSettings({ theme }); }
  setFont(font: ReaderFont): void { this.anchor(); this.library.updateSettings({ font }); }
  setFixation(fixation: number): void { this.anchor(); this.library.updateSettings({ fixation }); }
  fontSize(delta: number): void {
    this.anchor();
    this.library.updateSettings({ fontSize: Math.min(34, Math.max(14, this.settings().fontSize + delta)) });
  }
  lineHeight(delta: number): void {
    this.anchor();
    const lineHeight = Math.round(Math.min(2.2, Math.max(1.2, this.settings().lineHeight + delta)) * 10) / 10;
    this.library.updateSettings({ lineHeight });
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
    const root = this.columns()?.nativeElement;
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
    const el = this.columns()?.nativeElement;
    const { w } = this.size();
    if (!el || !w) return;
    const screens = Math.max(1, Math.round((el.scrollWidth + GAP) / (w + GAP)));
    this.screens.set(screens);
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
