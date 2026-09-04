/**
 * Word highlighting without touching the DOM: uses the CSS Custom Highlight
 * API (Chrome, Edge, Safari 17.2+) when available. Callers style it with
 * `::highlight(name)`; where unsupported, highlightRange is a no-op.
 */

interface HighlightRegistry { set(name: string, h: unknown): void; delete(name: string): void; }
interface CssWithHighlights { highlights?: HighlightRegistry }
declare const Highlight: { new (...ranges: Range[]): unknown } | undefined;

export function supportsHighlights(): boolean {
  return typeof CSS !== 'undefined' && !!(CSS as unknown as CssWithHighlights).highlights && typeof Highlight !== 'undefined';
}

/** Range covering characters [start, end) of an element's text content. */
export function rangeForText(el: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let node = walker.nextNode() as Text | null;
  let startNode: Text | null = null;
  let startOffset = 0;
  while (node) {
    const len = node.data.length;
    if (!startNode && start < pos + len) { startNode = node; startOffset = start - pos; }
    if (startNode && end <= pos + len) {
      const range = document.createRange();
      range.setStart(startNode, Math.max(0, startOffset));
      range.setEnd(node, Math.max(0, end - pos));
      return range;
    }
    pos += len;
    node = walker.nextNode() as Text | null;
  }
  return null;
}

export function highlightRange(name: string, range: Range | null): void {
  if (!supportsHighlights()) return;
  const reg = (CSS as unknown as CssWithHighlights).highlights!;
  if (range) reg.set(name, new Highlight!(range));
  else reg.delete(name);
}
