/**
 * Page-turn gesture and animation for the reader.
 *
 * The reader shows one screen of a chapter at a time. A turn is drawn as a
 * flat paper fold: the sheet being turned is a clone of its screen, clipped
 * at a vertical crease that travels across the stage; the part already
 * turned lies over it as the light back of the sheet, and the page beneath
 * appears on the other side of the crease. Going forward the current sheet
 * folds toward the spine (left edge); going back, the previous sheet unfolds
 * from it. A drag makes the crease follow the finger and completes or snaps
 * back on release; buttons and keys play the full turn.
 *
 * Framework-agnostic: works on plain DOM elements.
 */

export type TurnDirection = 1 | -1;

export interface PageTurnHost {
  /** Positioned, overflow-hidden container the fold is drawn in. */
  stage: HTMLElement;
  /** Element holding the screen currently rendered underneath. */
  columns(): HTMLElement;
  canTurn(dir: TurnDirection): boolean;
  /** Apply the page change underneath the fold. */
  turn(dir: TurnDirection): void;
  /** Position to restore when a drag is cancelled. */
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

const DRAG_START = 10;
const TAP_SLOP = 8;
const FLIP_MS = 420;

export class PageTurn {
  private leaf?: HTMLElement;
  private back?: HTMLElement;
  private shadow?: HTMLElement;
  private under?: HTMLElement;
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
    const travel = Math.max(120, this.host.stage.clientWidth * 0.6);
    const along = (this.dir === 1 ? -dx : dx) - DRAG_START;
    this.set(clamp(along / travel, 0, 1));
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

  /* --------------------------------------------------------------- fold */

  private async begin(dir: TurnDirection): Promise<boolean> {
    const stage = this.host.stage;
    const source = this.host.columns();
    if (!source || this.busy) return false;
    this.busy = true;
    this.dir = dir;
    this.snap = this.host.snapshot();
    this.pendingSettle = null;

    const shadow = el('leaf-shadow');
    const back = el('leaf-back');
    let leaf: HTMLElement;

    if (dir === 1) {
      // Forward: the current screen is the sheet; the next page is already underneath.
      leaf = el('leaf');
      leaf.appendChild(cloneColumns(source));
      this.host.turn(dir);
    } else {
      // Back: keep a copy of the current screen on top, let the previous page render
      // underneath, then use that previous page as the sheet unfolding from the spine.
      const under = el('leaf-under');
      under.appendChild(cloneColumns(source));
      stage.appendChild(under);
      this.under = under;
      this.host.turn(dir);
      await nextFrames(2);
      if (!this.under) return false; // detached meanwhile
      leaf = el('leaf');
      leaf.appendChild(cloneColumns(this.host.columns()));
    }

    stage.appendChild(shadow);
    stage.appendChild(leaf);
    stage.appendChild(back);
    this.leaf = leaf;
    this.back = back;
    this.shadow = shadow;
    this.set(0);
    if (this.pendingSettle !== null) { const c = this.pendingSettle; this.pendingSettle = null; this.settle(c); }
    return true;
  }

  /** Draw the fold for progress p (0 = untouched, 1 = fully turned). */
  private set(p: number): void {
    this.progress = p;
    if (!this.leaf || !this.back || !this.shadow) return;
    const w = this.host.stage.clientWidth;
    // Crease position: forward it travels from the free edge to the spine, back the other way.
    const crease = this.dir === 1 ? w * (1 - p) : w * p;
    const edge = Math.max(0, 2 * crease - w);         // free edge of the folded part
    const backWidth = Math.max(0, crease - edge);
    this.leaf.style.clipPath = `inset(0 ${Math.max(0, w - crease).toFixed(1)}px 0 0)`;
    this.back.style.left = `${edge.toFixed(1)}px`;
    this.back.style.width = `${backWidth.toFixed(1)}px`;
    this.back.style.opacity = backWidth > 0.5 ? '1' : '0';
    this.shadow.style.left = `${crease.toFixed(1)}px`;
    this.shadow.style.opacity = (Math.sin(p * Math.PI) * 0.85).toFixed(3);
  }

  private settle(complete: boolean): void {
    if (!this.leaf) return;
    const from = this.progress;
    const to = complete ? 1 : 0;
    const duration = Math.max(160, FLIP_MS * Math.abs(to - from));
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
    this.back?.remove();
    this.shadow?.remove();
    this.under?.remove();
    this.leaf = this.back = this.shadow = this.under = undefined;
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
