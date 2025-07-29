import { Injectable } from '@angular/core';
import { Howl, Howler } from 'howler';

/**
 * Service for enhanced audio playback using Howler.js
 * Provides improved audio quality and smoother transitions between songs
 */
@Injectable({
  providedIn: 'root'
})
export class HowlerAudioService {
  // Current and next audio players using Howler
  private currentSound: Howl | null = null;
  private nextSound: Howl | null = null;

  // Store audio metadata
  private currentSoundData: {
    url: string;
    duration: number;
    onEnd?: () => void;
    onLoad?: () => void;
  } | null = null;

  private nextSoundData: {
    url: string;
    duration: number;
    onEnd?: () => void;
    onLoad?: () => void;
  } | null = null;

  // Transition state
  private isTransitioning = false;
  private onTransitionComplete: (() => void) | null = null;

  constructor() {
    // Configure Howler global settings for better quality
    Howler.autoUnlock = true;
    Howler.html5PoolSize = 10; // Increase pool size for better performance
  }

  /**
   * Loads and plays a sound with enhanced quality
   * @param url URL of the audio file
   * @param onEnd Callback when the sound ends
   * @param onLoad Callback when the sound is loaded
   * @returns The created Howl instance
   */
  loadAndPlay(url: string, onEnd?: () => void, onLoad?: () => void): Howl {
    // Stop current sound if it exists
    if (this.currentSound) {
      this.currentSound.fade(this.currentSound.volume(), 0, 500);

      // After fade out, stop the current sound
      setTimeout(() => {
        if (this.currentSound) {
          this.currentSound.stop();
        }
      }, 500);
    }

    // Create new Howl instance with enhanced settings
    const sound = new Howl({
      src: [url],
      html5: false, // Use Web Audio API for effects
      preload: true, // Preload the audio
      volume: 1.0,
      format: ['mp3', 'wav', 'ogg'], // Support multiple formats
      onend: () => {
        if (onEnd) onEnd();
      },
      onload: () => {
        if (onLoad) onLoad();
      },
      onloaderror: (id, error) => {
        console.error('Error loading sound:', error);
      },
      onplayerror: (id, error) => {
        console.error('Error playing sound:', error);
        // Try to recover from error
        sound.once('unlock', () => {
          sound.play();
        });
      }
    });

    // Store as current sound
    this.currentSound = sound;
    this.currentSoundData = {
      url,
      duration: 0, // Will be updated when loaded
      onEnd,
      onLoad
    };

    // Start playing with a fade-in
    sound.play();
    sound.fade(0, 1.0, 1000); // Smooth 1-second fade in

    return sound;
  }

  /**
   * Preloads the next sound for seamless transition
   * @param url URL of the next audio file
   * @param onEnd Callback when the sound ends
   * @param onLoad Callback when the sound is loaded
   * @returns The created Howl instance for the next sound
   */
  preloadNext(url: string, onEnd?: () => void, onLoad?: () => void): Howl {
    // Create new Howl instance for next sound
    const sound = new Howl({
      src: [url],
      html5: false,
      preload: true,
      volume: 0, // Start with volume at 0
      format: ['mp3', 'wav', 'ogg'],
      onend: () => {
        if (onEnd) onEnd();
      },
      onload: () => {
        if (onLoad) onLoad();

        // Update duration once loaded
        if (this.nextSoundData) {
          this.nextSoundData.duration = sound.duration();
        }
      }
    });

    // Store as next sound
    this.nextSound = sound;
    this.nextSoundData = {
      url,
      duration: 0, // Will be updated when loaded
      onEnd,
      onLoad
    };

    return sound;
  }

  // Métodos para aplicar efectos
  applyReverb(intensity: number) {
    if (!this.currentSound || !(this.currentSound as any)._sounds?.[0]?._node) return;
    const node = ((this.currentSound as any)._sounds[0]._node) as AudioNode;
    const convolver = Howler.ctx.createConvolver();
    // Generar impulse response para reverb (simplificado)
    convolver.buffer = this.generateImpulseResponse(2, intensity);
    node.connect(convolver);
    convolver.connect(Howler.masterGain);
  }

  applyDelay(intensity: number) {
    if (!this.currentSound || !(this.currentSound as any)._sounds?.[0]?._node) return;
    const node = ((this.currentSound as any)._sounds[0]._node) as AudioNode;
    const delay = Howler.ctx.createDelay(5.0);
    delay.delayTime.value = intensity;
    node.connect(delay);
    delay.connect(Howler.masterGain);
  }

  apply3DPanner() {
    if (!this.currentSound) return;
    this.currentSound.pannerAttr({
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 1,
      maxDistance: 10000,
      rolloffFactor: 1,
      coneInnerAngle: 360,
      coneOuterAngle: 0,
      coneOuterGain: 0
    });
    this.currentSound.pos(0, 0, -0.5); // Posición 3D
  }

  private generateImpulseResponse(duration: number, decay: number): AudioBuffer {
    const sampleRate = Howler.ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = Howler.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      left[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      right[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return impulse;
  }

  /**
   * Starts a smooth transition between current and next sound
   * @param transitionDuration Duration of the transition in seconds
   * @param startNextAt Position in seconds to start the next sound (default: 0)
   */
  startTransition(transitionDuration: number = 10, startNextAt: number = 0): void {
    if (!this.currentSound || !this.nextSound || this.isTransitioning) {
      return;
    }

    this.isTransitioning = true;

    // Start playing the next sound from the specified position
    this.nextSound.seek(startNextAt);
    this.nextSound.play();

    // Get current position and duration
    const currentPos = this.currentSound.seek() as number;
    const currentDuration = this.currentSound.duration();

    // Calculate remaining time
    const remainingTime = currentDuration - currentPos;

    // Determine actual transition duration (use the shorter of remaining time or requested duration)
    const actualTransitionDuration = Math.min(remainingTime, transitionDuration);

    // Start with next sound at volume 0
    this.nextSound.volume(0);

    // Create a smooth crossfade
    this.performCrossfade(actualTransitionDuration);
  }

  /**
   * Performs a smooth crossfade between current and next sounds
   * @param duration Duration of the crossfade in seconds
   */
  private performCrossfade(duration: number): void {
    if (!this.currentSound || !this.nextSound) {
      return;
    }

    const fadeSteps = 50; // Number of steps for smoother fade
    const stepDuration = (duration * 1000) / fadeSteps; // Duration of each step in ms

    let step = 0;

    // Use a more natural fade curve (exponential/logarithmic)
    const fadeInterval = setInterval(() => {
      step++;

      if (step <= fadeSteps) {
        const progress = step / fadeSteps;

        // Use a custom curve for more natural fading
        // Current sound: exponential fade out (stays louder longer, then fades quickly)
        // Next sound: logarithmic fade in (starts quietly, then increases more quickly)
        const currentVolume = Math.cos(progress * Math.PI / 2); // 1 -> 0 with curve
        const nextVolume = Math.sin(progress * Math.PI / 2); // 0 -> 1 with curve

        // Apply volume changes
        this.currentSound?.volume(currentVolume);
        this.nextSound?.volume(nextVolume);
      } else {
        // Fade complete
        clearInterval(fadeInterval);

        // Ensure final volumes are set correctly
        this.currentSound?.volume(0);
        this.nextSound?.volume(1);

        // Stop the current sound
        this.currentSound?.stop();

        // Swap current and next
        this.currentSound = this.nextSound;
        this.currentSoundData = this.nextSoundData;

        // Reset next
        this.nextSound = null;
        this.nextSoundData = null;

        // Reset transition flag
        this.isTransitioning = false;

        // Call the transition complete callback if it exists
        if (this.onTransitionComplete) {
          this.onTransitionComplete();
        }
      }
    }, stepDuration);
  }

  /**
   * Gets the current playback position in seconds
   * @returns Current position in seconds
   */
  getCurrentPosition(): number {
    return this.currentSound ? (this.currentSound.seek() as number) : 0;
  }

  /**
   * Gets the duration of the current sound in seconds
   * @returns Duration in seconds
   */
  getCurrentDuration(): number {
    return this.currentSound ? this.currentSound.duration() : 0;
  }

  /**
   * Pauses the current sound
   */
  pause(): void {
    if (this.currentSound) {
      this.currentSound.pause();
    }
  }

  /**
   * Resumes playback of the current sound
   */
  resume(): void {
    if (this.currentSound) {
      this.currentSound.play();
    }
  }

  /**
   * Sets the volume of the current sound with a smooth transition
   * @param volume Volume level (0-1)
   * @param fadeTime Time to fade to the new volume in milliseconds
   */
  setVolume(volume: number, fadeTime: number = 500): void {
    if (this.currentSound) {
      const currentVolume = this.currentSound.volume();
      this.currentSound.fade(currentVolume, volume, fadeTime);
    }
  }

  /**
   * Gets the Howl instance for the current sound
   * @returns Current Howl instance or null
   */
  getCurrentSound(): Howl | null {
    return this.currentSound;
  }

  /**
   * Gets the Howl instance for the next sound
   * @returns Next Howl instance or null
   */
  getNextSound(): Howl | null {
    return this.nextSound;
  }

  /**
   * Checks if a transition is in progress
   * @returns True if transitioning
   */
  isInTransition(): boolean {
    return this.isTransitioning;
  }

  /**
   * Sets the callback to be called when a transition completes
   * @param callback Function to call when transition completes
   */
  setOnTransitionComplete(callback: (() => void) | null): void {
    this.onTransitionComplete = callback;
  }

  // Nuevos efectos avanzados
  private effectChain: AudioNode[] = [];
  private masterGain: GainNode | null = null;

  /**
   * Sistema de efectos dinámicos con IA
   */
  public applyAIEffectChain(effects: {
  reverb?: number,
  delay?: number,
  filter?: { type: string, frequency: number, resonance: number },
  distortion?: number,
  chorus?: number,
  phaser?: number,
  eq?: { bass: number, mid: number, treble: number }
}): void {
  if (!this.currentSound || !Howler.ctx) return;
  
  // Limpiar cadena de efectos anterior
  this.clearEffectChain();
  
  const audioNode = (this.currentSound as any)._sounds?.[0]?._node;
  if (!audioNode) return;
  
  let currentNode: AudioNode = audioNode;
  
  // Crear gain master
  this.masterGain = Howler.ctx.createGain();
  
  // EQ de 3 bandas
  if (effects.eq) {
    const { bass, mid, treble } = effects.eq;
    
    // Filtro de graves
    const bassFilter = Howler.ctx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 200;
    bassFilter.gain.value = bass;
    
    // Filtro de medios
    const midFilter = Howler.ctx.createBiquadFilter();
    midFilter.type = 'peaking';
    midFilter.frequency.value = 1000;
    midFilter.Q.value = 1;
    midFilter.gain.value = mid;
    
    // Filtro de agudos
    const trebleFilter = Howler.ctx.createBiquadFilter();
    trebleFilter.type = 'highshelf';
    trebleFilter.frequency.value = 4000;
    trebleFilter.gain.value = treble;
    
    currentNode.connect(bassFilter);
    bassFilter.connect(midFilter);
    midFilter.connect(trebleFilter);
    currentNode = trebleFilter;
    
    this.effectChain.push(bassFilter, midFilter, trebleFilter);
  }
  
  // Distorsión
  if (effects.distortion && effects.distortion > 0) {
    const waveshaper = Howler.ctx.createWaveShaper();
    waveshaper.curve = this.generateDistortionCurve(effects.distortion);
    waveshaper.oversample = '4x';
    
    currentNode.connect(waveshaper);
    currentNode = waveshaper;
    this.effectChain.push(waveshaper);
  }
  
  // Chorus
  if (effects.chorus && effects.chorus > 0) {
    const chorusNode = this.createChorusEffect(effects.chorus);
    currentNode.connect(chorusNode);
    currentNode = chorusNode;
    this.effectChain.push(chorusNode);
  }
  
  // Phaser
  if (effects.phaser && effects.phaser > 0) {
    const phaserNode = this.createPhaserEffect(effects.phaser);
    currentNode.connect(phaserNode);
    currentNode = phaserNode;
    this.effectChain.push(phaserNode);
  }
  
  // Delay mejorado
  if (effects.delay && effects.delay > 0) {
    const delayNode = this.createAdvancedDelay(effects.delay);
    currentNode.connect(delayNode);
    currentNode = delayNode;
    this.effectChain.push(delayNode);
  }
  
  // Reverb mejorado
  if (effects.reverb && effects.reverb > 0) {
    const reverbNode = this.createAdvancedReverb(effects.reverb);
    currentNode.connect(reverbNode);
    currentNode = reverbNode;
    this.effectChain.push(reverbNode);
  }
  
  // Conectar al master gain y luego al destino
  currentNode.connect(this.masterGain);
  this.masterGain.connect(Howler.ctx.destination);
}

private createChorusEffect(intensity: number): AudioNode {
  const input = Howler.ctx.createGain();
  const output = Howler.ctx.createGain();
  const delay = Howler.ctx.createDelay(0.1);
  const lfo = Howler.ctx.createOscillator();
  const lfoGain = Howler.ctx.createGain();
  
  // Configurar LFO
  lfo.frequency.value = 0.5; // 0.5 Hz
  lfoGain.gain.value = 0.005 * intensity; // Profundidad del chorus
  
  // Conectar
  lfo.connect(lfoGain);
  lfoGain.connect(delay.delayTime);
  input.connect(delay);
  input.connect(output); // Señal directa
  delay.connect(output); // Señal con chorus
  
  lfo.start();
  
  return { input, output } as any;
}

private generateDistortionCurve(amount: number): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  
  return curve;
}

private createAdvancedDelay(delayTime: number): AudioNode {
  const input = Howler.ctx!.createGain();
  const output = Howler.ctx!.createGain();
  const delay = Howler.ctx!.createDelay(1);
  const feedback = Howler.ctx!.createGain();
  const wetGain = Howler.ctx!.createGain();
  
  delay.delayTime.value = delayTime;
  feedback.gain.value = 0.3;
  wetGain.gain.value = 0.5;
  
  input.connect(delay);
  input.connect(output); // Dry signal
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(output);
  
  return { input, output } as any;
}

private createAdvancedReverb(roomSize: number): AudioNode {
  const input = Howler.ctx!.createGain();
  const output = Howler.ctx!.createGain();
  const convolver = Howler.ctx!.createConvolver();
  const wetGain = Howler.ctx!.createGain();
  
  convolver.buffer = this.generateImpulseResponse(roomSize, 2.0);
  wetGain.gain.value = roomSize;
  
  input.connect(convolver);
  input.connect(output); // Dry signal
  convolver.connect(wetGain);
  wetGain.connect(output);
  
  return { input, output } as any;
}

private createPhaserEffect(intensity: number): AudioNode {
  const input = Howler.ctx!.createGain();
  const output = Howler.ctx!.createGain();
  const allpass = Howler.ctx!.createBiquadFilter();
  const lfo = Howler.ctx!.createOscillator();
  const lfoGain = Howler.ctx!.createGain();
  
  allpass.type = 'allpass';
  allpass.frequency.value = 1000;
  
  lfo.frequency.value = 0.3;
  lfoGain.gain.value = 800 * intensity;
  
  lfo.connect(lfoGain);
  lfoGain.connect(allpass.frequency);
  input.connect(allpass);
  allpass.connect(output);
  
  lfo.start();
  
  return { input, output } as any;
}

private clearEffectChain(): void {
  this.effectChain.forEach(node => {
    try {
      node.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
  });
  this.effectChain = [];
  
  if (this.masterGain) {
    try {
      this.masterGain.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    this.masterGain = null;
  }
}

}
