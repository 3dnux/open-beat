/**
 * Standalone, single-file build of the bionic reader (no Angular): a bookshelf
 * with embedded public-domain books plus a Kindle-style reader. Built by
 * scripts/build-standalone.mjs into one HTML page that can be published anywhere.
 */
import { toBionicHtml, toPlainHtml } from '../app/reader/bionic';
import { BookCover, DEFAULT_SETTINGS, Paragraph, ReaderFont, ReaderSettings, ReaderTheme, ReadingProgress } from '../app/reader/models';
import { PageLines, assembleFlow, buildLines } from '../app/reader/pdf-paragraphs';
import { PageTurn, TurnDirection } from '../app/reader/page-turn';
import { TocEntry, buildToc, chapterEnd, chapterStart } from '../app/reader/toc';
import { ReadingSpeed, countWords, formatMinutes } from '../app/reader/reading-speed';
import { ReadAloud } from '../app/reader/speech';
import { Rsvp, RsvpWord, rsvpWords } from '../app/reader/rsvp';
import { highlightRange, rangeForText } from '../app/reader/text-range';

interface StoredBook {
  id: string;
  title: string;
  author: string;
  year?: string;
  cover: BookCover;
  pages: number;
  flow: Paragraph[];
  local?: boolean;
}

declare global {
  interface Window { __BOOKS: StoredBook[]; }
}

const DB_NAME = 'bionic-reader-standalone';
const STORE = 'books';
const PROGRESS_KEY = 'bionic-reader:progress:';
const SETTINGS_KEY = 'bionic-reader:settings';
const GAP = 48;
const MAX_CHUNK = 100;
const MIN_CHUNK = 4;
const SHELF_SIZE = 4;
const DEMO_TEXT =
  'La lectura biónica resalta el inicio de cada palabra para guiar la vista. Tu cerebro completa el resto de la palabra y lees más rápido con menos esfuerzo.';

const COVERS: BookCover[] = [
  { from: '#7a1f1f', to: '#3d0d0d', accent: '#d9a441', ink: '#f7e8c8' },
  { from: '#1e4d4a', to: '#0c2624', accent: '#c9b27c', ink: '#eef4ec' },
  { from: '#2d2140', to: '#120c1d', accent: '#e0893b', ink: '#f3e9dc' },
  { from: '#1f3a66', to: '#0d1b33', accent: '#f0c674', ink: '#eaf0ff' },
  { from: '#5a3d1e', to: '#2a1a0a', accent: '#e8d6a8', ink: '#f8f1e4' },
  { from: '#3a4a2a', to: '#18220f', accent: '#d8c36b', ink: '#f2f5e6' },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;

/* ------------------------------------------------------------------ library */

class Library {
  books: StoredBook[] = [...window.__BOOKS];
  settings: ReaderSettings = { ...DEFAULT_SETTINGS, ...read<Partial<ReaderSettings>>(SETTINGS_KEY, {}) };
  private dbPromise?: Promise<IDBDatabase>;

  async load(): Promise<void> {
    try {
      const db = await this.db();
      const local = await tx<StoredBook[]>(db, 'readonly', s => s.getAll());
      this.books = [...window.__BOOKS, ...local.map(b => ({ ...b, local: true }))];
    } catch {
      /* IndexedDB unavailable: built-in books only */
    }
  }

  get(id: string): StoredBook | undefined { return this.books.find(b => b.id === id); }

  async add(book: StoredBook): Promise<void> {
    this.books.push(book);
    try { const db = await this.db(); await tx(db, 'readwrite', s => s.put(book)); } catch { /* memory only */ }
  }

  async remove(id: string): Promise<void> {
    this.books = this.books.filter(b => b.id !== id);
    try { localStorage.removeItem(PROGRESS_KEY + id); } catch { /* ignore */ }
    try { const db = await this.db(); await tx(db, 'readwrite', s => s.delete(id)); } catch { /* ignore */ }
  }

  nextCover(): BookCover { return COVERS[(this.books.length + 3) % COVERS.length]; }

  progress(id: string): ReadingProgress | null { return read<ReadingProgress | null>(PROGRESS_KEY + id, null); }
  saveProgress(id: string, p: ReadingProgress): void { write(PROGRESS_KEY + id, p); }
  updateSettings(patch: Partial<ReaderSettings>): void {
    this.settings = { ...this.settings, ...patch };
    write(SETTINGS_KEY, this.settings);
  }

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB no disponible'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }
}

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

/* ------------------------------------------------------------- pdf import */

interface PdfJsLike {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(params: object): { promise: Promise<PdfDocLike>; destroy(): Promise<void> };
}
interface PdfDocLike {
  numPages: number;
  getMetadata(): Promise<{ info?: Record<string, unknown> }>;
  getPage(n: number): Promise<{ view: number[]; getTextContent(): Promise<{ items: unknown[] }>; cleanup(): void }>;
}

/** pdf.js and its worker are inlined in the page (see scripts/build-standalone.mjs) and run on the main thread. */
async function loadPdfJs(): Promise<PdfJsLike> {
  const lib = (globalThis as { pdfjsLib?: PdfJsLike }).pdfjsLib;
  if (!lib) throw new Error('El lector de PDF no está disponible en esta página.');
  return lib;
}

async function importPdf(file: File, onProgress: (pct: number) => void): Promise<Omit<StoredBook, 'id' | 'cover'>> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false });
  const doc = await task.promise;
  try {
    const pages: PageLines[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items.filter((it): it is Parameters<typeof buildLines>[0][number] => typeof it === 'object' && it !== null && 'str' in it);
      pages.push({ lines: buildLines(items), width: page.view[2] - page.view[0], height: page.view[3] - page.view[1] });
      page.cleanup();
      onProgress(Math.round((n / doc.numPages) * 100));
    }
    const flow = assembleFlow(pages);
    if (!flow.length) throw new Error('El PDF no contiene texto seleccionable.');
    let title = '';
    let author = '';
    try {
      const info = (await doc.getMetadata()).info ?? {};
      title = typeof info['Title'] === 'string' ? info['Title'].trim() : '';
      author = typeof info['Author'] === 'string' ? info['Author'].trim() : '';
    } catch { /* no metadata */ }
    return { title: title || titleFromFileName(file.name), author: author || 'PDF propio', pages: doc.numPages, flow };
  } finally {
    task.destroy().catch(() => undefined);
  }
}

function titleFromFileName(name: string): string {
  const base = name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'PDF sin título';
}

/* --------------------------------------------------------------- bookshelf */

class Shelf {
  private busy = false;
  private busyPct = 0;
  private error = '';
  private demoBionic = true;

  constructor(private root: HTMLElement, private library: Library) {}

  render(): void {
    const items = this.library.books.map(book => {
      const p = this.library.progress(book.id);
      const byPage = p && book.pages ? Math.round(((p.page - 1) / book.pages) * 100) : 0;
      return { book, percent: Math.min(100, p?.percent ?? byPage) };
    });
    const rows: typeof items[] = [];
    for (let i = 0; i < items.length; i += SHELF_SIZE) rows.push(items.slice(i, i + SHELF_SIZE));
    if (!rows.length) rows.push([]);

    this.root.innerHTML = `
<div class="room">
  <header class="top">
    <h1>Mi biblioteca</h1>
    <p class="hint">Toca un libro para leerlo con formato biónico</p>
  </header>
  <section class="bookcase" aria-label="Librero">
    ${rows.map((row, r) => `
    <div class="shelf">
      <div class="books">
        ${row.map(({ book, percent }) => `
        <button class="book" type="button" data-open="${esc(book.id)}" aria-label="Leer ${esc(book.title)}"
                style="--c1:${book.cover.from};--c2:${book.cover.to};--accent:${book.cover.accent};--ink:${book.cover.ink}">
          <span class="spine"></span>
          <span class="cover">
            <span class="frame">
              <span class="title">${esc(book.title)}</span>
              <span class="rule"></span>
              <span class="author">${esc(book.author)}</span>
              ${book.year ? `<span class="year">${esc(book.year)}</span>` : ''}
            </span>
            ${percent > 0 ? `<span class="progress"><i style="width:${percent}%"></i><em>${percent}%</em></span>` : ''}
          </span>
          <span class="pages"></span>
          ${book.local ? `<span class="remove" role="button" tabindex="0" data-remove="${esc(book.id)}" aria-label="Quitar libro">×</span>` : ''}
        </button>`).join('')}
        ${r === rows.length - 1 ? `
        <button class="book add" type="button" data-add ${this.busy ? 'disabled' : ''} aria-label="Añadir un PDF">
          <span class="spine"></span>
          <span class="cover"><span class="frame">
            <span class="plus">${this.busy ? (this.busyPct ? this.busyPct + '%' : '…') : '+'}</span>
            <span class="title">${this.busy ? 'Leyendo PDF' : 'Añadir PDF'}</span>
            <span class="author">Abre tu propio libro</span>
          </span></span>
          <span class="pages"></span>
        </button>` : ''}
      </div>
      <div class="plank"></div>
    </div>`).join('')}
  </section>
  ${this.error ? `<p class="error" role="alert">${esc(this.error)}</p>` : ''}
  <section class="demo">
    <div class="demo-head">
      <h2>¿Qué es la lectura biónica?</h2>
      <label class="switch"><input type="checkbox" data-demo ${this.demoBionic ? 'checked' : ''} /><span>Activar</span></label>
    </div>
    <p class="sample${this.demoBionic ? '' : ' plain'}">${this.demoBionic ? toBionicHtml(DEMO_TEXT, 0.5) : esc(DEMO_TEXT)}</p>
  </section>
  <input type="file" accept="application/pdf,.pdf" hidden data-file />
</div>`;

    this.root.onclick = e => this.onClick(e);
    this.root.onkeydown = e => { if (e.key === 'Enter' && (e.target as HTMLElement).dataset['remove']) this.onClick(e as unknown as MouseEvent); };
    $('[data-demo]', this.root).onchange = () => { this.demoBionic = !this.demoBionic; this.render(); };
    $<HTMLInputElement>('[data-file]', this.root).onchange = e => this.onFile(e);
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-remove],[data-add],[data-open]');
    if (!t) return;
    if (t.dataset['remove']) {
      e.stopPropagation();
      const book = this.library.get(t.dataset['remove']);
      if (book && confirm(`¿Quitar "${book.title}" del librero?`)) this.library.remove(book.id).then(() => this.render());
    } else if ('add' in t.dataset) {
      $('[data-file]', this.root).click();
    } else if (t.dataset['open']) {
      location.hash = '#/leer/' + encodeURIComponent(t.dataset['open']);
    }
  }

  private async onFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { this.error = 'Solo se pueden añadir archivos PDF.'; this.render(); return; }
    this.busy = true; this.busyPct = 0; this.error = ''; this.render();
    try {
      const book = await importPdf(file, pct => { this.busyPct = pct; $('.add .plus', this.root).textContent = pct + '%'; });
      await this.library.add({ ...book, id: 'local-' + Date.now().toString(36), cover: this.library.nextCover(), local: true });
    } catch (err) {
      this.error = 'No se pudo leer el PDF. ' + (err instanceof Error ? err.message : '');
    } finally {
      this.busy = false; this.render();
    }
  }
}

/* ------------------------------------------------------------------ reader */

interface Chunk { start: number; end: number; }
type Pending = { type: 'first' } | { type: 'last' } | { type: 'index'; index: number } | { type: 'screen'; screen: number };

class Reader {
  private flow: Paragraph[];
  private chunks: Chunk[];
  private chunk = 0;
  private screen = 0;
  private screens = 1;
  private index = 0;
  private size = { w: 0, h: 0 };
  private pending: Pending = { type: 'first' };
  private showSettings = false;
  private showChrome = true;
  private el!: HTMLElement;
  private columns!: HTMLElement;
  private stage!: HTMLElement;
  private observer?: ResizeObserver;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private pageTurn?: PageTurn;
  private readonly toc: TocEntry[];
  private readonly speed = new ReadingSpeed();
  private showToc = false;
  private tts?: ReadAloud;
  private ttsOpen = false;
  private ttsMsg = '';
  private rsvp?: Rsvp;
  private wakeLock?: { release(): Promise<void> };
  private readonly onKey = (e: KeyboardEvent) => this.key(e);
  private readonly onVisibility = () => { if (document.hidden) this.speed.pause(); else this.requestWakeLock(); };

  constructor(private root: HTMLElement, private library: Library, private book: StoredBook) {
    this.flow = book.flow;
    this.chunks = buildChunks(this.flow);
    this.toc = buildToc(this.flow);
  }

  mount(): void {
    const s = this.library.settings;
    this.root.innerHTML = `
<div class="reader" data-theme="${s.theme}">
  <header class="bar top">
    <a href="#/" class="icon-btn" aria-label="Volver a la biblioteca">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="22" height="22" fill="currentColor"><path d="M400-80 0-480l400-400 71 71-329 329 329 329-71 71Z"/></svg>
    </a>
    <div class="book-title"><span class="t">${esc(this.book.title)}</span><span class="a">${esc(this.book.author)}</span></div>
    <div class="actions">
      <button type="button" class="icon-btn toc-btn" data-act="toc" aria-label="Índice" title="Índice">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M320-240v-80h480v80H320Zm0-200v-80h480v80H320Zm0-200v-80h480v80H320ZM160-200q-33 0-56.5-23.5T80-280q0-33 23.5-56.5T160-360q33 0 56.5 23.5T240-280q0 33-23.5 56.5T160-200Zm0-200q-33 0-56.5-23.5T80-480q0-33 23.5-56.5T160-560q33 0 56.5 23.5T240-480q0 33-23.5 56.5T160-400Zm0-200q-33 0-56.5-23.5T80-680q0-33 23.5-56.5T160-760q33 0 56.5 23.5T240-680q0 33-23.5 56.5T160-600Z"/></svg>
      </button>
      <button type="button" class="icon-btn voice" data-act="voice" aria-label="Leer en voz alta" title="Leer en voz alta">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M560-131v-82q90-26 145-100t55-168q0-94-55-168T560-749v-82q124 28 202 125.5T840-481q0 127-78 224.5T560-131ZM120-360v-240h160l200-200v640L280-360H120Zm440 40v-322q47 22 73.5 66t26.5 96q0 51-26.5 94.5T560-320Z"/></svg>
      </button>
      <button type="button" class="icon-btn aa" data-act="settings" aria-label="Ajustes de lectura">Aa</button>
    </div>
  </header>
  <div class="settings-slot"></div>
  <div class="toc-slot"></div>
  <main class="viewport"><div class="stage"><div class="columns" lang="es"></div></div></main>
  <div class="tts-slot"></div>
  <footer class="bar bottom">
    <input class="slider" type="range" min="1" max="${this.book.pages || 1}" value="1" aria-label="Ir a página" />
    <div class="status">
      <button type="button" class="nav" data-act="prev" aria-label="Página anterior">‹</button>
      <span class="status-text"></span>
      <button type="button" class="nav" data-act="next" aria-label="Página siguiente">›</button>
    </div>
    <div class="eta"></div>
  </footer>
  <div class="warmth"></div>
  <div class="rsvp-slot"></div>
</div>`;
    this.el = $('.reader', this.root);
    this.columns = $('.columns', this.el);
    this.stage = $('.stage', this.el);

    this.el.addEventListener('click', e => this.click(e));
    this.el.addEventListener('input', e => this.input(e));
    this.el.addEventListener('change', e => this.change(e));
    window.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVisibility);

    const progress = this.library.progress(this.book.id);
    const index = progress ? Math.min(Math.max(0, progress.index ?? this.indexOfPage(progress.page)), this.flow.length - 1) : 0;
    this.applyTypography();
    this.observeSize();
    this.pageTurn = new PageTurn({
      stage: this.stage,
      columns: () => this.columns,
      screen: () => this.screen,
      stride: () => this.size.w + GAP,
      inline: dir => (dir === 1 ? this.screen < this.screens - 1 : this.screen > 0),
      canTurn: dir => dir === 1 ? !this.isLast() : !this.isFirst(),
      turn: dir => this.advance(dir),
      snapshot: () => ({ chunk: this.chunk, screen: this.screen }),
      restore: snap => {
        const { chunk, screen } = snap as { chunk: number; screen: number };
        if (chunk === this.chunk) this.setScreen(screen);
        else this.setChunk(chunk, { type: 'screen', screen });
      },
    });
    this.pageTurn.attach();
    this.goToIndex(index);
    this.requestWakeLock();
  }

  unmount(): void {
    this.tts?.stop();
    this.rsvp?.pause();
    this.speed.pause();
    this.wakeLock?.release().catch(() => undefined);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.pageTurn?.detach();
    window.removeEventListener('keydown', this.onKey);
    this.observer?.disconnect();
    clearTimeout(this.saveTimer);
    this.save();
  }

  /* --- derived state --- */
  private page(): number { return this.flow[this.index]?.page ?? 1; }
  private percent(): number {
    if (!this.flow.length) return 0;
    if (this.isLast()) return 100;
    return Math.min(99, Math.floor((this.index / this.flow.length) * 100));
  }
  private isFirst(): boolean { return this.chunk === 0 && this.screen === 0; }
  private isLast(): boolean { return this.chunk >= this.chunks.length - 1 && this.screen >= this.screens - 1; }

  /* --- events --- */
  private key(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (this.rsvp) {
      if (e.key === 'Escape') this.closeRsvp();
      else if (e.key === ' ') { this.rsvp.playing ? this.rsvp.pause() : this.rsvp.play(); this.renderRsvpControls(); e.preventDefault(); }
      return;
    }
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': this.next(); e.preventDefault(); break;
      case 'ArrowLeft': case 'PageUp': this.prev(); e.preventDefault(); break;
      case 'Escape': this.toggleSettings(false); this.toggleToc(false); break;
    }
  }

  private change(e: Event): void {
    const t = e.target as HTMLElement;
    if (t.classList.contains('slider')) {
      const page = Number((t as HTMLInputElement).value);
      if (page !== this.page()) this.goToIndex(this.indexOfPage(page));
    } else if (t.dataset['act'] === 'tts-voice' && this.tts) {
      this.tts.voiceName = (t as HTMLSelectElement).value;
      if (this.tts.active) this.tts.start(this.tts.current);
    } else if (t.dataset['act'] === 'bionic') {
      this.action('bionic', t);
    }
  }

  private input(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.dataset['act'] === 'warmth') { this.library.updateSettings({ warmth: Number(t.value) }); this.applyWarmth(); }
    else if (t.dataset['act'] === 'rsvp-wpm' && this.rsvp) { this.rsvp.wpm = Number(t.value); $('.rsvp .wpm span', this.el).textContent = `${this.rsvp.wpm} ppm`; }
  }

  private click(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const actEl = target.closest<HTMLElement>('[data-act]');
    const act = actEl?.dataset['act'];
    if (act && !(actEl instanceof HTMLInputElement) && !(actEl instanceof HTMLSelectElement)) { this.action(act, actEl!); return; }
    if (target.closest('.settings, .toc, .tts, .rsvp')) return;
    if (!target.closest('.viewport')) return;
    if (this.showSettings || this.showToc) { this.toggleSettings(false); this.toggleToc(false); return; }
    const r = this.stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.3) this.prev();
    else if (x > 0.7) this.next();
    else { this.showChrome = !this.showChrome; this.el.classList.toggle('chrome-hidden', !this.showChrome); }
  }

  private action(act: string, el: HTMLElement): void {
    const s = this.library.settings;
    switch (act) {
      case 'prev': this.prev(); break;
      case 'next': this.next(); break;
      case 'settings': this.toggleToc(false); this.toggleSettings(!this.showSettings); break;
      case 'toc': this.toggleSettings(false); this.toggleToc(!this.showToc); break;
      case 'toc-go': this.toggleToc(false); this.goToIndex(Number(el.dataset['value'])); break;
      case 'voice': this.toggleTts(!this.ttsOpen); break;
      case 'tts-play': this.ttsPlayPause(); break;
      case 'tts-stop': this.tts?.stop(); this.clearSpeaking(); this.renderTts(); break;
      case 'tts-rate': if (this.tts) { this.tts.rate = Math.round(Math.min(2, Math.max(0.6, this.tts.rate + Number(el.dataset['value']))) * 10) / 10; if (this.tts.active) this.tts.start(this.tts.current); this.renderTts(); } break;
      case 'rsvp': this.toggleSettings(false); this.openRsvp(); break;
      case 'rsvp-close': this.closeRsvp(); break;
      case 'rsvp-play': if (this.rsvp) { this.rsvp.playing ? this.rsvp.pause() : this.rsvp.play(); this.renderRsvpControls(); } break;
      case 'rsvp-back': this.rsvp?.back(); break;
      case 'rsvp-step': if (this.rsvp) { this.rsvp.wpm = Math.min(800, Math.max(100, this.rsvp.wpm + Number(el.dataset['value']))); this.renderRsvpControls(); } break;
      case 'fullscreen': this.toggleFullscreen(); break;
      case 'bionic': this.anchor(); this.library.updateSettings({ bionic: !s.bionic }); this.applyTypography(); break;
      case 'theme': this.library.updateSettings({ theme: el.dataset['value'] as ReaderTheme }); this.applyTypography(); break;
      case 'font': this.anchor(); this.library.updateSettings({ font: el.dataset['value'] as ReaderFont }); this.applyTypography(); break;
      case 'fixation': this.anchor(); this.library.updateSettings({ fixation: Number(el.dataset['value']) }); this.applyTypography(); break;
      case 'size': this.anchor(); this.library.updateSettings({ fontSize: Math.min(34, Math.max(14, s.fontSize + Number(el.dataset['value']))) }); this.applyTypography(); break;
      case 'leading': this.anchor(); this.library.updateSettings({ lineHeight: Math.round(Math.min(2.2, Math.max(1.2, s.lineHeight + Number(el.dataset['value']))) * 10) / 10 }); this.applyTypography(); break;
    }
  }

  private toggleSettings(open: boolean): void {
    this.showSettings = open;
    this.renderSettings();
  }

  private renderSettings(): void {
    const slot = $('.settings-slot', this.el);
    if (!this.showSettings) { slot.innerHTML = ''; return; }
    const s = this.library.settings;
    const themes: [ReaderTheme, string][] = [['white', 'Blanco'], ['sepia', 'Sepia'], ['green', 'Verde'], ['dark', 'Oscuro']];
    const fixations: [number, string][] = [[0.35, 'Baja'], [0.5, 'Media'], [0.65, 'Alta']];
    slot.innerHTML = `
<div class="settings" role="dialog" aria-label="Ajustes de lectura">
  <div class="row"><span class="label">Tema</span><div class="themes">
    ${themes.map(([id, label]) => `<button type="button" class="theme${s.theme === id ? ' active' : ''}" data-theme="${id}" data-act="theme" data-value="${id}" title="${label}">Aa</button>`).join('')}
  </div></div>
  <div class="row"><span class="label">Luz cálida</span>
    <input type="range" class="warm" min="0" max="100" value="${s.warmth}" data-act="warmth" aria-label="Luz cálida" />
  </div>
  <div class="row"><span class="label">Fuente</span><div class="seg fonts">
    <button type="button" class="${s.font === 'serif' ? 'active' : ''}" data-act="font" data-value="serif" style="font-family:'Literata',Georgia,serif" title="Serif clásica">Literata</button>
    <button type="button" class="${s.font === 'lexend' ? 'active' : ''}" data-act="font" data-value="lexend" style="font-family:'Lexend',sans-serif" title="Diseñada para leer con fluidez">Lexend</button>
    <button type="button" class="${s.font === 'atkinson' ? 'active' : ''}" data-act="font" data-value="atkinson" style="font-family:'Atkinson Hyperlegible',sans-serif" title="Letras que no se confunden entre sí">Atkinson</button>
    <button type="button" class="${s.font === 'sans' ? 'active' : ''}" data-act="font" data-value="sans" style="font-family:system-ui,sans-serif">Sistema</button>
  </div></div>
  <div class="row"><span class="label">Tamaño</span><div class="stepper">
    <button type="button" data-act="size" data-value="-2" aria-label="Reducir texto">A−</button><span>${s.fontSize}</span><button type="button" data-act="size" data-value="2" aria-label="Aumentar texto">A+</button>
  </div></div>
  <div class="row"><span class="label">Interlineado</span><div class="stepper">
    <button type="button" data-act="leading" data-value="-0.1" aria-label="Menos espacio">−</button><span>${s.lineHeight}</span><button type="button" data-act="leading" data-value="0.1" aria-label="Más espacio">+</button>
  </div></div>
  <div class="row"><span class="label">Lectura biónica</span>
    <label class="switch"><input type="checkbox" data-act="bionic" ${s.bionic ? 'checked' : ''} /><span class="track"><span class="knob"></span></span></label>
  </div>
  <div class="row${s.bionic ? '' : ' disabled'}"><span class="label">Intensidad</span><div class="seg">
    ${fixations.map(([v, label]) => `<button type="button" class="${s.fixation === v ? 'active' : ''}" data-act="fixation" data-value="${v}" ${s.bionic ? '' : 'disabled'}>${label}</button>`).join('')}
  </div></div>
  <div class="row"><span class="label">Modo ráfaga</span><button type="button" data-act="rsvp" title="Una palabra a la vez, a la velocidad que elijas">Leer palabra a palabra</button></div>
  ${document.fullscreenEnabled ? `<div class="row"><span class="label">Pantalla</span><button type="button" data-act="fullscreen">${document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa'}</button></div>` : ''}
</div>`;
  }

  /* --- rendering --- */
  private applyTypography(): void {
    const s = this.library.settings;
    this.el.dataset['theme'] = s.theme;
    for (const f of ['sans', 'lexend', 'atkinson']) this.el.classList.toggle(f, s.font === f);
    this.applyWarmth();
    this.el.style.setProperty('--font-size', s.fontSize + 'px');
    this.el.style.setProperty('--line-height', String(s.lineHeight));
    this.renderChunk();
    if (this.showSettings) this.renderSettings();
  }

  private readonly htmlCache = new Map<string, string>();

  /** HTML of a chunk for the current typography, memoised so neighbouring chunks can be prepared ahead. */
  private chunkHtml(index: number): string {
    const s = this.library.settings;
    const c = this.chunks[index];
    if (!c) return '';
    const key = `${index}|${s.bionic ? s.fixation : 'plain'}`;
    let html = this.htmlCache.get(key);
    if (html === undefined) {
      const parts: string[] = [];
      for (let i = c.start; i < c.end; i++) {
        const p = this.flow[i];
        parts.push(`<${p.kind} data-i="${i}">${s.bionic ? toBionicHtml(p.text, s.fixation) : toPlainHtml(p.text)}</${p.kind}>`);
      }
      html = parts.join('');
      if (this.htmlCache.size > 12) this.htmlCache.clear();
      this.htmlCache.set(key, html);
    }
    return html;
  }

  private renderChunk(): void {
    this.columns.innerHTML = this.chunkHtml(this.chunk);
    requestAnimationFrame(() => this.measure());
    const chunk = this.chunk;
    setTimeout(() => { this.chunkHtml(chunk + 1); this.chunkHtml(chunk - 1); }, 80);
  }

  private layout(): void {
    const { w, h } = this.size;
    this.columns.style.width = w ? w + 'px' : '';
    this.columns.style.height = h ? h + 'px' : '';
    this.columns.style.columnWidth = w ? w + 'px' : '';
    this.columns.style.transform = `translateX(${-this.screen * (w + GAP)}px)`;
    $('.status-text', this.el).textContent = `Página ${this.page()} de ${this.book.pages || '…'} · ${this.percent()}%`;
    const slider = $<HTMLInputElement>('.slider', this.el);
    slider.value = String(this.page());
    slider.style.setProperty('--p', this.percent() + '%');
    $<HTMLButtonElement>('[data-act="prev"]', this.el).disabled = this.isFirst();
    $<HTMLButtonElement>('[data-act="next"]', this.el).disabled = this.isLast();
    $('.eta', this.el).textContent = this.etaText();
    if (this.showToc) this.renderToc();
  }

  /* --- time left --- */
  private chunkWords = new Map<number, number>();
  private wordsOf(from: number, to: number): number {
    let n = 0;
    for (let i = from; i < to; i++) n += countWords(this.flow[i].text);
    return n;
  }
  private wordsPerScreen(): number {
    const c = this.chunks[this.chunk];
    let words = this.chunkWords.get(this.chunk);
    if (words === undefined) { words = this.wordsOf(c.start, c.end); this.chunkWords.set(this.chunk, words); }
    return Math.max(1, Math.round(words / Math.max(1, this.screens)));
  }
  private etaText(): string {
    if (!this.flow.length) return '';
    const end = chapterEnd(this.toc, this.index, this.flow.length);
    const chapter = this.speed.minutesFor(this.wordsOf(this.index, end));
    const book = this.speed.minutesFor(this.wordsOf(this.index, this.flow.length));
    return `≈ ${formatMinutes(chapter)} para acabar el capítulo · ${formatMinutes(book)} para acabar el libro`;
  }

  /* --- warm light, wake lock, fullscreen --- */
  private applyWarmth(): void {
    $('.warmth', this.el).style.opacity = String((this.library.settings.warmth / 100) * 0.45);
  }
  private async requestWakeLock(): Promise<void> {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      if (!nav.wakeLock || document.hidden) return;
      this.wakeLock = await nav.wakeLock.request('screen');
    } catch { /* not allowed here */ }
  }
  private toggleFullscreen(): void {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen().catch(() => undefined);
    setTimeout(() => this.showSettings && this.renderSettings(), 300);
  }

  /* --- table of contents --- */
  private toggleToc(open: boolean): void {
    this.showToc = open;
    this.renderToc();
  }
  private renderToc(): void {
    const slot = $('.toc-slot', this.el);
    if (!this.showToc) { slot.innerHTML = ''; return; }
    const current = chapterStart(this.toc, this.index);
    slot.innerHTML = `<nav class="toc" aria-label="Índice"><h3>Índice</h3>${
      this.toc.length ? this.toc.map(e => `<button type="button" class="l${e.level}${e.index === current ? ' current' : ''}" data-act="toc-go" data-value="${e.index}">
        <span class="t">${esc(e.title)}${e.subtitle ? `<span class="s">${esc(e.subtitle)}</span>` : ''}</span><span class="pg">${e.page}</span></button>`).join('')
      : '<p class="empty">Este libro no tiene capítulos detectados.</p>'}</nav>`;
    slot.querySelector('.current')?.scrollIntoView({ block: 'center' });
  }

  /* --- read aloud --- */
  private toggleTts(open: boolean): void {
    this.ttsOpen = open;
    if (!open) { this.tts?.stop(); this.clearSpeaking(); }
    this.renderTts();
  }
  private ensureTts(): ReadAloud {
    if (!this.tts) {
      this.tts = new ReadAloud(i => this.flow[i]?.text, {
        paragraph: i => this.showSpeaking(i),
        word: (i, start, end) => {
          const el = this.columns.querySelector<HTMLElement>(`[data-i="${i}"]`);
          highlightRange('tts-word', el ? rangeForText(el, start, end) : null);
        },
        end: () => { this.clearSpeaking(); this.renderTts(); },
        error: msg => { this.ttsMsg = msg; this.clearSpeaking(); this.renderTts(); },
      });
      if (ReadAloud.supported()) speechSynthesis.addEventListener('voiceschanged', () => this.ttsOpen && this.renderTts(), { once: true });
    }
    return this.tts;
  }
  private ttsPlayPause(): void {
    const tts = this.ensureTts();
    this.ttsMsg = '';
    if (!tts.active) tts.start(this.index);
    else if (tts.isPaused) tts.resume();
    else tts.pause();
    this.renderTts();
  }
  private showSpeaking(i: number): void {
    this.clearSpeaking();
    let el = this.columns.querySelector<HTMLElement>(`[data-i="${i}"]`);
    const c = this.chunks[this.chunk];
    if (!el || i < c.start || i >= c.end || this.columnOf(el) !== this.screen) {
      // Paragraph not on this screen: bring the reader to it (same chunk: just the screen).
      if (el && i >= c.start && i < c.end) this.setScreen(this.columnOf(el));
      else { this.goToIndex(i); el = null; }
    }
    if (el) el.classList.add('speaking');
    else requestAnimationFrame(() => this.columns.querySelector(`[data-i="${i}"]`)?.classList.add('speaking'));
  }
  private clearSpeaking(): void {
    highlightRange('tts-word', null);
    this.columns.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking'));
  }
  private renderTts(): void {
    const slot = $('.tts-slot', this.el);
    $('.icon-btn.voice', this.el).classList.toggle('on', this.ttsOpen);
    if (!this.ttsOpen) { slot.innerHTML = ''; return; }
    const tts = this.ensureTts();
    const voices = ReadAloud.voices();
    const playing = tts.active && !tts.isPaused;
    slot.innerHTML = `<div class="tts" role="region" aria-label="Lectura en voz alta">
      <button type="button" class="play" data-act="tts-play" aria-label="${playing ? 'Pausar' : 'Leer'}">${playing ? '❚❚' : '▶'}</button>
      <button type="button" class="sec" data-act="tts-stop">Detener</button>
      <div class="rate"><button type="button" class="sec" data-act="tts-rate" data-value="-0.1" aria-label="Más lento">−</button><span>${tts.rate.toFixed(1)}×</span><button type="button" class="sec" data-act="tts-rate" data-value="0.1" aria-label="Más rápido">+</button></div>
      ${voices.length ? `<select data-act="tts-voice" aria-label="Voz">${voices.map(v => `<option value="${esc(v.name)}" ${v.name === tts.voiceName ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>` : ''}
      ${this.ttsMsg ? `<span class="msg">${esc(this.ttsMsg)}</span>` : (!ReadAloud.supported() ? '<span class="msg">Este navegador no puede leer en voz alta.</span>' : (!voices.length ? '<span class="msg">No hay voces instaladas en este dispositivo.</span>' : ''))}
    </div>`;
  }

  /* --- burst mode (RSVP) --- */
  private openRsvp(): void {
    this.tts?.stop(); this.clearSpeaking(); this.renderTts();
    const words = rsvpWords(this.flow, this.index);
    if (!words.length) return;
    const slot = $('.rsvp-slot', this.el);
    slot.innerHTML = `<div class="rsvp" role="dialog" aria-label="Modo ráfaga">
      <div class="rsvp-top"><span>Modo ráfaga · una palabra a la vez</span><button type="button" class="icon-btn" data-act="rsvp-close" aria-label="Cerrar">✕</button></div>
      <div class="rsvp-stage" data-act="rsvp-play"><div class="rsvp-rule rule-top"></div><div class="rsvp-word"><span class="l"></span><span class="o"></span><span class="r"></span></div><div class="rsvp-rule rule-bottom"></div>
        <div class="rsvp-hint">Toca para pausar o continuar. Por encima de 400 ppm la comprensión baja.</div></div>
      <div class="rsvp-bar"><i style="width:0%"></i></div>
      <div class="rsvp-controls"></div>
    </div>`;
    this.rsvp = new Rsvp(words, (w, pos) => this.showRsvpWord(w, pos), () => this.renderRsvpControls());
    this.rsvp.wpm = Number(read('bionic-reader:rsvp-wpm', 300)) || 300;
    this.rsvp.seek(0);
    this.renderRsvpControls();
    this.rsvp.play();
    this.renderRsvpControls();
  }
  private showRsvpWord(w: RsvpWord, pos: number): void {
    const letters = Array.from(w.text);
    $('.rsvp-word .l', this.el).textContent = letters.slice(0, w.orp).join('');
    $('.rsvp-word .o', this.el).textContent = letters[w.orp] ?? '';
    $('.rsvp-word .r', this.el).textContent = letters.slice(w.orp + 1).join('');
    $('.rsvp-bar i', this.el).style.width = `${(pos / Math.max(1, this.rsvp!.length - 1)) * 100}%`;
  }
  private renderRsvpControls(): void {
    const r = this.rsvp;
    const box = this.el.querySelector<HTMLElement>('.rsvp-controls');
    if (!r || !box) return;
    write('bionic-reader:rsvp-wpm', r.wpm);
    box.innerHTML = `
      <button type="button" data-act="rsvp-back" title="Frase anterior">↺ Frase</button>
      <button type="button" class="play" data-act="rsvp-play">${r.playing ? 'Pausar' : (r.position >= r.length - 1 ? 'Fin' : 'Continuar')}</button>
      <div class="wpm"><button type="button" data-act="rsvp-step" data-value="-25" aria-label="Más lento">−</button>
        <input type="range" min="100" max="800" step="25" value="${r.wpm}" data-act="rsvp-wpm" aria-label="Palabras por minuto" /><span>${r.wpm} ppm</span>
        <button type="button" data-act="rsvp-step" data-value="25" aria-label="Más rápido">+</button></div>`;
  }
  private closeRsvp(): void {
    const r = this.rsvp;
    if (!r) return;
    r.pause();
    const w = rsvpWords(this.flow, this.index)[r.position];
    this.rsvp = undefined;
    $('.rsvp-slot', this.el).innerHTML = '';
    if (w && w.paragraph !== this.index) this.goToIndex(w.paragraph);
  }

  private observeSize(): void {
    const update = () => {
      if (this.size.w) this.anchor();
      this.size = { w: this.stage.clientWidth, h: this.stage.clientHeight };
      this.layout();
      requestAnimationFrame(() => this.measure());
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(update);
      this.observer.observe(this.stage);
    }
  }

  /* --- navigation --- */
  next(): void { this.pageTurn ? this.pageTurn.flip(1) : this.advance(1); }
  prev(): void { this.pageTurn ? this.pageTurn.flip(-1) : this.advance(-1); }

  private advance(dir: TurnDirection): void {
    if (dir === 1) {
      if (this.screen < this.screens - 1) this.setScreen(this.screen + 1);
      else if (this.chunk < this.chunks.length - 1) this.setChunk(this.chunk + 1, { type: 'first' });
    } else {
      if (this.screen > 0) this.setScreen(this.screen - 1);
      else if (this.chunk > 0) this.setChunk(this.chunk - 1, { type: 'last' });
    }
  }

  private setScreen(screen: number): void {
    this.screen = screen;
    const top = this.topIndex(screen);
    if (top !== null) this.index = top;
    this.speed.screenShown(this.wordsPerScreen());
    this.layout();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 300);
  }

  private anchor(): void { this.pending = { type: 'index', index: this.index }; }

  private goToIndex(index: number): void {
    const chunk = this.chunks.findIndex(c => index >= c.start && index < c.end);
    this.setChunk(Math.max(0, chunk), { type: 'index', index });
  }

  private setChunk(chunk: number, pending: Pending): void {
    this.pending = pending;
    if (chunk !== this.chunk || !this.columns.childElementCount) {
      this.chunk = chunk;
      this.screen = 0;
      this.renderChunk();
    } else {
      this.measure();
    }
  }

  private indexOfPage(page: number): number {
    const i = this.flow.findIndex(p => p.page >= page);
    return i < 0 ? Math.max(0, this.flow.length - 1) : i;
  }

  private columnOf(el: HTMLElement): number { return Math.round(el.offsetLeft / (this.size.w + GAP)); }

  private topIndex(screen: number): number | null {
    if (!this.size.w) return null;
    let found: number | null = null;
    for (const child of Array.from(this.columns.children) as HTMLElement[]) {
      const col = this.columnOf(child);
      if (col > screen) break;
      found = Number(child.dataset['i']);
      if (col === screen) break;
    }
    return found;
  }

  private measure(): void {
    const { w } = this.size;
    if (!w) return;
    this.screens = Math.max(1, Math.round((this.columns.scrollWidth + GAP) / (w + GAP)));
    const pending = this.pending;
    this.pending = { type: 'first' };
    let screen = this.screen;
    if (pending.type === 'last') screen = this.screens - 1;
    else if (pending.type === 'screen') screen = pending.screen;
    else if (pending.type === 'index') {
      const target = this.columns.querySelector<HTMLElement>(`[data-i="${pending.index}"]`);
      if (target) screen = this.columnOf(target);
    }
    this.setScreen(Math.min(Math.max(0, screen), this.screens - 1));
  }

  private save(): void {
    if (!this.flow.length) return;
    this.library.saveProgress(this.book.id, {
      page: this.page(), index: this.index, percent: this.percent(), totalPages: this.book.pages, updatedAt: Date.now(),
    });
  }
}

function buildChunks(flow: Paragraph[]): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  for (let i = 1; i < flow.length; i++) {
    const heading = flow[i].kind === 'h1' || flow[i].kind === 'h2';
    if ((heading && i - start >= MIN_CHUNK) || i - start >= MAX_CHUNK) { chunks.push({ start, end: i }); start = i; }
  }
  chunks.push({ start, end: flow.length });
  return chunks;
}

/* ------------------------------------------------------------------ router */

async function main(): Promise<void> {
  const root = $('#app');
  const library = new Library();
  await library.load();
  let reader: Reader | undefined;

  const route = () => {
    reader?.unmount();
    reader = undefined;
    const m = /^#\/leer\/(.+)$/.exec(location.hash);
    const book = m ? library.get(decodeURIComponent(m[1])) : undefined;
    document.body.classList.toggle('reading', !!book);
    if (book) {
      reader = new Reader(root, library, book);
      reader.mount();
    } else {
      if (m) location.hash = '#/';
      new Shelf(root, library).render();
    }
  };
  window.addEventListener('hashchange', route);
  route();
}

main();
