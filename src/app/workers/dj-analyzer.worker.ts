/// <reference lib="webworker" />

// Messages: { type: 'analyze', pcm: Float32Array, sampleRate: number, id: string }
addEventListener('message', async (e: MessageEvent) => {
  const data = e.data as { type: string; pcm: Float32Array; sampleRate: number; id: string };
  if (!data || data.type !== 'analyze') return;
  const { pcm, sampleRate, id } = data;

  const bpm = estimateBpmHeuristic(pcm, sampleRate);
  const beatgrid = estimateBeatgrid(pcm, sampleRate, bpm);
  const key = estimateKeyHeuristic(pcm, sampleRate);
  const structure = estimateStructureHeuristic(pcm, sampleRate, bpm);

  postMessage({ id, ok: true, result: { bpm, beatgrid, key, structure } });
});

function estimateBpmHeuristic(pcm: Float32Array, sr: number): number {
  const minBpm = 80, maxBpm = 180;
  const minLag = Math.floor((60 / maxBpm) * sr);
  const maxLag = Math.floor((60 / minBpm) * sr);
  let bestLag = minLag, best = 0;
  for (let lag = minLag; lag <= maxLag; lag += 10) {
    let sum = 0;
    for (let i = 0; i < pcm.length - lag; i += 128) sum += Math.abs(pcm[i] * pcm[i + lag]);
    if (sum > best) { best = sum; bestLag = lag; }
  }
  const bpm = 60 / (bestLag / sr);
  return normalizeBpm(bpm);
}

function normalizeBpm(bpm: number): number {
  while (bpm < 90) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm);
}

function estimateBeatgrid(_pcm: Float32Array, _sr: number, bpm: number) {
  const spb = 60 / bpm;
  return { start: 0, interval: spb, bars: [] as Array<{ start: number; lengthBeats: number }> };
}

function estimateKeyHeuristic(_pcm: Float32Array, _sr: number): string {
  return '8A';
}

function estimateStructureHeuristic(_pcm: Float32Array, _sr: number, bpm: number) {
  const spb = 60 / bpm;
  const blocks = [
    { start: 0, end: 32 * spb, type: 'intro' },
    { start: 32 * spb, end: 64 * spb, type: 'build-up' },
    { start: 64 * spb, end: 96 * spb, type: 'drop' },
    { start: 96 * spb, end: 128 * spb, type: 'breakdown' }
  ];
  return blocks;
}
