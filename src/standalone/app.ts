/**
 * Standalone, single-file build of the bionic reader (no Angular): a bookshelf
 * with embedded public-domain books plus a Kindle-style reader. Built by
 * scripts/build-standalone.mjs into one HTML page that can be published anywhere.
 */
import { toBionicHtml, toPlainHtml } from '../app/reader/bionic';
import { BookCover, DEFAULT_SETTINGS, Paragraph, ReaderFont, ReaderSettings, ReaderTheme, ReadingProgress } from '../app/reader/models';
import { PageLines, assembleFlow, buildLines } from '../app/reader/pdf-paragraphs';
import { PageTurn, TurnDirection } from '../app/reader/page-turn';

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
const MAX_CHUNK = 320;
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
  private readonly onKey = (e: KeyboardEvent) => this.key(e);

  constructor(private root: HTMLElement, private library: Library, private book: StoredBook) {
    this.flow = book.flow;
    this.chunks = buildChunks(this.flow);
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
      <button type="button" class="icon-btn bionic" data-act="bionic" title="Lectura biónica"><b>Bi</b>ónico</button>
      <button type="button" class="icon-btn aa" data-act="settings" aria-label="Ajustes de lectura">Aa</button>
    </div>
  </header>
  <div class="settings-slot"></div>
  <main class="viewport"><div class="stage"><div class="columns" lang="es"></div></div></main>
  <footer class="bar bottom">
    <input class="slider" type="range" min="1" max="${this.book.pages || 1}" value="1" aria-label="Ir a página" />
    <div class="status">
      <button type="button" class="nav" data-act="prev" aria-label="Página anterior">‹</button>
      <span class="status-text"></span>
      <button type="button" class="nav" data-act="next" aria-label="Página siguiente">›</button>
    </div>
  </footer>
</div>`;
    this.el = $('.reader', this.root);
    this.columns = $('.columns', this.el);
    this.stage = $('.stage', this.el);

    this.el.addEventListener('click', e => this.click(e));
    $<HTMLInputElement>('.slider', this.el).addEventListener('change', e => {
      const page = Number((e.target as HTMLInputElement).value);
      if (page !== this.page()) this.goToIndex(this.indexOfPage(page));
    });
    window.addEventListener('keydown', this.onKey);

    const progress = this.library.progress(this.book.id);
    const index = progress ? Math.min(Math.max(0, progress.index ?? this.indexOfPage(progress.page)), this.flow.length - 1) : 0;
    this.applyTypography();
    this.observeSize();
    this.pageTurn = new PageTurn({
      stage: this.stage,
      columns: () => this.columns,
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
  }

  unmount(): void {
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
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': this.next(); e.preventDefault(); break;
      case 'ArrowLeft': case 'PageUp': this.prev(); e.preventDefault(); break;
      case 'Escape': this.toggleSettings(false); break;
    }
  }

  private click(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset['act'];
    if (act) { this.action(act, target.closest<HTMLElement>('[data-act]')!); return; }
    if (target.closest('.settings')) return;
    if (!target.closest('.viewport')) return;
    if (this.showSettings) { this.toggleSettings(false); return; }
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
      case 'settings': this.toggleSettings(!this.showSettings); break;
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
  <div class="row"><span class="label">Fuente</span><div class="seg">
    <button type="button" class="${s.font === 'serif' ? 'active' : ''}" data-act="font" data-value="serif" style="font-family:'Literata',Georgia,serif">Serif</button>
    <button type="button" class="${s.font === 'sans' ? 'active' : ''}" data-act="font" data-value="sans" style="font-family:system-ui,sans-serif">Sans</button>
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
</div>`;
  }

  /* --- rendering --- */
  private applyTypography(): void {
    const s = this.library.settings;
    this.el.dataset['theme'] = s.theme;
    this.el.classList.toggle('sans', s.font === 'sans');
    this.el.style.setProperty('--font-size', s.fontSize + 'px');
    this.el.style.setProperty('--line-height', String(s.lineHeight));
    $('.icon-btn.bionic', this.el).classList.toggle('on', s.bionic);
    this.renderChunk();
    if (this.showSettings) this.renderSettings();
  }

  private renderChunk(): void {
    const s = this.library.settings;
    const c = this.chunks[this.chunk];
    const parts: string[] = [];
    for (let i = c.start; i < c.end; i++) {
      const p = this.flow[i];
      parts.push(`<${p.kind} data-i="${i}">${s.bionic ? toBionicHtml(p.text, s.fixation) : toPlainHtml(p.text)}</${p.kind}>`);
    }
    this.columns.innerHTML = parts.join('');
    requestAnimationFrame(() => this.measure());
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
