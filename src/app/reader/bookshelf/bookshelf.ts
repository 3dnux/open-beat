import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Book } from '../models';
import { LibraryService } from '../library.service';
import { PdfTextService } from '../pdf-text.service';
import { toBionicHtml } from '../bionic';

interface ShelfBook {
  book: Book;
  percent: number;
  page?: number;
}

const SHELF_SIZE = 4;
const DEMO_TEXT =
  'La lectura biónica resalta el inicio de cada palabra para guiar la vista. Tu cerebro completa el resto de la palabra y lees más rápido con menos esfuerzo.';

@Component({
  selector: 'app-bookshelf',
  imports: [RouterLink],
  templateUrl: './bookshelf.html',
  styleUrl: './bookshelf.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Bookshelf implements OnInit {
  private readonly library = inject(LibraryService);
  private readonly pdf = inject(PdfTextService);
  private readonly router = inject(Router);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly busy = signal(false);
  readonly error = signal('');
  readonly demoBionic = signal(true);
  readonly demoHtml = computed(() => (this.demoBionic() ? toBionicHtml(DEMO_TEXT, 0.5) : DEMO_TEXT));
  readonly tick = signal(0);

  readonly shelves = computed<ShelfBook[][]>(() => {
    this.tick();
    const items: ShelfBook[] = this.library.books().map(book => {
      const p = this.library.progress(book.id);
      const total = p?.totalPages ?? book.pages ?? 0;
      const byPage = p && total ? Math.round(((p.page - 1) / total) * 100) : 0;
      const percent = Math.min(100, p?.percent ?? byPage);
      return { book, percent, page: p?.page };
    });
    const rows: ShelfBook[][] = [];
    for (let i = 0; i < items.length; i += SHELF_SIZE) rows.push(items.slice(i, i + SHELF_SIZE));
    if (rows.length === 0) rows.push([]);
    return rows;
  });

  async ngOnInit(): Promise<void> {
    await this.library.load();
    this.tick.update(n => n + 1);
  }

  open(book: Book): void {
    this.router.navigate(['/leer', book.id]);
  }

  pickFile(): void {
    this.fileInput()?.nativeElement.click();
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      this.error.set('Solo se pueden añadir archivos PDF.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const book = await this.library.addPdf(file);
      try {
        const doc = await this.pdf.open(book.id, book.data!);
        const meta = await this.pdf.metadata(book.id);
        await this.library.updateBook({
          ...book,
          pages: doc.numPages,
          title: meta.title || book.title,
          author: meta.author || book.author,
        });
      } catch {
        await this.library.remove(book.id);
        throw new Error('No se pudo leer el PDF.');
      } finally {
        this.pdf.close(book.id);
      }
      this.tick.update(n => n + 1);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo añadir el libro.');
    } finally {
      this.busy.set(false);
    }
  }

  async remove(event: Event, book: Book): Promise<void> {
    event.stopPropagation();
    if (!confirm(`¿Quitar "${book.title}" del librero?`)) return;
    await this.library.remove(book.id);
    this.tick.update(n => n + 1);
  }

  trackId(_: number, item: ShelfBook): string {
    return item.book.id;
  }
}
