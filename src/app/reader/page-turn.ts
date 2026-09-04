/**
 * Page-turn gesture and animation for the reader, Kindle style: the pages
 * slide horizontally, following the finger during a drag and easing out on
 * release; buttons and keys play the full slide.
 *
 * The reader lays a whole chapter out in CSS columns and shows one column
 * ("screen") at a time by translating the container. Within a chapter the
 * neighbouring screen is already rendered, so the slide simply moves that
 * container: no cloning, no waiting, one transform per frame. Only when the
 * target screen belongs to another chapter are two lightweight copies made
 * (just the paragraphs visible on each screen) and slid over the stage while
 * the new chapter renders underneath.
 *
 * Framework-agnostic: works on plain DOM elements.
 */

export type TurnDirection = 1 | -1;

export interface PageTurnHost {
  /** Positioned, overflow-hidden container the slide is drawn in. */
  stage: HTMLElement;
  /** Element laying the current chapter out in columns. */
  columns(): HTMLElement;
  /** Index of the screen (column) currently shown. */
  screen(): number;
  /** Horizontal distance between consecutive screens (column width + gap). */
  stride(): number;
  canTurn(dir: TurnDirection): boolean;
  /** True when the target screen is already laid out in columns() (same chapter). */
  inline(dir: TurnDirection): boolean;
  /** Apply the page change. */
  turn(dir: TurnDirection): void;
  /** Position to restore when a drag is cancelled. */
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

const DRAG_START = 10;
const TAP_SLOP = 8;
const SLIDE_MS = 300;

export class PageTurn {
  private dir: TurnDirection = 1;
  private progress = 0;
  private busy = false;
  private frame = 0;
  /** Same-chapter slide: the real container moves. */
  private inline = false;
  private baseOffset = 0;
  /** Cross-chapter slide: copies of the outgoing and incoming screens. */
  private leaf?: HTMLElement;
  private incoming?: HTMLElement;
  private snap: unknown;
  /** Release happened while the cross-chapter copies were still being prepared. */
  private pendingSettle: boolean | null = null;

  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastT = 0;
  private velocity = 0;
  private dragging = false;
  private ignoreDrag = false;
  private swallowClick = false;

  private readonly onDown = (e: PointerEvent) => this.down(e);
  private readonly onMove = (e: PointerEvent) => this.move(e);
  private readonly onUp = (e: PointerEvent) => this.up(e);
  private readonly onClick = (e: MouseEvent) => {
    if (this.swallowClick) { e.stopPropagation(); e.preventDefault(); this.swallowClick = false; }
  };

  constructor(private readonly host: PageTurnHost) {}

  attach(): void {
    const s = this.host.stage;
    s.style.touchAction = 'none';
    s.addEventListener('pointerdown', this.onDown);
    s.addEventListener('pointermove', this.onMove);
    s.addEventListener('pointerup', this.onUp);
    s.addEventListener('pointercancel', this.onUp);
    s.addEventListener('click', this.onClick, true);
  }

  detach(): void {
    const s = this.host.stage;
    s.removeEventListener('pointerdown', this.onDown);
    s.removeEventListener('pointermove', this.onMove);
    s.removeEventListener('pointerup', this.onUp);
    s.removeEventListener('pointercancel', this.onUp);
    s.removeEventListener('click', this.onClick, true);
    cancelAnimationFrame(this.frame);
    this.cleanup();
  }

  /** Full animated turn (buttons, keyboard, tap zones). */
  flip(dir: TurnDirection): void {
    if (this.busy || !this.host.canTurn(dir)) return;
    if (reducedMotion()) { this.host.turn(dir); return; }
    if (this.begin(dir)) this.settle(true);
  }

  /* ----------------------------------------------------------- pointer */

  private down(e: PointerEvent): void {
    if (this.busy || this.pointerId !== null || e.button !== 0) return;
    this.pointerId = e.pointerId;
    this.startX = this.lastX = e.clientX;
    this.startY = e.clientY;
    this.lastT = e.timeStamp;
    this.velocity = 0;
    this.dragging = false;
    this.ignoreDrag = false;
    this.swallowClick = false;
    // Capture touch and pen so the slide keeps tracking outside the stage; a mouse must stay free to select text.
    if (e.pointerType !== 'mouse') { try { this.host.stage.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    const dt = e.timeStamp - this.lastT;
    if (dt > 0) this.velocity = (e.clientX - this.lastX) / dt;
    this.lastX = e.clientX;
    this.lastT = e.timeStamp;

    if (!this.dragging) {
      if (this.ignoreDrag || this.busy || Math.abs(dx) < DRAG_START) return;
      if (Math.abs(dy) > Math.abs(dx)) { this.ignoreDrag = true; return; }
      // A mouse drag selects text (like the Kindle desktop app); a drag that extends a selection is not a turn.
      if (e.pointerType === 'mouse' || !document.getSelection()?.isCollapsed) { this.ignoreDrag = true; return; }
      const dir: TurnDirection = dx < 0 ? 1 : -1;
      if (!this.host.canTurn(dir)) { this.ignoreDrag = true; return; }
      if (reducedMotion()) { this.host.turn(dir); this.ignoreDrag = true; this.swallowClick = true; return; }
      if (!this.begin(dir)) { this.ignoreDrag = true; return; }
      this.dragging = true;
    }
    const along = (this.dir === 1 ? -dx : dx) - DRAG_START;
    this.set(clamp(along / Math.max(1, this.host.stage.clientWidth), 0, 1));
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    try { this.host.stage.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const moved = Math.hypot(e.clientX - this.startX, e.clientY - this.startY);
    if (moved > TAP_SLOP) this.swallowClick = true;
    if (!this.dragging) return;
    this.dragging = false;
    const fling = this.dir === 1 ? this.velocity < -0.4 : this.velocity > 0.4;
    const back = this.dir === 1 ? this.velocity > 0.4 : this.velocity < -0.4;
    const complete = e.type !== 'pointercancel' && !back && (fling || this.progress > 0.3);
    if (this.inline || this.incoming) this.settle(complete);
    else this.pendingSettle = complete;
  }

  /* -------------------------------------------------------------- slide */

  private begin(dir: TurnDirection): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.dir = dir;
    this.progress = 0;
    this.pendingSettle = null;
    this.inline = this.host.inline(dir);
    if (this.inline) {
      this.baseOffset = -this.host.screen() * this.host.stride();
      return true;
    }
    this.beginAcrossChapters(dir);
    return true;
  }

  /** Cover the stage with a copy of the current screen, render the target underneath, copy it as the incoming page. */
  private async beginAcrossChapters(dir: TurnDirection): Promise<void> {
    const stage = this.host.stage;
    const leaf = el('leaf');
    leaf.appendChild(cloneScreen(this.host.columns(), this.host.screen(), this.host.stride()));
    stage.appendChild(leaf);
    this.leaf = leaf;
    this.snap = this.host.snapshot();
    this.host.turn(dir);
    await nextFrames(2);
    if (this.leaf !== leaf) return; // detached meanwhile
    const incoming = el(`leaf-in ${dir === 1 ? 'from-right' : 'from-left'}`);
    incoming.appendChild(cloneScreen(this.host.columns(), this.host.screen(), this.host.stride()));
    stage.appendChild(incoming);
    this.incoming = incoming;
    this.set(this.progress);
    if (this.pendingSettle !== null) { const c = this.pendingSettle; this.pendingSettle = null; this.settle(c); }
  }

  /** Draw the slide for progress p (0 = untouched, 1 = fully turned). */
  private set(p: number): void {
    this.progress = p;
    const shift = this.host.stride() * p * this.dir; // forward moves left, back moves right
    if (this.inline) {
      this.host.columns().style.transform = `translateX(${(this.baseOffset - shift).toFixed(1)}px)`;
      return;
    }
    if (!this.leaf || !this.incoming) return;
    const w = this.host.stage.clientWidth;
    this.leaf.style.transform = `translateX(${(-shift).toFixed(1)}px)`;
    this.incoming.style.transform = `translateX(${(w * this.dir - shift).toFixed(1)}px)`;
  }

  private settle(complete: boolean): void {
    const from = this.progress;
    const to = complete ? 1 : 0;
    const duration = Math.max(120, SLIDE_MS * Math.abs(to - from));
    const t0 = performance.now();
    const step = (now: number) => {
      const t = clamp((now - t0) / duration, 0, 1);
      this.set(from + (to - from) * easeOutCubic(t));
      if (t < 1) { this.frame = requestAnimationFrame(step); return; }
      this.finish(complete);
    };
    this.frame = requestAnimationFrame(step);
  }

  private finish(complete: boolean): void {
    if (this.inline) {
      // The container already sits on the target screen; make the reader agree.
      if (complete) this.host.turn(this.dir);
      this.cleanup();
      return;
    }
    if (!complete) this.host.restore(this.snap);
    // Keep the copies until the restored page has rendered underneath.
    nextFrames(complete ? 0 : 2).then(() => this.cleanup());
  }

  private cleanup(): void {
    this.leaf?.remove();
    this.incoming?.remove();
    this.leaf = this.incoming = undefined;
    this.inline = false;
    this.progress = 0;
    this.busy = false;
  }
}

function el(className: string): HTMLElement {
  const d = document.createElement('div');
  d.className = className;
  return d;
}

/**
 * Copy of the columns container holding only what is visible on the given
 * screen: the paragraphs starting on it plus the one flowing in from the
 * previous column, placed at its original height with a spacer so the line
 * breaks fall in the same places. Cheap to lay out even for long chapters.
 */
function cloneScreen(source: HTMLElement, screen: number, stride: number): HTMLElement {
  const clone = source.cloneNode(false) as HTMLElement;
  clone.removeAttribute('id');
  const children = Array.from(source.children) as HTMLElement[];
  const col = (e: HTMLElement) => Math.round(e.offsetLeft / stride);
  let first = children.findIndex(e => col(e) >= screen);
  if (first < 0) first = children.length;
  const start = Math.max(0, first - 1);
  let end = first;
  while (end < children.length && col(children[end]) === screen) end++;
  if (start < children.length) {
    const lead = children[start];
    const spacer = document.createElement('div');
    spacer.style.height = `${Math.max(0, lead.offsetTop - parseFloat(getComputedStyle(lead).marginTop) || 0)}px`;
    clone.appendChild(spacer);
    for (let i = start; i < end; i++) clone.appendChild(children[i].cloneNode(true));
    clone.style.transform = `translateX(${-(screen - col(lead)) * stride}px)`;
  }
  return clone;
}

function nextFrames(n: number): Promise<void> {
  return new Promise(resolve => {
    const tick = () => (n-- <= 0 ? resolve() : requestAnimationFrame(tick));
    tick();
  });
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
