declare module 'music-tempo' {
  export default class MusicTempo {
    constructor(audioData: Float32Array | number[], params?: Record<string, unknown>);
    tempo: string | number;
    beats: number[];
    beatInterval: number;
    spectralFlux: number[];
    events: number[];
    peaks: number[];
  }
}
