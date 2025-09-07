import { Injectable } from '@angular/core';

export type CamelotKey = `${number}${'A'|'B'}`;
export interface TrackMeta {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key?: CamelotKey;
  energy?: number; // 0-1
  valence?: number; // 0-1
  arousal?: number; // 0-1
  beatgrid?: { start: number; interval: number; bars?: Array<{ start: number; lengthBeats: number }> };
  structure?: Array<{ start: number; end: number; type: 'intro'|'build-up'|'drop'|'breakdown'|'outro' }>;
}

export type TransitionType = 'long-blend' | 'drop-swap' | 'genre-bridge';

@Injectable({ providedIn: 'root' })
export class DjEngineService {
  private ctx!: AudioContext;
  private master!: GainNode;

  // Post-suma: limitador suave y auto-gain
  private preLimiterGain!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private output!: GainNode;

  // Estado de mezcla
  private current?: { meta: TrackMeta; source: AudioNode };
  private next?: { meta: TrackMeta; source: AudioNode };

  private running = false;
  private rafId = 0;

  init(ctx: AudioContext, masterNode: AudioNode): AudioNode {
    this.ctx = ctx;
    // Inserta cadena post-suma: master -> preGain -> limiter -> output -> destination
    this.preLimiterGain = ctx.createGain();
    this.preLimiterGain.gain.value = 1.0;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;  // dB
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.08;

    this.output = ctx.createGain();
    this.output.gain.value = 1.0;

    (masterNode as AudioNode).connect(this.preLimiterGain);
    this.preLimiterGain.connect(this.limiter);
    this.limiter.connect(this.output);
    this.output.connect(ctx.destination);

    return this.output; // punto final (por si quieres encadenar más tarde)
  }

  attachCurrent(source: AudioNode, meta: TrackMeta) {
    this.current = { source, meta };
  }

  attachNext(source: AudioNode, meta: TrackMeta) {
    this.next = { source, meta };
  }

  private spb(bpm: number) { return 60 / Math.max(1, bpm); }
  private nextQuantizedBarTime(bpm: number, bars = 1, lookAhead = 0.06): number {
    const bar = this.spb(bpm) * 4;
    const now = this.ctx.currentTime + lookAhead;
    const steps = Math.ceil(now / (bar * bars));
    return steps * (bar * bars);
  }

  private createEqTriplet() {
    const low = this.ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180;
    const mid = this.ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.9;
    const high = this.ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 8000;
    return { low, mid, high, chain: (n: AudioNode) => { n.connect(low); low.connect(mid); mid.connect(high); return high as AudioNode; } };
  }

  private applyLongBlendEqMoves(t0: number, dur: number, curEq: ReturnType<DjEngineService['createEqTriplet']>, nextEq: ReturnType<DjEngineService['createEqTriplet']>) {
    // Bajar lows de la entrante, subir gradualmente; recortar lows de la saliente al final
    curEq.low.gain.setValueAtTime(0, t0);
    curEq.low.gain.linearRampToValueAtTime(-3, t0 + dur * 0.8);

    nextEq.low.gain.setValueAtTime(-12, t0);
    nextEq.low.gain.linearRampToValueAtTime(0, t0 + dur * 0.8);

    // Pequeño mid dip a mitad para evitar enmascaramiento
    curEq.mid.gain.setValueAtTime(0, t0);
    curEq.mid.gain.linearRampToValueAtTime(-1.5, t0 + dur * 0.5);
    curEq.mid.gain.linearRampToValueAtTime(0, t0 + dur);

    // Brillo de la entrante
    nextEq.high.gain.setValueAtTime(-2, t0);
    nextEq.high.gain.linearRampToValueAtTime(2, t0 + dur * 0.6);
  }

  private createBeatDelay(bpm: number, subdivision: 2|4|8 = 8, feedback = 0.28, wet = 0.22) {
    const delay = this.ctx.createDelay(1.0);
    const fb = this.ctx.createGain();
    const wetG = this.ctx.createGain();
    const dryG = this.ctx.createGain();
    delay.delayTime.value = this.spb(bpm) / subdivision;
    fb.gain.value = feedback;
    wetG.gain.value = wet;
    dryG.gain.value = 1.0;
    delay.connect(fb); fb.connect(delay);
    return { delay, fb, wetG, dryG, dispose: () => { try{delay.disconnect();fb.disconnect();wetG.disconnect();dryG.disconnect();}catch{} } };
  }

  private scheduleDropSwap(t0: number, dur: number, bpm: number, nextChainEnd: AudioNode) {
    // Filtro lowpass “open” y beat-repeat corto para hype
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
    const start = 500; const end = 16000;
    lp.frequency.setValueAtTime(start, t0);
    lp.frequency.linearRampToValueAtTime(end, t0 + dur * 0.8);

    const fx = this.createBeatDelay(bpm, 8, 0.35, 0.25);
    // Automatiza wet
    const wet = this.ctx.createGain();
    wet.gain.setValueAtTime(0.0, t0);
    wet.gain.linearRampToValueAtTime(0.3, t0 + dur * 0.4);
    wet.gain.linearRampToValueAtTime(0.0, t0 + dur);

    // Conexión: nextChainEnd -> lp -> (dry+delay) -> master
    nextChainEnd.connect(lp);
    lp.connect(fx.delay);
    lp.connect(fx.dryG);
    fx.delay.connect(fx.fb);
    fx.delay.connect(wet);
    wet.connect(this.preLimiterGain);
    fx.dryG.connect(this.preLimiterGain);

    setTimeout(() => { try{ lp.disconnect(); wet.disconnect(); fx.dispose(); }catch{} }, (t0 + dur - this.ctx.currentTime + 0.1) * 1000);
  }

  async planTransition(type: TransitionType, durationBeats: number = 32) {
    if (!this.current || !this.next) return;
    const bpm = this.current.meta.bpm || this.next.meta.bpm;
    const t0 = this.nextQuantizedBarTime(bpm, 1);

    // Encadenar EQ para ambas
    const curEq = this.createEqTriplet();
    const nextEq = this.createEqTriplet();

    // Reconectar: current.source -> curEq -> preLimiter, next.source -> nextEq -> preLimiter (con auto-gain)
    try {
      this.current.source.connect(curEq.low);
      curEq.high.connect(this.preLimiterGain);

      this.next.source.connect(nextEq.low);
      nextEq.high.connect(this.preLimiterGain);
    } catch {}

    const dur = this.spb(bpm) * durationBeats;

    if (type === 'long-blend') {
      this.applyLongBlendEqMoves(t0, dur, curEq, nextEq);
      // Crossfade de ganancias
      const curG = this.ctx.createGain(); const nextG = this.ctx.createGain();
      curG.gain.setValueAtTime(1.0, t0);
      curG.gain.linearRampToValueAtTime(0.0, t0 + dur);
      nextG.gain.setValueAtTime(0.0, t0);
      nextG.gain.linearRampToValueAtTime(1.0, t0 + dur * 0.8);

      curEq.high.disconnect(); curEq.high.connect(curG).connect(this.preLimiterGain);
      nextEq.high.disconnect(); nextEq.high.connect(nextG).connect(this.preLimiterGain);

    } else if (type === 'drop-swap') {
      // Mezcla más corta, enfocada en el drop
      const d = this.spb(bpm) * Math.max(8, Math.min(16, durationBeats));
      // Recortar lows de la entrante, abrir al final
      nextEq.low.gain.setValueAtTime(-9, t0);
      nextEq.low.gain.linearRampToValueAtTime(0, t0 + d * 0.9);
      // Sutil high boost
      nextEq.high.gain.setValueAtTime(1, t0);

      // Programar hype FX
      this.scheduleDropSwap(t0, d, bpm, nextEq.high);

      // Ganancias
      const curG = this.ctx.createGain(); const nextG = this.ctx.createGain();
      curG.gain.setValueAtTime(1.0, t0);
      curG.gain.linearRampToValueAtTime(0.0, t0 + d);
      nextG.gain.setValueAtTime(0.0, t0);
      nextG.gain.linearRampToValueAtTime(1.0, t0 + d * 0.7);

      curEq.high.disconnect(); curEq.high.connect(curG).connect(this.preLimiterGain);
      nextEq.high.disconnect(); nextEq.high.connect(nextG).connect(this.preLimiterGain);

    } else if (type === 'genre-bridge') {
      // Filtro + reverb largo para disimular cambio de timbre
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
      nextEq.high.connect(hp).connect(this.preLimiterGain);
      const d = this.spb(bpm) * Math.max(16, durationBeats);
      // Abrir highpass lentamente
      hp.frequency.setValueAtTime(120, t0);
      hp.frequency.linearRampToValueAtTime(40, t0 + d * 0.9);

      const curG = this.ctx.createGain(); const nextG = this.ctx.createGain();
      curEq.high.disconnect(); curEq.high.connect(curG).connect(this.preLimiterGain);
      curG.gain.setValueAtTime(1.0, t0);
      curG.gain.linearRampToValueAtTime(0.0, t0 + d);

      nextG.gain.setValueAtTime(0.0, t0);
      nextG.gain.linearRampToValueAtTime(1.0, t0 + d * 0.85);
      nextEq.high.disconnect(); nextEq.high.connect(nextG).connect(this.preLimiterGain);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      // Aquí podrías monitorear RMS y ajustar auto-gain dinámico
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
