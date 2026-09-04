/**
 * Page-turn gesture and animation for the reader, Kindle style: the pages
 * slide horizontally. The outgoing screen (a clone of the current one) moves
 * out while the incoming screen (a clone of the target, rendered underneath
 * in the meantime) moves in beside it, following the finger during a drag
 * and easing out on release. Buttons and keys play the full slide.
 *
 * Framework-agnostic: works on plain DOM elements.
 */

export type TurnDirection = 1 | -1;

export interface PageTurnHost {
  /** Positioned, overflow-hidden container the slide is drawn in. */
  stage: HTMLElement;
  /** Element holding the screen currently rendered underneath. */
  columns(): HTMLElement;
  canTurn(dir: TurnDirection): boolean;
  /** Apply the page change underneath the slide. */
  turn(dir: TurnDirection): void;
  /** Position to restore when a drag is cancelled. */
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

const DRAG_START = 10;
const TAP_SLOP = 8;
const SLIDE_MS = 320;

export class PageTurn {
  /** Clone of the outgoing screen. */
  private leaf?: HTMLElement;
  /** Clone of the incoming screen. */
  private incoming?: HTMLElement;
  private dir: TurnDirection = 1;
  private progress = 0;
  private snap: unknown;
  private busy = false;
  private frame = 0;

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
    this.begin(dir).then(ok => { if (ok) this.settle(true); });
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
    try { this.host.stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
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
      const dir: TurnDirection = dx < 0 ? 1 : -1;
      if (!this.host.canTurn(dir)) { this.ignoreDrag = true; return; }
      if (reducedMotion()) { this.host.turn(dir); this.ignoreDrag = true; this.swallowClick = true; return; }
      this.dragging = true;
      this.begin(dir).then(ok => { if (!ok) { this.dragging = false; this.ignoreDrag = true; } });
      return;
    }
    if (!this.leaf) return;
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
    if (this.leaf) this.settle(complete);
    else this.pendingSettle = complete;
  }

  /** Release happened while the fold was still being prepared. */
  private pendingSettle: boolean | null = null;

  /* -------------------------------------------------------------- slide */

  private async begin(dir: TurnDirection): Promise<boolean> {
    const stage = this.host.stage;
    const source = this.host.columns();
    if (!source || this.busy) return false;
    this.busy = true;
    this.dir = dir;
    this.snap = this.host.snapshot();
    this.pendingSettle = null;

    // Cover the stage with the current screen, let the target render underneath,
    // then clone it as the incoming page.
    const leaf = el('leaf');
    leaf.appendChild(cloneColumns(source));
    stage.appendChild(leaf);
    this.leaf = leaf;
    this.host.turn(dir);
    await nextFrames(2);
    if (this.leaf !== leaf) return false; // detached meanwhile
    const incoming = el(`leaf-in ${dir === 1 ? 'from-right' : 'from-left'}`);
    incoming.appendChild(cloneColumns(this.host.columns()));
    stage.appendChild(incoming);
    this.incoming = incoming;
    this.set(0);
    if (this.pendingSettle !== null) { const c = this.pendingSettle; this.pendingSettle = null; this.settle(c); }
    return true;
  }

  /** Draw the slide for progress p (0 = untouched, 1 = fully turned). */
  private set(p: number): void {
    this.progress = p;
    if (!this.leaf || !this.incoming) return;
    const w = this.host.stage.clientWidth;
    const shift = w * p * this.dir; // forward moves left, back moves right
    this.leaf.style.transform = `translateX(${(-shift).toFixed(1)}px)`;
    this.incoming.style.transform = `translateX(${(w * this.dir - shift).toFixed(1)}px)`;
  }

  private settle(complete: boolean): void {
    if (!this.leaf) return;
    const from = this.progress;
    const to = complete ? 1 : 0;
    const duration = Math.max(140, SLIDE_MS * Math.abs(to - from));
    const t0 = performance.now();
    const step = (now: number) => {
      const t = clamp((now - t0) / duration, 0, 1);
      this.set(from + (to - from) * easeOutCubic(t));
      if (t < 1) { this.frame = requestAnimationFrame(step); return; }
      if (!complete) this.host.restore(this.snap);
      // Keep the cover until the restored page has rendered underneath.
      nextFrames(complete ? 0 : 2).then(() => this.cleanup());
    };
    this.frame = requestAnimationFrame(step);
  }

  private cleanup(): void {
    this.leaf?.remove();
    this.incoming?.remove();
    this.leaf = this.incoming = undefined;
    this.progress = 0;
    this.busy = false;
  }
}

function el(className: string): HTMLElement {
  const d = document.createElement('div');
  d.className = className;
  return d;
}

function cloneColumns(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
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
