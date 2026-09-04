/**
 * Page-turn gesture and animation for the reader.
 *
 * The reader shows one screen of a chapter at a time. To turn a page, the
 * current screen is cloned into a "leaf" laid over the stage, the real
 * content underneath switches to the target screen, and the leaf folds away
 * in 3D around the spine (left edge when going forward, right edge when going
 * back), revealing the new page. A drag makes the leaf follow the finger and
 * completes or snaps back on release; buttons and keys play the full turn.
 *
 * Framework-agnostic: works on plain DOM elements.
 */

export type TurnDirection = 1 | -1;

export interface PageTurnHost {
  /** Positioned, overflow-hidden container the leaf is laid over. */
  stage: HTMLElement;
  /** Element holding the current screen (cloned into the leaf). */
  columns(): HTMLElement;
  canTurn(dir: TurnDirection): boolean;
  /** Apply the page change underneath the leaf. */
  turn(dir: TurnDirection): void;
  /** Position to restore when a drag is cancelled. */
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

const DRAG_START = 10;
const TAP_SLOP = 8;
const FLIP_MS = 460;
const EASING = 'cubic-bezier(.25,.7,.25,1)';

export class PageTurn {
  private leaf?: HTMLElement;
  private shade?: HTMLElement;
  private shadow?: HTMLElement;
  private dir: TurnDirection = 1;
  private progress = 0;
  private snap: unknown;
  private animating = false;

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
    this.removeLeaf();
  }

  /** Full animated turn (buttons, keyboard, tap zones). */
  flip(dir: TurnDirection): void {
    if (this.animating || this.leaf) return;
    if (!this.host.canTurn(dir)) return;
    if (reducedMotion()) { this.host.turn(dir); return; }
    if (!this.begin(dir)) return;
    this.settle(true);
  }

  /* ----------------------------------------------------------- pointer */

  private down(e: PointerEvent): void {
    if (this.animating || this.pointerId !== null || e.button !== 0) return;
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
      if (this.ignoreDrag || Math.abs(dx) < DRAG_START) return;
      if (Math.abs(dy) > Math.abs(dx)) { this.ignoreDrag = true; return; }
      const dir: TurnDirection = dx < 0 ? 1 : -1;
      if (!this.host.canTurn(dir)) { this.ignoreDrag = true; return; }
      if (reducedMotion()) { this.host.turn(dir); this.ignoreDrag = true; this.swallowClick = true; return; }
      if (!this.begin(dir)) { this.ignoreDrag = true; return; }
      this.dragging = true;
    }
    const travel = Math.max(120, this.host.stage.clientWidth * 0.55);
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
    const complete = e.type !== 'pointercancel' && !back && (fling || this.progress > 0.32);
    this.settle(complete);
  }

  /* --------------------------------------------------------------- leaf */

  private begin(dir: TurnDirection): boolean {
    const stage = this.host.stage;
    const source = this.host.columns();
    if (!source) return false;
    const side = dir === 1 ? 'next' : 'prev';

    const leaf = document.createElement('div');
    leaf.className = `leaf ${side}`;
    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    leaf.appendChild(clone);
    const shade = document.createElement('div');
    shade.className = 'leaf-shade';
    leaf.appendChild(shade);
    const shadow = document.createElement('div');
    shadow.className = `leaf-shadow ${side}`;

    stage.appendChild(shadow);
    stage.appendChild(leaf);
    this.leaf = leaf;
    this.shade = shade;
    this.shadow = shadow;
    this.dir = dir;
    this.snap = this.host.snapshot();
    this.set(0);
    this.host.turn(dir);
    return true;
  }

  private set(p: number): void {
    this.progress = p;
    if (!this.leaf || !this.shade || !this.shadow) return;
    this.leaf.style.transform = transformAt(this.dir, p);
    this.shade.style.opacity = String(Math.min(1, p * 1.4));
    this.shadow.style.opacity = String(Math.sin(p * Math.PI) * 0.9);
  }

  private settle(complete: boolean): void {
    if (!this.leaf || !this.shade || !this.shadow) return;
    this.animating = true;
    const from = this.progress;
    const to = complete ? 1 : 0;
    const duration = Math.max(140, FLIP_MS * Math.abs(to - from));
    const leaf = this.leaf;
    const anims = [
      leaf.animate([{ transform: transformAt(this.dir, from) }, { transform: transformAt(this.dir, to) }], { duration, easing: EASING, fill: 'forwards' }),
      this.shade.animate([{ opacity: Math.min(1, from * 1.4) }, { opacity: Math.min(1, to * 1.4) }], { duration, easing: EASING, fill: 'forwards' }),
      this.shadow.animate(
        [{ opacity: Math.sin(from * Math.PI) * 0.9 }, { opacity: complete ? 0 : 0, offset: 1 }],
        { duration, easing: EASING, fill: 'forwards' },
      ),
    ];
    const done = () => {
      if (this.leaf !== leaf) return;
      if (!complete) this.host.restore(this.snap);
      this.removeLeaf();
      this.animating = false;
    };
    Promise.all(anims.map(a => a.finished)).then(done, done);
  }

  private removeLeaf(): void {
    this.leaf?.remove();
    this.shadow?.remove();
    this.leaf = this.shade = this.shadow = undefined;
    this.progress = 0;
  }
}

function transformAt(dir: TurnDirection, p: number): string {
  // Forward: fold around the left edge, free edge lifting toward the reader.
  // Back: fold around the right edge.
  const angle = (dir === 1 ? -90 : 90) * p;
  return `rotateY(${angle.toFixed(2)}deg)`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
