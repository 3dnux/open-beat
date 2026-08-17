/// <reference lib="webworker" />
/**
 * DJ track analyzer — real DSP, runs off the main thread.
 *
 * Given mono PCM at 44100 Hz it computes everything a pro auto-DJ needs:
 *  - Tempo + beatgrid (music-tempo beat tracking, least-squares grid fit)
 *  - Downbeats / bar phase (kick-energy comb over the 4 beat phases)
 *  - Musical key via chromagram + Krumhansl-Schmuckler profiles -> Camelot code
 *  - Energy curve, structure (intro end / outro start / drops)
 *  - Loudness (RMS) for automatic gain staging
 *  - Suggested mix-in point (first downbeat once the track gets going)
 *
 * Protocol:
 *   in : { type: 'analyze', pcm: Float32Array, sampleRate: number, id: string }
 *   out: { id, ok: true, result: TrackAnalysisResult } | { id, ok: false, error }
 */
import MusicTempo from 'music-tempo';

export interface TrackAnalysisResult {
  duration: number;
  bpm: number;                // 0 when tempo detection failed
  beatInterval: number;       // seconds per beat
  beatOffset: number;         // phase of the beatgrid in [0, beatInterval)
  barDuration: number;        // 4 beats
  downbeatOffset: number;     // phase of bar starts in [0, barDuration)
  camelot: string;            // e.g. '8A' ('' when unknown)
  keyName: string;            // e.g. 'A minor'
  keyConfidence: number;      // 0-1
  energy: number;             // 0-1 overall intensity
  loudness: number;           // representative RMS, for auto-gain
  introEnd: number;           // seconds - where the track is fully going
  outroStart: number;         // seconds - where the energy starts winding down
  drops: number[];            // timestamps of detected drops
  mixInPoint: number;         // suggested downbeat to start this track on
}

// ---------------------------------------------------------------------------
// FFT (iterative radix-2, real input)
// ---------------------------------------------------------------------------

function fftMagnitudes(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k], aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(p * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function movingAverage(data: number[], windowSize: number): number[] {
  const out = new Array(data.length).fill(0);
  let sum = 0;
  const q: number[] = [];
  for (let i = 0; i < data.length; i++) {
    q.push(data[i]);
    sum += data[i];
    if (q.length > windowSize) sum -= q.shift()!;
    out[i] = sum / q.length;
  }
  return out;
}

function rmsRange(pcm: Float32Array, start: number, end: number): number {
  let sum = 0;
  const s = Math.max(0, Math.floor(start));
  const e = Math.min(pcm.length, Math.floor(end));
  if (e <= s) return 0;
  for (let i = s; i < e; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / (e - s));
}

// ---------------------------------------------------------------------------
// Energy curve + structure
// ---------------------------------------------------------------------------

function analyzeEnergy(pcm: Float32Array, sr: number, duration: number) {
  const win = Math.floor(sr * 0.5); // 0.5s windows
  const nWin = Math.max(1, Math.floor(pcm.length / win));
  const curve: number[] = new Array(nWin);      // broadband RMS (loudness)
  const brightness: number[] = new Array(nWin); // first-difference RMS (mid/high content)
  for (let i = 0; i < nWin; i++) {
    const s = i * win;
    const e = Math.min(pcm.length, s + win);
    let sum = 0;
    let dsum = 0;
    for (let j = s; j < e; j++) {
      sum += pcm[j] * pcm[j];
      const d = pcm[j] - (j > 0 ? pcm[j - 1] : 0);
      dsum += d * d;
    }
    const len = Math.max(1, e - s);
    curve[i] = Math.sqrt(sum / len);
    brightness[i] = Math.sqrt(dsum / len);
  }

  // Structure segmentation uses BRIGHTNESS, not broadband RMS: in EDM outros
  // the kick keeps the RMS high while synths/vocals drop out, so mid/high
  // content is a far better section indicator.
  const sortedB = [...brightness].sort((a, b) => a - b);
  const refB = Math.max(1e-6, percentile(sortedB, 0.95));
  const norm = brightness.map(v => Math.min(1, v / refB));
  const smooth = movingAverage(norm, 8); // ~4s smoothing

  const sorted = [...curve].sort((a, b) => a - b);

  // Loudness: representative RMS of the body of the track (auto-gain reference)
  const loStart = Math.floor(nWin * 0.2);
  const loEnd = Math.max(loStart + 1, Math.floor(nWin * 0.8));
  const body = curve.slice(loStart, loEnd).sort((a, b) => a - b);
  const loudness = percentile(body, 0.6);

  // Overall energy: mean of the smoothed body
  const bodySmooth = smooth.slice(loStart, loEnd);
  const energy = bodySmooth.length
    ? Math.min(1, bodySmooth.reduce((a, b) => a + b, 0) / bodySmooth.length)
    : 0.5;

  const toTime = (idx: number) => (idx * win) / sr;

  // Intro end: first sustained (4 windows = 2s) stretch above 0.5
  let introEnd = 0;
  for (let i = 0; i < smooth.length - 4; i++) {
    if (smooth[i] >= 0.5 && smooth[i + 1] >= 0.5 && smooth[i + 2] >= 0.5 && smooth[i + 3] >= 0.5) {
      introEnd = toTime(i);
      break;
    }
  }
  introEnd = Math.min(introEnd, duration * 0.4);

  // Outro start: after the last window above 0.55 the track is winding down
  let lastLoud = smooth.length - 1;
  for (let i = smooth.length - 1; i >= 0; i--) {
    if (smooth[i] >= 0.55) { lastLoud = i; break; }
  }
  let outroStart = toTime(lastLoud);
  outroStart = Math.min(outroStart, Math.max(0, duration - 8));

  // First energetic moment (mix-in anchor)
  let firstEnergetic = 0;
  for (let i = 0; i < smooth.length; i++) {
    if (smooth[i] >= 0.35) { firstEnergetic = toTime(i); break; }
  }

  // Drops: sharp sustained rises to a high level after a quieter stretch
  const drops: number[] = [];
  for (let i = 8; i < smooth.length; i++) {
    let prevMin = 1;
    for (let j = Math.max(0, i - 16); j < i; j++) prevMin = Math.min(prevMin, smooth[j]);
    if (smooth[i] >= 0.75 && smooth[i] - prevMin >= 0.3) {
      const t = toTime(i);
      if (!drops.length || t - drops[drops.length - 1] > 8) drops.push(t);
    }
  }

  return { energy, loudness, introEnd, outroStart, firstEnergetic, drops };
}

// ---------------------------------------------------------------------------
// Tempo + beatgrid
// ---------------------------------------------------------------------------

function analyzeTempo(pcm: Float32Array, sr: number, duration: number) {
  // Analyze an excerpt from the body of the track (skips intro ambience)
  const excerptLen = Math.min(Math.floor(70 * sr), pcm.length);
  const excerptStartSec = Math.min(duration * 0.25, Math.max(0, duration - excerptLen / sr));
  const excerptStart = Math.floor(excerptStartSec * sr);
  const excerpt = pcm.subarray(excerptStart, excerptStart + excerptLen);

  let bpm = 0;
  let beats: number[] = [];
  try {
    const mt = new MusicTempo(excerpt as unknown as Float32Array);
    bpm = parseFloat(String(mt.tempo)) || 0;
    beats = Array.isArray(mt.beats) ? mt.beats : [];
  } catch {
    return { bpm: 0, beatInterval: 0, beatOffset: 0, barDuration: 0, downbeatOffset: 0 };
  }
  if (!bpm || beats.length < 8) {
    return { bpm: 0, beatInterval: 0, beatOffset: 0, barDuration: 0, downbeatOffset: 0 };
  }

  // Fold octave errors into the typical DJ range
  while (bpm < 68) bpm *= 2;
  while (bpm > 185) bpm /= 2;

  // Seed interval from the beat tracker's own taps
  const diffs: number[] = [];
  for (let i = 1; i < beats.length; i++) diffs.push(beats[i] - beats[i - 1]);
  let interval = median(diffs);
  if (interval <= 0.1 || interval > 2) interval = 60 / bpm;

  // --- Comb refinement against the audio itself (rekordbox-style grid snap).
  // Beat trackers quantize taps to their hop size; instead of trusting them,
  // sweep the interval ±3% and pick the (interval, phase) whose comb of grid
  // points lands on maximum onset energy in the actual signal.
  const hop = Math.floor(sr * 0.005); // 5ms resolution
  const envLen = Math.floor(excerptLen / hop);
  const env = new Float32Array(envLen);
  for (let i = 0; i < envLen; i++) {
    // short attack-weighted energy: energy at the point minus just before
    const at = rmsRange(excerpt, i * hop, i * hop + Math.floor(0.03 * sr));
    const before = rmsRange(excerpt, i * hop - Math.floor(0.03 * sr), i * hop);
    env[i] = Math.max(0, at - before * 0.7) + at * 0.15;
  }
  const combScore = (T: number, phase: number): number => {
    let s = 0;
    let teeth = 0;
    for (let t = phase; t < excerptLen / sr; t += T) {
      const idx = Math.round((t * sr) / hop);
      if (idx >= 0 && idx < envLen) { s += env[idx]; teeth++; }
    }
    // Normalize by tooth count: a raw sum systematically favors smaller
    // intervals (more comb teeth) on weak-transient material
    return teeth > 0 ? s / teeth : 0;
  };
  let bestT = interval;
  let bestPhase = beats[0] % interval;
  let bestScore = -1;
  for (let step = -30; step <= 30; step++) {
    const T = interval * (1 + step * 0.001); // ±3% in 0.1% steps
    // coarse phase scan
    let localBest = -1;
    let localPhase = 0;
    for (let p = 0; p < 16; p++) {
      const phase = (p / 16) * T;
      const s = combScore(T, phase);
      if (s > localBest) { localBest = s; localPhase = phase; }
    }
    if (localBest > bestScore) {
      bestScore = localBest;
      bestT = T;
      bestPhase = localPhase;
    }
  }
  // fine phase scan around the winner
  {
    let localBest = -1;
    for (let p = -8; p <= 8; p++) {
      const phase = bestPhase + (p / 128) * bestT;
      const s = combScore(bestT, phase);
      if (s > localBest) { localBest = s; bestPhase = phase; }
    }
  }
  interval = bestT;
  const a = ((bestPhase % interval) + interval) % interval;

  const bpmRefined = 60 / interval;
  const globalOffset = excerptStartSec + a;
  const beatOffset = ((globalOffset % interval) + interval) % interval;

  // Downbeat: which of the 4 beat phases carries the most kick energy
  const barDuration = interval * 4;
  const winSamples = Math.floor(0.09 * sr);
  const phaseScore = [0, 0, 0, 0];
  const maxBeats = Math.min(beats.length, 96);
  for (let i = 0; i < maxBeats; i++) {
    // Bucket each beat by its GRID index, not its array index: missed/extra
    // taps in beats[] would otherwise scramble the 4-phase histogram
    const k = Math.round((beats[i] - a) / interval);
    const tGlobal = excerptStartSec + a + k * interval;
    const s = Math.floor(tGlobal * sr);
    phaseScore[((k % 4) + 4) % 4] += rmsRange(pcm, s, s + winSamples);
  }
  let bestBar = 0;
  for (let p = 1; p < 4; p++) if (phaseScore[p] > phaseScore[bestBar]) bestBar = p;
  const downbeatOffset = (((globalOffset + bestBar * interval) % barDuration) + barDuration) % barDuration;

  return {
    bpm: Math.round(bpmRefined * 100) / 100,
    beatInterval: interval,
    beatOffset,
    barDuration,
    downbeatOffset
  };
}

// ---------------------------------------------------------------------------
// Key detection (chromagram + Krumhansl-Schmuckler -> Camelot)
// ---------------------------------------------------------------------------

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// Krumhansl-Kessler key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
// pitch class (0=C) -> Camelot number
const CAMELOT_MAJOR: Record<number, number> = { 11: 1, 6: 2, 1: 3, 8: 4, 3: 5, 10: 6, 5: 7, 0: 8, 7: 9, 2: 10, 9: 11, 4: 12 };
const CAMELOT_MINOR: Record<number, number> = { 8: 1, 3: 2, 10: 3, 5: 4, 0: 5, 7: 6, 2: 7, 9: 8, 4: 9, 11: 10, 6: 11, 1: 12 };

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i];
    sxx += x[i] * x[i]; syy += y[i] * y[i];
    sxy += x[i] * y[i];
  }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx <= 0 || vy <= 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

function analyzeKey(pcm: Float32Array, sr: number, duration: number) {
  const N = 4096;
  const excerptLen = Math.min(Math.floor(70 * sr), pcm.length);
  const excerptStart = Math.floor(Math.min(duration * 0.25, Math.max(0, duration - excerptLen / sr)) * sr);

  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));

  const chroma = new Array(12).fill(0);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const binHz = sr / N;
  // Start above the kick-drum fundamental range (tuned kicks around 40-100 Hz
  // would otherwise bias the chroma toward the kick's pitch class)
  const minBin = Math.max(1, Math.ceil(110 / binHz));
  const maxBin = Math.min(N / 2 - 1, Math.floor(4200 / binHz));

  // Precompute bin -> pitch-class map
  const binPc = new Int8Array(maxBin + 1).fill(-1);
  for (let b = minBin; b <= maxBin; b++) {
    const f = b * binHz;
    const midi = Math.round(69 + 12 * Math.log2(f / 440));
    binPc[b] = ((midi % 12) + 12) % 12;
  }

  const nFrames = Math.floor((excerptLen - N) / N);
  for (let fIdx = 0; fIdx < nFrames; fIdx++) {
    const off = excerptStart + fIdx * N;
    for (let i = 0; i < N; i++) {
      re[i] = pcm[off + i] * hann[i];
      im[i] = 0;
    }
    fftMagnitudes(re, im);
    for (let b = minBin; b <= maxBin; b++) {
      const pc = binPc[b];
      if (pc < 0) continue;
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      chroma[pc] += Math.sqrt(mag); // compress dynamics
    }
  }

  const total = chroma.reduce((x, y) => x + y, 0);
  if (total <= 0) return { camelot: '', keyName: '', keyConfidence: 0 };
  const c = chroma.map(v => v / total);

  let best = { score: -2, tonic: 0, major: true };
  let second = -2;
  for (const major of [true, false]) {
    const profile = major ? MAJOR_PROFILE : MINOR_PROFILE;
    for (let tonic = 0; tonic < 12; tonic++) {
      const rotated: number[] = new Array(12);
      for (let i = 0; i < 12; i++) rotated[i] = profile[((i - tonic) % 12 + 12) % 12];
      const score = pearson(c, rotated);
      if (score > best.score) {
        second = best.score;
        best = { score, tonic, major };
      } else if (score > second) {
        second = score;
      }
    }
  }

  const num = best.major ? CAMELOT_MAJOR[best.tonic] : CAMELOT_MINOR[best.tonic];
  const camelot = `${num}${best.major ? 'B' : 'A'}`;
  const keyName = `${NOTE_NAMES[best.tonic]} ${best.major ? 'major' : 'minor'}`;
  const keyConfidence = Math.max(0, Math.min(1, best.score - second));
  return { camelot, keyName, keyConfidence };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function analyzeTrack(pcm: Float32Array, sr: number): TrackAnalysisResult {
  const duration = pcm.length / sr;
  const energyInfo = analyzeEnergy(pcm, sr, duration);
  const grid = analyzeTempo(pcm, sr, duration);
  const key = analyzeKey(pcm, sr, duration);

  // Mix-in: first downbeat at/after the first energetic moment
  let mixInPoint = 0;
  if (grid.barDuration > 0) {
    const anchor = Math.max(0, energyInfo.firstEnergetic - 0.05);
    const k = Math.ceil((anchor - grid.downbeatOffset) / grid.barDuration);
    mixInPoint = grid.downbeatOffset + Math.max(0, k) * grid.barDuration;
    if (mixInPoint > duration * 0.5) mixInPoint = grid.downbeatOffset;
  } else {
    mixInPoint = energyInfo.firstEnergetic;
  }

  return {
    duration,
    bpm: grid.bpm,
    beatInterval: grid.beatInterval,
    beatOffset: grid.beatOffset,
    barDuration: grid.barDuration,
    downbeatOffset: grid.downbeatOffset,
    camelot: key.camelot,
    keyName: key.keyName,
    keyConfidence: key.keyConfidence,
    energy: energyInfo.energy,
    loudness: energyInfo.loudness,
    introEnd: energyInfo.introEnd,
    outroStart: energyInfo.outroStart,
    drops: energyInfo.drops,
    mixInPoint
  };
}

self.addEventListener('message', (ev: MessageEvent) => {
  const data = ev.data as { type?: string; pcm?: Float32Array; sampleRate?: number; id?: string };
  if (!data || data.type !== 'analyze' || !data.pcm || !data.sampleRate || !data.id) return;
  try {
    const result = analyzeTrack(data.pcm, data.sampleRate);
    (self as unknown as Worker).postMessage({ id: data.id, ok: true, result });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id: data.id, ok: false, error: String(e) });
  }
});
