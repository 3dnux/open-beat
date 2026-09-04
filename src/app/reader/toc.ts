import { Paragraph } from './models';

export interface TocEntry {
  /** Flow index of the heading. */
  index: number;
  title: string;
  subtitle?: string;
  page: number;
  level: 1 | 2;
}

/** Table of contents from the headings of the flow (h1/h2, with a following h3 as subtitle). */
export function buildToc(flow: Paragraph[]): TocEntry[] {
  const all = collect(flow);
  // Headings on the title page (book title, author) are not chapters.
  const titlePage = flow[0]?.page;
  const chapters = all.filter(e => e.page !== titlePage);
  return chapters.length ? chapters : all;
}

function collect(flow: Paragraph[]): TocEntry[] {
  const toc: TocEntry[] = [];
  for (let i = 0; i < flow.length; i++) {
    const p = flow[i];
    if (p.kind !== 'h1' && p.kind !== 'h2') continue;
    const next = flow[i + 1];
    toc.push({
      index: i,
      title: p.text,
      subtitle: next?.kind === 'h3' ? next.text : undefined,
      page: p.page,
      level: p.kind === 'h1' ? 1 : 2,
    });
  }
  return toc;
}

/** Index of the heading that starts the chapter containing `index`, or -1. */
export function chapterStart(toc: TocEntry[], index: number): number {
  let start = -1;
  for (const e of toc) { if (e.index <= index) start = e.index; else break; }
  return start;
}

/** Flow index where the next chapter starts (flow length when there is none). */
export function chapterEnd(toc: TocEntry[], index: number, flowLength: number): number {
  for (const e of toc) if (e.index > index) return e.index;
  return flowLength;
}
