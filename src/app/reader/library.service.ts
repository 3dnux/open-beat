import { Injectable, signal } from '@angular/core';
import { Book, BookCover, DEFAULT_SETTINGS, ReaderSettings, ReadingProgress } from './models';

const DB_NAME = 'bionic-reader';
const STORE = 'books';
const PROGRESS_KEY = 'bionic-reader:progress:';
const SETTINGS_KEY = 'bionic-reader:settings';

const COVERS: BookCover[] = [
  { from: '#7a1f1f', to: '#3d0d0d', accent: '#d9a441', ink: '#f7e8c8' },
  { from: '#1e4d4a', to: '#0c2624', accent: '#c9b27c', ink: '#eef4ec' },
  { from: '#2d2140', to: '#120c1d', accent: '#e0893b', ink: '#f3e9dc' },
  { from: '#1f3a66', to: '#0d1b33', accent: '#f0c674', ink: '#eaf0ff' },
  { from: '#5a3d1e', to: '#2a1a0a', accent: '#e8d6a8', ink: '#f8f1e4' },
  { from: '#3a4a2a', to: '#18220f', accent: '#d8c36b', ink: '#f2f5e6' },
];

export const BUILT_IN_BOOKS: Book[] = [
  {
    id: 'lazarillo-de-tormes',
    title: 'Vida de Lazarillo de Tormes',
    author: 'Anónimo',
    year: '1554',
    src: 'assets/books/lazarillo-de-tormes.pdf',
    cover: COVERS[0],
    pages: 85,
  },
  {
    id: 'marianela',
    title: 'Marianela',
    author: 'Benito Pérez Galdós',
    year: '1878',
    src: 'assets/books/marianela.pdf',
    cover: COVERS[1],
    pages: 233,
  },
  {
    id: 'cuentos-de-amor-de-locura-y-de-muerte',
    title: 'Cuentos de amor, de locura y de muerte',
    author: 'Horacio Quiroga',
    year: '1917',
    src: 'assets/books/cuentos-de-amor-de-locura-y-de-muerte.pdf',
    cover: COVERS[2],
    pages: 241,
  },
];

/**
 * Book catalogue: built-in public-domain PDFs plus PDFs added by the user
 * (persisted in IndexedDB). Reading position and reader settings live in
 * localStorage.
 */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  readonly books = signal<Book[]>([...BUILT_IN_BOOKS]);
  readonly settings = signal<ReaderSettings>(this.loadSettings());
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const local = await this.allLocal();
      this.books.set([...BUILT_IN_BOOKS, ...local]);
    } catch {
      // IndexedDB unavailable (private mode, etc.): keep built-in books only.
    }
  }

  async get(id: string): Promise<Book | undefined> {
    const known = this.books().find(b => b.id === id);
    if (known) return known;
    await this.load();
    return this.books().find(b => b.id === id);
  }

  async addPdf(file: File, meta: { title?: string; author?: string } = {}): Promise<Book> {
    const data = await file.arrayBuffer();
    const id = 'local-' + Date.now().toString(36);
    const cover = COVERS[(this.books().length + 3) % COVERS.length];
    const book: Book = {
      id,
      title: meta.title || titleFromFileName(file.name),
      author: meta.author || 'PDF propio',
      data,
      cover,
      local: true,
    };
    try {
      const db = await this.db();
      await tx(db, 'readwrite', store => store.put({ ...book }));
    } catch {
      // keep it in memory only
    }
    this.books.update(list => [...list, book]);
    return book;
  }

  async updateBook(book: Book): Promise<void> {
    this.books.update(list => list.map(b => (b.id === book.id ? book : b)));
    if (!book.local) return;
    try {
      const db = await this.db();
      await tx(db, 'readwrite', store => store.put({ ...book }));
    } catch {
      // ignore
    }
  }

  async remove(id: string): Promise<void> {
    this.books.update(list => list.filter(b => b.id !== id));
    localStorage.removeItem(PROGRESS_KEY + id);
    try {
      const db = await this.db();
      await tx(db, 'readwrite', store => store.delete(id));
    } catch {
      // ignore
    }
  }

  progress(id: string): ReadingProgress | null {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY + id);
      return raw ? (JSON.parse(raw) as ReadingProgress) : null;
    } catch {
      return null;
    }
  }

  saveProgress(id: string, p: ReadingProgress): void {
    try {
      localStorage.setItem(PROGRESS_KEY + id, JSON.stringify(p));
    } catch {
      // ignore
    }
  }

  updateSettings(patch: Partial<ReaderSettings>): void {
    this.settings.update(s => ({ ...s, ...patch }));
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings()));
    } catch {
      // ignore
    }
  }

  private loadSettings(): ReaderSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ReaderSettings>) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private dbPromise?: Promise<IDBDatabase>;

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

  private async allLocal(): Promise<Book[]> {
    const db = await this.db();
    const books = await tx<Book[]>(db, 'readonly', store => store.getAll());
    return books.map(b => ({ ...b, local: true }));
  }
}

/** "mi_libro-favorito.pdf" -> "Mi libro favorito" */
function titleFromFileName(name: string): string {
  const base = name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'PDF sin título';
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
