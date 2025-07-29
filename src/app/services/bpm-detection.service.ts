import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class BpmDetectionService {
  private audioContext: AudioContext | null = null;

  constructor() {
    // Create AudioContext when needed to avoid autoplay policy issues
  }

  /**
   * Detects the BPM (Beats Per Minute) of an audio file
   * @param audioBuffer The AudioBuffer containing the audio data
   * @returns Promise that resolves to the detected BPM
   */
  async detectBpm(audioBuffer: AudioBuffer): Promise<number> {
    // Initialize audio context if not already created
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    // Get audio data from the buffer
    const audioData = audioBuffer.getChannelData(0); // Use first channel

    // Process in chunks to handle longer songs efficiently
    const chunkSize = Math.min(audioBuffer.length, audioBuffer.sampleRate * 30); // 30 seconds max
    const chunks = Math.ceil(audioData.length / chunkSize);

    let bpmCandidates: number[] = [];

    // Process each chunk
    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, audioData.length);
      const chunkData = audioData.slice(start, end);

      // Get BPM for this chunk
      const chunkBpm = this.calculateBpmForChunk(chunkData, audioBuffer.sampleRate);
      if (chunkBpm > 0) {
        bpmCandidates.push(chunkBpm);
      }
    }

    // If no valid BPM found, return default
    if (bpmCandidates.length === 0) {
      return 120; // Default BPM
    }

    // Return the most common BPM from all chunks
    return this.findMostCommonBpm(bpmCandidates);
  }

  /**
   * Calculates BPM for a chunk of audio data
   * @param audioData Audio data array
   * @param sampleRate Sample rate of the audio
   * @returns Detected BPM
   */
  private calculateBpmForChunk(audioData: Float32Array, sampleRate: number): number {
    // Step 1: Apply low-pass filter to focus on bass frequencies (where beats are most prominent)
    const filteredData = this.lowPassFilter(audioData, sampleRate);

    // Step 2: Detect energy peaks (beats)
    const peaks = this.findPeaks(filteredData, sampleRate);

    // Step 3: Calculate intervals between peaks
    const intervals = this.getIntervals(peaks, sampleRate);

    // Step 4: Group intervals by tempo
    const tempoGroups = this.groupByTempo(intervals);

    // Step 5: Find the most common tempo group
    const bpm = this.findDominantTempo(tempoGroups);

    return bpm;
  }

  /**
   * Applies a simple low-pass filter to focus on bass frequencies
   * @param audioData Audio data array
   * @param sampleRate Sample rate of the audio
   * @returns Filtered audio data
   */
  private lowPassFilter(audioData: Float32Array, sampleRate: number): Float32Array {
    const result = new Float32Array(audioData.length);

    // Simple moving average filter
    const filterSize = Math.round(sampleRate / 100); // ~10ms window

    for (let i = 0; i < audioData.length; i++) {
      let sum = 0;
      let count = 0;

      for (let j = Math.max(0, i - filterSize); j < Math.min(audioData.length, i + filterSize); j++) {
        sum += Math.abs(audioData[j]);
        count++;
      }

      result[i] = sum / count;
    }

    return result;
  }

  /**
   * Finds peaks in the audio data that represent beats
   * @param audioData Filtered audio data
   * @param sampleRate Sample rate of the audio
   * @returns Array of peak positions (in samples)
   */
  private findPeaks(audioData: Float32Array, sampleRate: number): number[] {
    const peaks: number[] = [];
    const threshold = this.calculateThreshold(audioData);
    const minPeakDistance = Math.round(sampleRate * 0.2); // Minimum 200ms between peaks

    let prevPeak = -minPeakDistance;

    for (let i = 1; i < audioData.length - 1; i++) {
      if (audioData[i] > threshold &&
          audioData[i] > audioData[i-1] &&
          audioData[i] >= audioData[i+1] &&
          i - prevPeak >= minPeakDistance) {
        peaks.push(i);
        prevPeak = i;
      }
    }

    return peaks;
  }

  /**
   * Calculates a dynamic threshold for peak detection
   * @param audioData Audio data array
   * @returns Threshold value
   */
  private calculateThreshold(audioData: Float32Array): number {
    // Calculate mean and standard deviation
    let sum = 0;
    let sumSquares = 0;

    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i];
      sumSquares += audioData[i] * audioData[i];
    }

    const mean = sum / audioData.length;
    const variance = (sumSquares / audioData.length) - (mean * mean);
    const stdDev = Math.sqrt(variance);

    // Threshold = mean + 1.5 * standard deviation
    return mean + (1.5 * stdDev);
  }

  /**
   * Calculates intervals between peaks
   * @param peaks Array of peak positions
   * @param sampleRate Sample rate of the audio
   * @returns Array of intervals in milliseconds
   */
  private getIntervals(peaks: number[], sampleRate: number): number[] {
    const intervals: number[] = [];

    for (let i = 1; i < peaks.length; i++) {
      const interval = (peaks[i] - peaks[i-1]) / sampleRate * 1000; // Convert to ms
      intervals.push(interval);
    }

    return intervals;
  }

  /**
   * Groups intervals by tempo
   * @param intervals Array of intervals in milliseconds
   * @returns Map of tempo groups
   */
  private groupByTempo(intervals: number[]): Map<number, number> {
    const tempoGroups = new Map<number, number>();

    // BPM range to check (60-180 BPM is common for most music)
    const minBpm = 60;
    const maxBpm = 180;

    for (const interval of intervals) {
      // Convert interval to BPM
      let bpm = 60000 / interval;

      // Handle half/double tempo
      while (bpm < minBpm) bpm *= 2;
      while (bpm > maxBpm) bpm /= 2;

      // Round to nearest integer BPM
      const roundedBpm = Math.round(bpm);

      // Add to tempo groups
      tempoGroups.set(roundedBpm, (tempoGroups.get(roundedBpm) || 0) + 1);
    }

    return tempoGroups;
  }

  /**
   * Finds the most common tempo from the tempo groups
   * @param tempoGroups Map of tempo groups
   * @returns The most common BPM
   */
  private findDominantTempo(tempoGroups: Map<number, number>): number {
    let maxCount = 0;
    let dominantBpm = 120; // Default BPM

    tempoGroups.forEach((count, bpm) => {
      if (count > maxCount) {
        maxCount = count;
        dominantBpm = bpm;
      }
    });

    return dominantBpm;
  }

  /**
   * Finds the most common BPM from an array of BPM candidates
   * @param bpmCandidates Array of BPM values
   * @returns The most common BPM
   */
  private findMostCommonBpm(bpmCandidates: number[]): number {
    const bpmCounts = new Map<number, number>();

    for (const bpm of bpmCandidates) {
      const roundedBpm = Math.round(bpm);
      bpmCounts.set(roundedBpm, (bpmCounts.get(roundedBpm) || 0) + 1);
    }

    let maxCount = 0;
    let mostCommonBpm = 120; // Default BPM

    bpmCounts.forEach((count, bpm) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonBpm = bpm;
      }
    });

    return mostCommonBpm;
  }
}
