import { Injectable } from '@angular/core';

// Interface for emotion analysis results
export interface EmotionAnalysis {
  primaryEmotion: EmotionType;
  secondaryEmotion?: EmotionType;
  intensity: number; // 0-1
  confidence: number; // 0-1
  characteristics: {
    energy: number; // 0-1
    valence: number; // 0-1 (negative to positive)
    arousal: number; // 0-1 (calm to excited)
    danceability: number; // 0-1
    mood: MoodType;
  };
  suggestedEffects: {
    reverb: number;
    delay: number;
    distortion: number;
    chorus: number;
    phaser: number;
    filter: {
      type: 'lowpass' | 'highpass' | 'bandpass' | 'notch';
      frequency: number;
      resonance: number;
    };
    eq: {
      bass: number;
      mid: number;
      treble: number;
    };
  };
}

export type EmotionType = 
  | 'happy' | 'sad' | 'calm' | 'energetic' 
  | 'melancholic' | 'euphoric' | 'aggressive' | 'romantic' 
  | 'mysterious' | 'uplifting' | 'dark' | 'dreamy';

export type MoodType = 
  | 'party' | 'chill' | 'workout' | 'romantic' | 'focus' 
  | 'emotional' | 'aggressive' | 'ambient' | 'dance';

@Injectable({
  providedIn: 'root'
})
export class EmotionAnalysisService {
  
  // Emotion mapping based on musical characteristics
  private emotionProfiles = {
    happy: {
      tempo: { min: 120, max: 140 },
      energy: { min: 0.6, max: 1.0 },
      valence: { min: 0.6, max: 1.0 },
      majorKey: true,
      effects: {
        reverb: 0.2,
        delay: 0.1,
        distortion: 0.0,
        chorus: 0.3,
        phaser: 0.1,
        filter: { type: 'highpass' as const, frequency: 80, resonance: 0.5 },
        eq: { bass: 2, mid: 1, treble: 3 }
      }
    },
    sad: {
      tempo: { min: 60, max: 90 },
      energy: { min: 0.1, max: 0.4 },
      valence: { min: 0.0, max: 0.3 },
      majorKey: false,
      effects: {
        reverb: 0.6,
        delay: 0.4,
        distortion: 0.0,
        chorus: 0.1,
        phaser: 0.0,
        filter: { type: 'lowpass' as const, frequency: 2000, resonance: 0.3 },
        eq: { bass: -1, mid: 0, treble: -2 }
      }
    },
    energetic: {
      tempo: { min: 128, max: 180 },
      energy: { min: 0.7, max: 1.0 },
      valence: { min: 0.5, max: 1.0 },
      majorKey: true,
      effects: {
        reverb: 0.1,
        delay: 0.2,
        distortion: 0.1,
        chorus: 0.2,
        phaser: 0.3,
        filter: { type: 'highpass' as const, frequency: 100, resonance: 0.7 },
        eq: { bass: 4, mid: 2, treble: 3 }
      }
    },
    calm: {
      tempo: { min: 70, max: 100 },
      energy: { min: 0.1, max: 0.5 },
      valence: { min: 0.3, max: 0.7 },
      majorKey: true,
      effects: {
        reverb: 0.4,
        delay: 0.2,
        distortion: 0.0,
        chorus: 0.4,
        phaser: 0.1,
        filter: { type: 'lowpass' as const, frequency: 5000, resonance: 0.2 },
        eq: { bass: 0, mid: 1, treble: 0 }
      }
    },
    aggressive: {
      tempo: { min: 140, max: 200 },
      energy: { min: 0.8, max: 1.0 },
      valence: { min: 0.0, max: 0.4 },
      majorKey: false,
      effects: {
        reverb: 0.1,
        delay: 0.1,
        distortion: 0.4,
        chorus: 0.0,
        phaser: 0.2,
        filter: { type: 'bandpass' as const, frequency: 1000, resonance: 0.8 },
        eq: { bass: 3, mid: 4, treble: 2 }
      }
    },
    romantic: {
      tempo: { min: 80, max: 120 },
      energy: { min: 0.2, max: 0.6 },
      valence: { min: 0.4, max: 0.8 },
      majorKey: true,
      effects: {
        reverb: 0.5,
        delay: 0.3,
        distortion: 0.0,
        chorus: 0.6,
        phaser: 0.2,
        filter: { type: 'lowpass' as const, frequency: 3000, resonance: 0.4 },
        eq: { bass: 1, mid: 2, treble: 1 }
      }
    },
    dark: {
      tempo: { min: 90, max: 130 },
      energy: { min: 0.3, max: 0.7 },
      valence: { min: 0.0, max: 0.2 },
      majorKey: false,
      effects: {
        reverb: 0.7,
        delay: 0.5,
        distortion: 0.2,
        chorus: 0.1,
        phaser: 0.4,
        filter: { type: 'lowpass' as const, frequency: 1500, resonance: 0.6 },
        eq: { bass: 2, mid: -1, treble: -3 }
      }
    },
    euphoric: {
      tempo: { min: 128, max: 150 },
      energy: { min: 0.8, max: 1.0 },
      valence: { min: 0.8, max: 1.0 },
      majorKey: true,
      effects: {
        reverb: 0.3,
        delay: 0.2,
        distortion: 0.0,
        chorus: 0.4,
        phaser: 0.5,
        filter: { type: 'highpass' as const, frequency: 120, resonance: 0.6 },
        eq: { bass: 3, mid: 3, treble: 4 }
      }
    },
    melancholic: {
      tempo: { min: 70, max: 110 },
      energy: { min: 0.2, max: 0.5 },
      valence: { min: 0.1, max: 0.4 },
      majorKey: false,
      effects: {
        reverb: 0.8,
        delay: 0.6,
        distortion: 0.0,
        chorus: 0.2,
        phaser: 0.1,
        filter: { type: 'lowpass' as const, frequency: 1800, resonance: 0.4 },
        eq: { bass: 0, mid: -1, treble: -2 }
      }
    },
    mysterious: {
      tempo: { min: 80, max: 120 },
      energy: { min: 0.3, max: 0.6 },
      valence: { min: 0.2, max: 0.5 },
      majorKey: false,
      effects: {
        reverb: 0.6,
        delay: 0.4,
        distortion: 0.1,
        chorus: 0.3,
        phaser: 0.6,
        filter: { type: 'bandpass' as const, frequency: 800, resonance: 0.7 },
        eq: { bass: 1, mid: -2, treble: 0 }
      }
    },
    uplifting: {
      tempo: { min: 110, max: 140 },
      energy: { min: 0.6, max: 0.9 },
      valence: { min: 0.7, max: 1.0 },
      majorKey: true,
      effects: {
        reverb: 0.3,
        delay: 0.2,
        distortion: 0.0,
        chorus: 0.5,
        phaser: 0.3,
        filter: { type: 'highpass' as const, frequency: 100, resonance: 0.5 },
        eq: { bass: 2, mid: 3, treble: 3 }
      }
    },
    dreamy: {
      tempo: { min: 60, max: 100 },
      energy: { min: 0.2, max: 0.6 },
      valence: { min: 0.4, max: 0.8 },
      majorKey: true,
      effects: {
        reverb: 0.7,
        delay: 0.5,
        distortion: 0.0,
        chorus: 0.6,
        phaser: 0.4,
        filter: { type: 'lowpass' as const, frequency: 4000, resonance: 0.3 },
        eq: { bass: 1, mid: 0, treble: 1 }
      }
    }
  };

  constructor() {}

  /**
   * Analyzes the emotion of a song based on audio characteristics
   * @param audioData Audio analysis data including frequency, tempo, etc.
   * @param metadata Song metadata (title, artist, genre)
   * @returns Emotion analysis with suggested effects
   */
  analyzeEmotion(
    audioData: {
      tempo?: number;
      energy: number;
      frequencyData: Uint8Array;
      spectralCentroid?: number;
      spectralRolloff?: number;
      zeroCrossingRate?: number;
    },
    metadata?: {
      title?: string;
      artist?: string;
      genre?: string;
    }
  ): EmotionAnalysis {
    
    // Calculate musical features
    const features = this.extractMusicalFeatures(audioData);
    
    // Determine primary emotion
    const emotionScores = this.calculateEmotionScores(features, metadata);
    const primaryEmotion = this.getPrimaryEmotion(emotionScores);
    const secondaryEmotion = this.getSecondaryEmotion(emotionScores, primaryEmotion);
    
    // Calculate characteristics
    const characteristics = this.calculateCharacteristics(features, primaryEmotion);
    
    // Get suggested effects based on emotion
    const suggestedEffects = this.getSuggestedEffects(primaryEmotion, characteristics);
    
    return {
      primaryEmotion,
      secondaryEmotion,
      intensity: emotionScores[primaryEmotion] || 0.5,
      confidence: this.calculateConfidence(emotionScores),
      characteristics,
      suggestedEffects
    };
  }

  /**
   * Extracts musical features from audio data
   */
  private extractMusicalFeatures(audioData: any): any {
    const { frequencyData, energy, tempo } = audioData;
    
    // Calculate spectral features
    const spectralCentroid = this.calculateSpectralCentroid(frequencyData);
    const spectralRolloff = this.calculateSpectralRolloff(frequencyData);
    const zeroCrossingRate = this.calculateZeroCrossingRate(frequencyData);
    
    // Calculate energy distribution
    const energyDistribution = this.calculateEnergyDistribution(frequencyData);
    
    // Estimate valence and arousal
    const valence = this.estimateValence(spectralCentroid, energyDistribution, tempo);
    const arousal = this.estimateArousal(energy, tempo, zeroCrossingRate);
    
    return {
      tempo: tempo || this.estimateTempo(frequencyData),
      energy,
      spectralCentroid,
      spectralRolloff,
      zeroCrossingRate,
      energyDistribution,
      valence,
      arousal
    };
  }

  /**
   * Calculates emotion scores for all emotion types
   */
  private calculateEmotionScores(features: any, metadata?: any): { [key in EmotionType]: number } {
    const scores: { [key in EmotionType]: number } = {} as any;
    
    for (const [emotion, profile] of Object.entries(this.emotionProfiles)) {
      let score = 0;
      let factors = 0;
      
      // Tempo matching
      if (features.tempo >= profile.tempo.min && features.tempo <= profile.tempo.max) {
        score += 0.3;
      } else {
        const tempoDistance = Math.min(
          Math.abs(features.tempo - profile.tempo.min),
          Math.abs(features.tempo - profile.tempo.max)
        );
        score += Math.max(0, 0.3 - (tempoDistance / 50));
      }
      factors++;
      
      // Energy matching
      if (features.energy >= profile.energy.min && features.energy <= profile.energy.max) {
        score += 0.25;
      } else {
        const energyDistance = Math.min(
          Math.abs(features.energy - profile.energy.min),
          Math.abs(features.energy - profile.energy.max)
        );
        score += Math.max(0, 0.25 - energyDistance);
      }
      factors++;
      
      // Valence matching
      const valenceScore = 1 - Math.abs(features.valence - (profile.valence.min + profile.valence.max) / 2);
      score += valenceScore * 0.25;
      factors++;
      
      // Arousal matching
      const arousalScore = 1 - Math.abs(features.arousal - features.energy);
      score += arousalScore * 0.2;
      factors++;
      
      scores[emotion as EmotionType] = score / factors;
    }
    
    // Apply genre-based adjustments if available
    if (metadata?.genre) {
      this.applyGenreAdjustments(scores, metadata.genre);
    }
    
    return scores;
  }

  /**
   * Gets the primary emotion with highest score
   */
  private getPrimaryEmotion(scores: { [key in EmotionType]: number }): EmotionType {
    return Object.entries(scores).reduce((a, b) => scores[a[0] as EmotionType] > scores[b[0] as EmotionType] ? a : b)[0] as EmotionType;
  }

  /**
   * Gets the secondary emotion (second highest score)
   */
  private getSecondaryEmotion(scores: { [key in EmotionType]: number }, primary: EmotionType): EmotionType | undefined {
    const sortedEmotions = Object.entries(scores)
      .filter(([emotion]) => emotion !== primary)
      .sort(([,a], [,b]) => b - a);
    
    return sortedEmotions.length > 0 && sortedEmotions[0][1] > 0.3 ? sortedEmotions[0][0] as EmotionType : undefined;
  }

  /**
   * Calculates confidence based on score distribution
   */
  private calculateConfidence(scores: { [key in EmotionType]: number }): number {
    const values = Object.values(scores);
    const max = Math.max(...values);
    const secondMax = values.sort((a, b) => b - a)[1];
    return Math.min(1, (max - secondMax) * 2);
  }

  /**
   * Calculates emotion characteristics
   */
  private calculateCharacteristics(features: any, emotion: EmotionType): EmotionAnalysis['characteristics'] {
    const mood = this.determineMood(emotion, features);
    
    return {
      energy: features.energy,
      valence: features.valence,
      arousal: features.arousal,
      danceability: this.calculateDanceability(features),
      mood
    };
  }

  /**
   * Gets suggested effects based on emotion and characteristics
   */
  private getSuggestedEffects(emotion: EmotionType, characteristics: any): EmotionAnalysis['suggestedEffects'] {
    const baseEffects = this.emotionProfiles[emotion]?.effects || this.emotionProfiles.calm.effects;
    
    // Adjust effects based on characteristics
    const adjustedEffects = { ...baseEffects };
    
    // Increase reverb for low energy songs
    if (characteristics.energy < 0.3) {
      adjustedEffects.reverb = Math.min(1, adjustedEffects.reverb + 0.2);
    }
    
    // Increase distortion for high arousal
    if (characteristics.arousal > 0.8) {
      adjustedEffects.distortion = Math.min(1, adjustedEffects.distortion + 0.1);
    }
    
    // Adjust EQ based on valence
    if (characteristics.valence < 0.3) {
      adjustedEffects.eq.treble -= 1;
      adjustedEffects.eq.bass += 1;
    }
    
    return adjustedEffects;
  }

  // Helper methods for audio analysis
  private calculateSpectralCentroid(frequencyData: Uint8Array): number {
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < frequencyData.length; i++) {
      const magnitude = frequencyData[i] / 255;
      weightedSum += i * magnitude;
      magnitudeSum += magnitude;
    }
    
    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  private calculateSpectralRolloff(frequencyData: Uint8Array): number {
    const totalEnergy = frequencyData.reduce((sum, val) => sum + (val / 255) ** 2, 0);
    const threshold = totalEnergy * 0.85;
    
    let cumulativeEnergy = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      cumulativeEnergy += (frequencyData[i] / 255) ** 2;
      if (cumulativeEnergy >= threshold) {
        return i / frequencyData.length;
      }
    }
    
    return 1;
  }

  private calculateZeroCrossingRate(frequencyData: Uint8Array): number {
    let crossings = 0;
    for (let i = 1; i < frequencyData.length; i++) {
      if ((frequencyData[i] > 128) !== (frequencyData[i-1] > 128)) {
        crossings++;
      }
    }
    return crossings / frequencyData.length;
  }

  private calculateEnergyDistribution(frequencyData: Uint8Array): { bass: number; mid: number; treble: number } {
    const third = Math.floor(frequencyData.length / 3);
    
    const bass = frequencyData.slice(0, third).reduce((sum, val) => sum + val, 0) / (third * 255);
    const mid = frequencyData.slice(third, third * 2).reduce((sum, val) => sum + val, 0) / (third * 255);
    const treble = frequencyData.slice(third * 2).reduce((sum, val) => sum + val, 0) / (third * 255);
    
    return { bass, mid, treble };
  }

  private estimateValence(spectralCentroid: number, energyDist: any, tempo?: number): number {
    // Higher spectral centroid and balanced energy distribution suggest positive valence
    let valence = spectralCentroid / 100; // Normalize
    
    // Balanced energy distribution increases valence
    const energyBalance = 1 - Math.abs(energyDist.bass - energyDist.treble);
    valence += energyBalance * 0.3;
    
    // Moderate to high tempo increases valence
    if (tempo && tempo > 100 && tempo < 150) {
      valence += 0.2;
    }
    
    return Math.min(1, Math.max(0, valence));
  }

  private estimateArousal(energy: number, tempo?: number, zcr?: number): number {
    let arousal = energy;
    
    // High tempo increases arousal
    if (tempo && tempo > 120) {
      arousal += (tempo - 120) / 200;
    }
    
    // High zero crossing rate increases arousal
    if (zcr && zcr > 0.1) {
      arousal += zcr * 0.5;
    }
    
    return Math.min(1, Math.max(0, arousal));
  }

  private estimateTempo(frequencyData: Uint8Array): number {
    // Simple tempo estimation based on low frequency energy patterns
    // This is a simplified version - real tempo detection is more complex
    const bassEnergy = frequencyData.slice(0, 10).reduce((sum, val) => sum + val, 0) / 10;
    return Math.max(60, Math.min(180, 60 + (bassEnergy / 255) * 120));
  }

  private determineMood(emotion: EmotionType, features: any): MoodType {
    if (features.energy > 0.7 && features.arousal > 0.6) return 'party';
    if (features.energy < 0.3 && features.valence > 0.5) return 'chill';
    if (features.energy > 0.8) return 'workout';
    if (emotion === 'romantic') return 'romantic';
    if (features.valence < 0.3) return 'emotional';
    if (emotion === 'aggressive') return 'aggressive';
    if (features.energy < 0.4) return 'ambient';
    if (features.arousal > 0.6) return 'dance';
    return 'focus';
  }

  private calculateDanceability(features: any): number {
    // Combine tempo, energy, and rhythm regularity
    let danceability = 0;
    
    // Optimal tempo for dancing
    if (features.tempo >= 120 && features.tempo <= 140) {
      danceability += 0.4;
    } else {
      const tempoDistance = Math.min(
        Math.abs(features.tempo - 120),
        Math.abs(features.tempo - 140)
      );
      danceability += Math.max(0, 0.4 - (tempoDistance / 100));
    }
    
    // Energy contribution
    danceability += features.energy * 0.3;
    
    // Arousal contribution
    danceability += features.arousal * 0.3;
    
    return Math.min(1, Math.max(0, danceability));
  }

  private applyGenreAdjustments(scores: { [key in EmotionType]: number }, genre: string): void {
    const genreLower = genre.toLowerCase();
    
    // Genre-specific emotion adjustments
    if (genreLower.includes('rock') || genreLower.includes('metal')) {
      scores.aggressive *= 1.3;
      scores.energetic *= 1.2;
    }
    
    if (genreLower.includes('jazz') || genreLower.includes('blues')) {
      scores.melancholic *= 1.2;
      scores.calm *= 1.1;
    }
    
    if (genreLower.includes('electronic') || genreLower.includes('dance')) {
      scores.energetic *= 1.3;
      scores.euphoric *= 1.2;
    }
    
    if (genreLower.includes('classical') || genreLower.includes('ambient')) {
      scores.calm *= 1.3;
      scores.dreamy *= 1.2;
    }
    
    if (genreLower.includes('pop')) {
      scores.happy *= 1.2;
      scores.uplifting *= 1.1;
    }
  }

  /**
   * Applies emotion-based effects to audio context
   * @param audioContext The audio context
   * @param sourceNode The source node to apply effects to
   * @param emotion The detected emotion
   * @param intensity Effect intensity (0-1)
   * @returns Array of created effect nodes
   */
  applyEmotionEffects(
    audioContext: AudioContext,
    sourceNode: AudioNode,
    emotion: EmotionType,
    intensity: number = 1
  ): AudioNode[] {
    const effects = this.emotionProfiles[emotion]?.effects || this.emotionProfiles.calm.effects;
    const nodes: AudioNode[] = [];
    
    let currentNode = sourceNode;
    
    // Apply reverb
    if (effects.reverb > 0) {
      const convolver = audioContext.createConvolver();
      const reverbGain = audioContext.createGain();
      reverbGain.gain.value = effects.reverb * intensity;
      
      currentNode.connect(convolver);
      convolver.connect(reverbGain);
      currentNode = reverbGain;
      nodes.push(convolver, reverbGain);
    }
    
    // Apply delay
    if (effects.delay > 0) {
      const delay = audioContext.createDelay();
      const delayGain = audioContext.createGain();
      const feedback = audioContext.createGain();
      
      delay.delayTime.value = 0.3;
      delayGain.gain.value = effects.delay * intensity;
      feedback.gain.value = 0.3;
      
      currentNode.connect(delay);
      delay.connect(delayGain);
      delay.connect(feedback);
      feedback.connect(delay);
      currentNode = delayGain;
      nodes.push(delay, delayGain, feedback);
    }
    
    // Apply EQ
    const lowShelf = audioContext.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 320;
    lowShelf.gain.value = effects.eq.bass * intensity;
    
    const midPeaking = audioContext.createBiquadFilter();
    midPeaking.type = 'peaking';
    midPeaking.frequency.value = 1000;
    midPeaking.gain.value = effects.eq.mid * intensity;
    midPeaking.Q.value = 0.5;
    
    const highShelf = audioContext.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 3200;
    highShelf.gain.value = effects.eq.treble * intensity;
    
    currentNode.connect(lowShelf);
    lowShelf.connect(midPeaking);
    midPeaking.connect(highShelf);
    currentNode = highShelf;
    nodes.push(lowShelf, midPeaking, highShelf);
    
    return nodes;
  }
}