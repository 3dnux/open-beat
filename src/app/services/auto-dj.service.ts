// src/app/services/auto-dj.service.ts
import { Injectable } from '@angular/core';
import { AIAudioProcessingService } from './ai-audio-processing.service';
import { EmotionAnalysisService } from './emotion-analysis.service';
import { DjEngineService } from './dj-engine.service';

export interface AutoDjSongMeta {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  genre?: string;
  energy?: number;
  valence?: number;
  durationSec?: number;
}

@Injectable({ providedIn: 'root' })
export class AutoDjService {
  private ctx: AudioContext | null = null;
  private masterInsert: AudioNode | null = null; // point after master gain
  private fxRouter?: ReturnType<AIAudioProcessingService['buildFxRouter']>;

  private current?: AutoDjSongMeta;
  private queue: AutoDjSongMeta[] = [];

  private running = false;
  private rafId = 0;

  private lastPlanAt = 0;
  private lastTransitionAt = 0;

  constructor(
    private ai: AIAudioProcessingService,
    private emotion: EmotionAnalysisService,
    private engine: DjEngineService
  ) {}

  start(params: {
    ctx: AudioContext,
    masterInsert: AudioNode,
    fxRouter: ReturnType<AIAudioProcessingService['buildFxRouter']>,
    currentSong: AutoDjSongMeta,
    candidatesProvider: () => AutoDjSongMeta[]
  }): void {
    if (this.running) this.stop();

    this.ctx = params.ctx;
    this.masterInsert = params.masterInsert;
    this.fxRouter = params.fxRouter;
    this.current = params.currentSong;
    this.queue = params.candidatesProvider() || [];

    const bpm = this.current?.bpm || 120;
    try { this.fxRouter?.setDelayTempo(bpm, 4); } catch {}

    this.running = true;

    const loop = () => {
      if (!this.running || !this.ctx || !this.current || !this.fxRouter) return;

      const now = this.ctx.currentTime;
      const bpmNow = this.current.bpm || 120;

      // 1) apply dynamic FX plan ~ each 1.5s
      if (now - this.lastPlanAt > 1.5) {
        this.lastPlanAt = now;
        try {
          const plan = {
            reverb: 0.18,
            delay: 0.12,
            delayTime: 60 / Math.max(1, bpmNow) / 4,
            feedback: 0.22,
            applyAt: now + 0.1,
            duration: 2.0
          };
          this.ai.applyPlannedEffects(this.ctx, this.fxRouter, plan, bpmNow);
        } catch {}
      }

      // 2) occasional reverb ducking for punch
      if (Math.random() < 0.05) {
        try { this.fxRouter.pulseReverbDuck(-10, 0.18); } catch {}
      }

      // 3) auto transition approx every 32 beats
      const spb = 60 / Math.max(1, bpmNow);
      const phraseSec = spb * 32;
      if (now - this.lastTransitionAt > phraseSec) {
        const candidates = this.queue;
        if (candidates?.length) {
          const next = this.pickNextSmart(this.current, candidates);
          if (next) {
            try {
              // Start engine loop (if not running) and plan a transition; Home should already have attached current/next sources
              try { this.engine.start(); } catch {}
              void this.engine.planTransition('long-blend', 32);
              this.lastTransitionAt = now;

              // FX support during transition
              try {
                this.fxRouter.setDelayTempo(next.bpm || bpmNow, 4);
                const start = now + 0.15;
                const end = start + Math.min(12, spb * 16);
                this.fxRouter.setDelayWet(0.25, start, end);
                this.fxRouter.setDelayFeedback(0.28, start);
              } catch {}
            } catch {}
          }
        }
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.ctx = null;
    this.masterInsert = null;
    this.fxRouter = undefined;
    this.current = undefined;
    this.queue = [];
  }

  private pickNextSmart(current: AutoDjSongMeta, candidates: AutoDjSongMeta[]): AutoDjSongMeta | null {
    if (!candidates.length) return null;
    let best = candidates[0];
    let bestScore = -1;

    for (const c of candidates) {
      const bpmScore = 1 - Math.min(1, Math.abs((c.bpm || 120) - (current.bpm || 120)) / 20);
      const genreScore = c.genre && current.genre && c.genre === current.genre ? 0.2 : 0;
      const energyScore = (c.energy !== undefined && current.energy !== undefined)
        ? 1 - Math.min(1, Math.abs(c.energy - current.energy))
        : 0.5;

      const score = bpmScore * 0.6 + genreScore * 0.2 + energyScore * 0.2;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }
}
