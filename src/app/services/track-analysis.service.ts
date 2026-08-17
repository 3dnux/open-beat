import { Injectable, OnDestroy } from '@angular/core';
import type { TrackAnalysisResult } from '../workers/dj-analyzer.worker';

export type TrackAnalysis = TrackAnalysisResult;

/**
 * Full offline track analysis for the auto-DJ:
 * fetches the audio file once, decodes it at 44.1 kHz, downmixes to mono and
 * hands the PCM to the dj-analyzer worker (real DSP off the main thread).
 * Results are cached per URL; analyses run one at a time to bound memory.
 */
@Injectable({ providedIn: 'root' })
export class TrackAnalysisService implements OnDestroy {
  private worker: Worker | null = null;
  private cache = new Map<string, TrackAnalysis>();
  private inFlight = new Map<string, Promise<TrackAnalysis>>();
  private pending = new Map<string, { resolve: (r: TrackAnalysis) => void; reject: (e: unknown) => void }>();
  private queue: Promise<void> = Promise.resolve();

  /** Returns the cached analysis if available, without triggering work. */
  peek(url: string): TrackAnalysis | undefined {
    return this.cache.get(url);
  }

  /** Analyzes a track (cached; concurrent calls for the same URL share one run). */
  analyze(url: string): Promise<TrackAnalysis> {
    const cached = this.cache.get(url);
    if (cached) return Promise.resolve(cached);
    const running = this.inFlight.get(url);
    if (running) return running;

    const promise = new Promise<TrackAnalysis>((resolve, reject) => {
      // Serialize analyses: decoding a full track is memory-heavy
      this.queue = this.queue
        .then(() => this.runAnalysis(url))
        .then(result => {
          this.cache.set(url, result);
          this.inFlight.delete(url);
          resolve(result);
        })
        .catch(err => {
          this.inFlight.delete(url);
          reject(err);
        });
    });
    this.inFlight.set(url, promise);
    return promise;
  }

  private async runAnalysis(url: string): Promise<TrackAnalysis> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch audio (${response.status}): ${url}`);
    const arrayBuffer = await response.arrayBuffer();

    // Decode at a fixed 44.1 kHz so the worker's DSP assumptions always hold
    const decodeCtx = new OfflineAudioContext(1, 1, 44100);
    const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);

    // Downmix to mono
    const length = audioBuffer.length;
    const mono = new Float32Array(length);
    const channels = audioBuffer.numberOfChannels;
    for (let ch = 0; ch < channels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) mono[i] += data[i];
    }
    if (channels > 1) {
      const inv = 1 / channels;
      for (let i = 0; i < length; i++) mono[i] *= inv;
    }

    return this.postToWorker(url, mono, audioBuffer.sampleRate);
  }

  private postToWorker(id: string, pcm: Float32Array, sampleRate: number): Promise<TrackAnalysis> {
    return new Promise<TrackAnalysis>((resolve, reject) => {
      const worker = this.ensureWorker();
      this.pending.set(id, { resolve, reject });
      try {
        // Transfer the buffer (zero-copy) — the main thread frees it immediately
        worker.postMessage({ type: 'analyze', pcm, sampleRate, id }, [pcm.buffer]);
      } catch (e) {
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('../workers/dj-analyzer.worker', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (ev: MessageEvent) => {
      const msg = ev.data as { id: string; ok: boolean; result?: TrackAnalysis; error?: string };
      const entry = this.pending.get(msg?.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.ok && msg.result) entry.resolve(msg.result);
      else entry.reject(new Error(msg.error || 'Track analysis failed'));
    });
    const created = this.worker;
    this.worker.addEventListener('error', err => {
      // Fail everything pending; callers fall back to heuristic mixing
      const reason = new Error((err as ErrorEvent)?.message || 'DJ analyzer worker crashed');
      for (const [, entry] of this.pending) entry.reject(reason);
      this.pending.clear();
      // Tear down the dead worker so the next analyze() recreates a fresh one
      // instead of posting into a void and hanging the queue forever
      try { created.terminate(); } catch {}
      if (this.worker === created) this.worker = null;
    });
    return this.worker;
  }

  ngOnDestroy(): void {
    this.worker?.terminate();
    this.worker = null;
    const reason = new Error('TrackAnalysisService destroyed');
    for (const [, entry] of this.pending) entry.reject(reason);
    this.pending.clear();
  }
}
