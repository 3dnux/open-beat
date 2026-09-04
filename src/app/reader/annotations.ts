/**
 * Highlights and notes: stored per book in localStorage, rendered as <mark>
 * elements when a chunk's HTML is built, created from the user's text
 * selection.
 */

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';
export const HIGHLIGHT_COLORS: { id: HighlightColor; label: string }[] = [
  { id: 'yellow', label: 'Amarillo' },
  { id: 'green', label: 'Verde' },
  { id: 'blue', label: 'Azul' },
  { id: 'pink', label: 'Rosa' },
];

export interface Annotation {
  id: string;
  /** Flow index of the paragraph. */
  index: number;
  /** Character range inside the paragraph text. */
  start: number;
  end: number;
  text: string;
  color: HighlightColor;
  note?: string;
  createdAt: number;
}

const KEY = 'bionic-reader:notes:';

export class AnnotationStore {
  private items: Annotation[] = [];
  /** Bumped on every change so cached HTML can be invalidated. */
  version = 0;

  constructor(private readonly bookId: string) {
    try {
      const raw = localStorage.getItem(KEY + bookId);
      this.items = raw ? (JSON.parse(raw) as Annotation[]) : [];
    } catch { this.items = []; }
  }

  all(): Annotation[] { return this.items.slice().sort((a, b) => a.index - b.index || a.start - b.start); }
  get(id: string): Annotation | undefined { return this.items.find(a => a.id === id); }
  forParagraph(index: number): Annotation[] { return this.items.filter(a => a.index === index).sort((a, b) => a.start - b.start); }

  add(a: Omit<Annotation, 'id' | 'createdAt'>): Annotation {
    const item: Annotation = { ...a, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now() };
    // Replace overlapping highlights of the same paragraph.
    this.items = this.items.filter(o => !(o.index === a.index && o.start < a.end && a.start < o.end));
    this.items.push(item);
    this.save();
    return item;
  }

  update(id: string, patch: Partial<Annotation>): void {
    const a = this.get(id);
    if (!a) return;
    Object.assign(a, patch);
    this.save();
  }

  remove(id: string): void {
    this.items = this.items.filter(a => a.id !== id);
    this.save();
  }

  private save(): void {
    this.version++;
    try { localStorage.setItem(KEY + this.bookId, JSON.stringify(this.items)); } catch { /* ignore */ }
  }
}

/**
 * HTML for a paragraph with its highlights wrapped in <mark>. `render` turns
 * a plain text segment into HTML (bionic or escaped).
 */
export function markupWithHighlights(text: string, highlights: Annotation[], render: (segment: string) => string): string {
  if (!highlights.length) return render(text);
  let out = '';
  let pos = 0;
  for (const h of highlights) {
    const start = Math.max(pos, Math.min(h.start, text.length));
    const end = Math.max(start, Math.min(h.end, text.length));
    if (start > pos) out += render(text.slice(pos, start));
    out += `<mark class="hl hl-${h.color}${h.note ? ' has-note' : ''}" data-h="${h.id}">${render(text.slice(start, end))}</mark>`;
    pos = end;
  }
  if (pos < text.length) out += render(text.slice(pos));
  return out;
}

export interface SelectionInfo {
  index: number;
  start: number;
  end: number;
  text: string;
  rect: DOMRect;
}

/** Character offset of (node, offset) inside `root`'s text content. */
function offsetIn(root: HTMLElement, node: Node, offset: number): number {
  let pos = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode() as Text | null;
  if (node.nodeType !== Node.TEXT_NODE) {
    // Element boundary: count text before the child at `offset`.
    const child = node.childNodes[offset] ?? null;
    while (n) {
      if (child && (n === child || child.contains(n))) return pos;
      if (!child && !root.contains(n)) break;
      pos += n.data.length;
      n = walker.nextNode() as Text | null;
    }
    return child ? pos : root.textContent!.length;
  }
  while (n) {
    if (n === node) return pos + offset;
    pos += n.data.length;
    n = walker.nextNode() as Text | null;
  }
  return pos;
}

/** The current selection, if it lies inside one paragraph of `columns`. */
export function selectionInfo(columns: HTMLElement): SelectionInfo | null {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const para = (range.commonAncestorContainer instanceof HTMLElement ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest<HTMLElement>('[data-i]');
  if (!para || !columns.contains(para)) return null;
  const start = offsetIn(para, range.startContainer, range.startOffset);
  const end = offsetIn(para, range.endContainer, range.endOffset);
  if (end <= start) return null;
  const text = para.textContent!.slice(start, end);
  if (!text.trim()) return null;
  return { index: Number(para.dataset['i']), start, end, text, rect: range.getBoundingClientRect() };
}
