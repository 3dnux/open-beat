import { Injectable } from '@angular/core';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api';
import { Paragraph } from './models';
import { PageLines, assembleFlow, buildLines } from './pdf-paragraphs';

/** Resolve an app-relative asset path against <base href>, not the current route. */
function assetUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

pdfjs.GlobalWorkerOptions.workerSrc = assetUrl('assets/pdfjs/pdf.worker.min.mjs');

/**
 * Opens PDF files with pdf.js and turns them into a flow of readable
 * paragraphs (see pdf-paragraphs.ts for the reconstruction rules).
 */
@Injectable({ providedIn: 'root' })
export class PdfTextService {
  private docs = new Map<string, Promise<PDFDocumentProxy>>();
  private tasks = new Map<string, PDFDocumentLoadingTask>();
  private flows = new Map<string, Promise<Paragraph[]>>();

  async open(id: string, source: string | ArrayBuffer): Promise<PDFDocumentProxy> {
    let p = this.docs.get(id);
    if (!p) {
      const params = typeof source === 'string' ? { url: assetUrl(source) } : { data: new Uint8Array(source.slice(0)) };
      const task = pdfjs.getDocument({ ...params, disableFontFace: true, useSystemFonts: false });
      p = task.promise;
      this.tasks.set(id, task);
      this.docs.set(id, p);
      p.catch(() => { this.docs.delete(id); this.tasks.delete(id); });
    }
    return p;
  }

  async metadata(id: string): Promise<{ title?: string; author?: string }> {
    const doc = await this.docs.get(id);
    if (!doc) return {};
    try {
      const meta = await doc.getMetadata();
      const info = (meta.info ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
      return { title: str(info['Title']), author: str(info['Author']) };
    } catch {
      return {};
    }
  }

  /**
   * Whole book as a single flow of paragraphs (cached in memory per book).
   * `onProgress` receives the number of pages processed so far.
   */
  flow(id: string, onProgress?: (done: number, total: number) => void): Promise<Paragraph[]> {
    let p = this.flows.get(id);
    if (!p) {
      p = this.extractAll(id, onProgress);
      this.flows.set(id, p);
      p.catch(() => this.flows.delete(id));
    }
    return p;
  }

  /** Positioned text lines of a single page (1-based). */
  private async pageLines(doc: PDFDocumentProxy, pageNumber: number): Promise<PageLines> {
    const page = await doc.getPage(pageNumber);
    const height = page.view[3] - page.view[1];
    const width = page.view[2] - page.view[0];
    const content = await page.getTextContent();
    const items = content.items.filter((it): it is TextItem => 'str' in it);
    const lines = buildLines(items);
    page.cleanup();
    return { lines, width, height };
  }

  /** Release the document; the extracted flow stays cached for quick reopening. */
  close(id: string): void {
    const task = this.tasks.get(id);
    this.docs.delete(id);
    this.tasks.delete(id);
    task?.destroy().catch(() => undefined);
  }

  private async extractAll(id: string, onProgress?: (done: number, total: number) => void): Promise<Paragraph[]> {
    const docPromise = this.docs.get(id);
    if (!docPromise) throw new Error('El libro no está abierto');
    const doc = await docPromise;
    const total = doc.numPages;
    // Pass 1: collect lines and measure the body typography of the whole book.
    const pages: PageLines[] = [];
    for (let n = 1; n <= total; n++) {
      pages.push(await this.pageLines(doc, n));
      onProgress?.(n, total);
    }
    return assembleFlow(pages);
  }
}
