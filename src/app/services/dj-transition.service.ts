import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DjTransitionService {
  private audioContext: AudioContext | null = null;

  constructor() {
    // Create AudioContext when needed to avoid autoplay policy issues
  }

  /**
   * Creates a professional DJ transition between two audio sources
   * @param currentSource Current audio source node
   * @param nextSource Next audio source node
   * @param currentBpm BPM of the current song
   * @param nextBpm BPM of the next song
   * @param audioContext The audio context
   * @returns Object containing nodes for the transition
   */
  createTransition(
    currentSource: AudioNode,
    nextSource: AudioNode,
    currentBpm: number,
    nextBpm: number,
    audioContext: AudioContext
  ): {
    currentChain: AudioNode,
    nextChain: AudioNode,
    transitionNodes: {
      currentEqLow: BiquadFilterNode,
      currentEqMid: BiquadFilterNode,
      currentEqHigh: BiquadFilterNode,
      nextEqLow: BiquadFilterNode,
      nextEqMid: BiquadFilterNode,
      nextEqHigh: BiquadFilterNode,
      currentGain: GainNode,
      nextGain: GainNode
    }
  } {
    this.audioContext = audioContext;

    // Create 3-band EQ for current song
    const currentEqLow = audioContext.createBiquadFilter();
    currentEqLow.type = 'lowshelf';
    currentEqLow.frequency.value = 200;
    currentEqLow.gain.value = 0;

    const currentEqMid = audioContext.createBiquadFilter();
    currentEqMid.type = 'peaking';
    currentEqMid.frequency.value = 1000;
    currentEqMid.Q.value = 1;
    currentEqMid.gain.value = 0;

    const currentEqHigh = audioContext.createBiquadFilter();
    currentEqHigh.type = 'highshelf';
    currentEqHigh.frequency.value = 3200;
    currentEqHigh.gain.value = 0;

    // Create 3-band EQ for next song
    const nextEqLow = audioContext.createBiquadFilter();
    nextEqLow.type = 'lowshelf';
    nextEqLow.frequency.value = 200;
    nextEqLow.gain.value = 0;

    const nextEqMid = audioContext.createBiquadFilter();
    nextEqMid.type = 'peaking';
    nextEqMid.frequency.value = 1000;
    nextEqMid.Q.value = 1;
    nextEqMid.gain.value = 0;

    const nextEqHigh = audioContext.createBiquadFilter();
    nextEqHigh.type = 'highshelf';
    nextEqHigh.frequency.value = 3200;
    nextEqHigh.gain.value = 0;

    // Create gain nodes for volume control
    const currentGain = audioContext.createGain();
    const nextGain = audioContext.createGain();

    // Connect current song chain
    currentSource
      .connect(currentEqLow)
      .connect(currentEqMid)
      .connect(currentEqHigh)
      .connect(currentGain);

    // Connect next song chain
    nextSource
      .connect(nextEqLow)
      .connect(nextEqMid)
      .connect(nextEqHigh)
      .connect(nextGain);

    return {
      currentChain: currentGain,
      nextChain: nextGain,
      transitionNodes: {
        currentEqLow,
        currentEqMid,
        currentEqHigh,
        nextEqLow,
        nextEqMid,
        nextEqHigh,
        currentGain,
        nextGain
      }
    };
  }

  /**
   * Starts a professional DJ transition between two songs
   * @param transitionNodes The transition nodes
   * @param currentBpm BPM of the current song
   * @param nextBpm BPM of the next song
   * @param remainingTime Remaining time of the current song in seconds
   * @param audioContext The audio context
   */
  startTransition(
    transitionNodes: {
      currentEqLow: BiquadFilterNode,
      currentEqMid: BiquadFilterNode,
      currentEqHigh: BiquadFilterNode,
      nextEqLow: BiquadFilterNode,
      nextEqMid: BiquadFilterNode,
      nextEqHigh: BiquadFilterNode,
      currentGain: GainNode,
      nextGain: GainNode
    },
    currentBpm: number,
    nextBpm: number,
    remainingTime: number,
    audioContext: AudioContext,
    aiAudioProcessingService?: any, // Optional: inject AI service for advanced mixing
    currentSourceNode?: AudioNode,
    nextSourceNode?: AudioNode
  ): void {
    const now = audioContext.currentTime;
    const transitionDuration = Math.min(remainingTime, 32);
    const currentBeatDuration = 60 / currentBpm;
    const nextBeatDuration = 60 / nextBpm;
    const currentPhraseDuration = currentBeatDuration * 8;
    const nextPhraseDuration = nextBeatDuration * 8;
    const phrasesInTransition = Math.floor(transitionDuration / currentPhraseDuration);
    const bpmRatio = Math.max(currentBpm, nextBpm) / Math.min(currentBpm, nextBpm);
    const canBeatmatch = bpmRatio < 1.1;

    // --- AI-driven mixing enhancement ---
    if (aiAudioProcessingService && currentSourceNode && nextSourceNode) {
      // Analyze both tracks and get AI suggestions
      // (Assume both sources are connected to AnalyserNodes elsewhere)
      // Here, you would fetch frequency data for both tracks and get suggestions
      // For demonstration, we'll call a method if available
      if (typeof aiAudioProcessingService.applyAIMixTransition === 'function') {
        aiAudioProcessingService.applyAIMixTransition(
          currentSourceNode,
          nextSourceNode,
          audioContext,
          transitionDuration
        );
      }
    }
    // --- End AI enhancement ---

    this.applyEqTransition(transitionNodes, now, transitionDuration, phrasesInTransition);
    this.applyVolumeTransition(transitionNodes, now, transitionDuration, phrasesInTransition);
    if (canBeatmatch) {
      console.log(`Applying beatmatching: Current BPM ${currentBpm}, Next BPM ${nextBpm}`);
      // In a real implementation, adjust playback rate for beatmatching
    }
  }

  /**
   * Applies a professional EQ-based transition
   * @param transitionNodes The transition nodes
   * @param startTime The start time
   * @param duration The transition duration
   * @param phrases Number of phrases in the transition
   */
  private applyEqTransition(
    transitionNodes: {
      currentEqLow: BiquadFilterNode,
      currentEqMid: BiquadFilterNode,
      currentEqHigh: BiquadFilterNode,
      nextEqLow: BiquadFilterNode,
      nextEqMid: BiquadFilterNode,
      nextEqHigh: BiquadFilterNode,
      currentGain: GainNode,
      nextGain: GainNode
    },
    startTime: number,
    duration: number,
    phrases: number
  ): void {
    // Professional DJs typically start by bringing in the highs of the next track,
    // then the mids, and finally the bass (to avoid bass clashing)

    const {
      currentEqLow, currentEqMid, currentEqHigh,
      nextEqLow, nextEqMid, nextEqHigh
    } = transitionNodes;

    // Phase 1: Bring in highs of next track (first 25% of transition)
    const phase1End = startTime + (duration * 0.25);

    // Start with next track's highs cut
    nextEqHigh.gain.setValueAtTime(-12, startTime);
    // Gradually bring in the highs
    nextEqHigh.gain.linearRampToValueAtTime(0, phase1End);

    // Phase 2: Bring in mids of next track, start reducing highs of current (25-50% of transition)
    const phase2End = startTime + (duration * 0.5);

    // Start with next track's mids cut
    nextEqMid.gain.setValueAtTime(-12, startTime);
    // Gradually bring in the mids
    nextEqMid.gain.linearRampToValueAtTime(0, phase2End);

    // Start reducing current track's highs
    currentEqHigh.gain.setValueAtTime(0, phase1End);
    currentEqHigh.gain.linearRampToValueAtTime(-6, phase2End);

    // Phase 3: Bring in bass of next track, reduce mids of current (50-75% of transition)
    const phase3End = startTime + (duration * 0.75);

    // Start with next track's bass cut
    nextEqLow.gain.setValueAtTime(-12, startTime);
    // Gradually bring in the bass
    nextEqLow.gain.linearRampToValueAtTime(0, phase3End);

    // Reduce current track's mids
    currentEqMid.gain.setValueAtTime(0, phase2End);
    currentEqMid.gain.linearRampToValueAtTime(-6, phase3End);

    // Phase 4: Reduce bass of current track (75-100% of transition)
    const phase4End = startTime + duration;

    // Reduce current track's bass
    currentEqLow.gain.setValueAtTime(0, phase3End);
    currentEqLow.gain.linearRampToValueAtTime(-12, phase4End);

    // Further reduce current track's highs and mids
    currentEqHigh.gain.linearRampToValueAtTime(-12, phase4End);
    currentEqMid.gain.linearRampToValueAtTime(-12, phase4End);
  }

  /**
   * Applies a volume transition
   * @param transitionNodes The transition nodes
   * @param startTime The start time
   * @param duration The transition duration
   * @param phrases Number of phrases in the transition
   */
  private applyVolumeTransition(
    transitionNodes: {
      currentEqLow: BiquadFilterNode,
      currentEqMid: BiquadFilterNode,
      currentEqHigh: BiquadFilterNode,
      nextEqLow: BiquadFilterNode,
      nextEqMid: BiquadFilterNode,
      nextEqHigh: BiquadFilterNode,
      currentGain: GainNode,
      nextGain: GainNode
    },
    startTime: number,
    duration: number,
    phrases: number
  ): void {
    const { currentGain, nextGain } = transitionNodes;

    // Start with current track at full volume and next track at low volume
    currentGain.gain.setValueAtTime(1.0, startTime);
    nextGain.gain.setValueAtTime(0.1, startTime);

    // Gradually adjust volumes over the transition duration
    // Use an exponential curve for more natural volume transition

    // For current track: stay loud longer, then fade out more quickly at the end
    // This is more musical than a linear fade
    const currentVolumeCurve = [
      { time: startTime, value: 1.0 },
      { time: startTime + (duration * 0.6), value: 0.9 }, // Stay loud for 60% of transition
      { time: startTime + (duration * 0.8), value: 0.7 }, // Start fading more
      { time: startTime + duration, value: 0.0 }          // Complete fade out
    ];

    // For next track: start quiet, increase gradually, then more quickly at the end
    const nextVolumeCurve = [
      { time: startTime, value: 0.1 },
      { time: startTime + (duration * 0.3), value: 0.3 }, // Gradual increase
      { time: startTime + (duration * 0.7), value: 0.7 }, // More increase
      { time: startTime + duration, value: 1.0 }          // Full volume
    ];

    // Apply the volume curves
    for (let i = 0; i < currentVolumeCurve.length - 1; i++) {
      const point = currentVolumeCurve[i];
      const nextPoint = currentVolumeCurve[i + 1];

      currentGain.gain.setValueAtTime(point.value, point.time);
      currentGain.gain.linearRampToValueAtTime(nextPoint.value, nextPoint.time);
    }

    for (let i = 0; i < nextVolumeCurve.length - 1; i++) {
      const point = nextVolumeCurve[i];
      const nextPoint = nextVolumeCurve[i + 1];

      nextGain.gain.setValueAtTime(point.value, point.time);
      nextGain.gain.linearRampToValueAtTime(nextPoint.value, nextPoint.time);
    }
  }

  /**
   * Calculates the optimal start time for the next song based on BPM and phrase alignment
   * @param currentTime Current playback time of the current song in seconds
   * @param currentDuration Total duration of the current song in seconds
   * @param currentBpm BPM of the current song
   * @param nextBpm BPM of the next song
   * @returns The optimal time to start the next song in seconds
   */
  calculateOptimalStartTime(
    currentTime: number,
    currentDuration: number,
    currentBpm: number,
    nextBpm: number
  ): number {
    // Calculate beat duration
    const currentBeatDuration = 60 / currentBpm;

    // Calculate phrase duration (typically 4, 8, 16, or 32 beats)
    // We'll use 8 beats as a standard phrase
    const phraseDuration = currentBeatDuration * 8;

    // Calculate remaining time
    const remainingTime = currentDuration - currentTime;

    // Calculate number of complete phrases that fit in the remaining time
    const completePhrasesRemaining = Math.floor(remainingTime / phraseDuration);

    // Start transition earlier to ensure no gap between songs
    // We want to start the transition at the beginning of the last complete phrase
    // or if less than one phrase remains, start immediately
    if (completePhrasesRemaining <= 1) {
      return Math.max(0, currentDuration - 32); // At least 32 seconds for transition (increased from 24)
    }

    // Calculate the start time of the last phrase - start 4 phrases before the end instead of 3
    // This gives more time for the transition to complete smoothly and ensures the next song
    // starts playing well before the current one ends
    const transitionStartTime = currentDuration - (phraseDuration * 4); // 4 phrases before the end (increased from 3)

    return Math.max(currentTime, transitionStartTime);
  }
}
