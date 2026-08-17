/**
 * Home component for the HeyDJ application
 *
 * This component includes character encoding detection using the jschardet library.
 * jschardet is used to detect the character encoding of song URLs before decoding them,
 * which helps handle special characters in song titles and artist names correctly.
 * If jschardet fails to detect the encoding or if there's an error, it falls back to
 * the default decodeURIComponent behavior.
 */
import {ChangeDetectionStrategy, Component, AfterViewInit, OnDestroy} from '@angular/core';
import {SongCarousel, Song} from '../dj/song-carousel/song-carousel';
import {ListSong} from '../dj/list-song/list-song';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import * as jschardet from 'jschardet';
import { DjEngineService } from '../services/dj-engine.service';
import { TrackAnalysisService, TrackAnalysis } from '../services/track-analysis.service';
import { MetadataService } from '../services/metadata.service';
import { AIAudioProcessingService } from '../services/ai-audio-processing.service';
import { HowlerAudioService } from '../services/howler-audio.service';
import { EmotionAnalysisService } from '../services/emotion-analysis.service';
import { AutoDjService } from '../services/auto-dj.service';

export interface songUpload {
  url: string;
}

export interface playlists {
  name: string;
  artist: string;
  img: string;
  songs: songUpload[];
}

@Component({
  selector: 'app-home',
  imports: [
    CommonModule,
    FormsModule,
    SongCarousel,
    ListSong
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.Default
})
export class Home implements AfterViewInit, OnDestroy {


  playlistsApp: playlists[] = [];

  // Local placeholder cover (no external image/API calls)
  private readonly localCoverUrl = 'assets/covers/vinyl.svg';

  /**
   * Loads the local music library from src/assets/music.
   * The manifest.json file is generated automatically before `npm start` /
   * `npm run build` by scripts/generate-music-manifest.js, since a browser
   * cannot list a directory on its own.
   */
  private loadLocalMusic(): void {
    fetch('assets/music/manifest.json')
      .then(res => (res.ok ? res.json() : { tracks: [] }))
      .then((manifest: { tracks?: string[] }) => {
        const tracks = manifest?.tracks || [];
        if (!tracks.length) {
          console.warn('No songs found in src/assets/music (empty manifest). Run "npm run music:scan" after adding files.');
          return;
        }
        const songs: songUpload[] = tracks.map(track => ({
          // Encode each path segment so spaces and special characters in
          // filenames produce valid URLs
          url: 'assets/music/' + track.split('/').map(encodeURIComponent).join('/')
        }));
        this.playlistsApp = [
          {
            name: 'Mi Musica',
            artist: 'Biblioteca local',
            img: this.localCoverUrl,
            songs
          }
        ];
      })
      .catch(err => console.error('Error loading local music manifest:', err));
  }



  songList: songUpload[] = [
  ];

  songs: Song[] = [];
  selectedPlaylist: playlists | null = null;

  loadPlaylistSongs(playlist: playlists): void {
    this.selectedPlaylist = playlist;
    // Clear the current songList
    this.songList = [];

    // Add the songs from the playlist to songList
    if (playlist && playlist.songs && playlist.songs.length > 0) {
      this.songList = [...playlist.songs];

      // Populate songs array from the updated songList, passing the playlist's artist
      this.populateSongsFromUrls(playlist.artist);
    }
  }

  private currentAudioPlayer: HTMLAudioElement | null = null;
  private nextAudioPlayer: HTMLAudioElement | null = null;
  private updateInterval: any;
  private transitionStarted: boolean = false;
  private transitionFallbackSet: boolean = false;
  // Prefer WebAudio (FX Router + DJ Engine) by default; set true to test Howler engine
  private useHowlerEngine: boolean = false;

  // Web Audio API context and nodes for 3D audio
  private audioContext: AudioContext | null = null;
  private currentSourceNode: MediaElementAudioSourceNode | null = null;
  private nextSourceNode: MediaElementAudioSourceNode | null = null;
  private currentPannerNode: PannerNode | null = null;
  private nextPannerNode: PannerNode | null = null;
  private gainNode: GainNode | null = null;
  private listenerNode: AudioListener | null = null;

  // Reverb effect for spatial ambience
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;

  // Delay effect nodes
  private currentDelayNode: DelayNode | null = null;
  private currentFeedbackGain: GainNode | null = null;
  private currentDelayMix: GainNode | null = null;
  private currentDryMix: GainNode | null = null;
  private nextDelayNode: DelayNode | null = null;
  private nextFeedbackGain: GainNode | null = null;
  private nextDelayMix: GainNode | null = null;
  private nextDryMix: GainNode | null = null;

  // Sweepable high-pass filters used for the DJ-style "bass swap" during crossfades
  private currentBassCutNode: BiquadFilterNode | null = null;
  private nextBassCutNode: BiquadFilterNode | null = null;
  // Sweepable low-pass filters (echo-out cuts, filter fades)
  private currentHiCutNode: BiquadFilterNode | null = null;
  private nextHiCutNode: BiquadFilterNode | null = null;
  // Per-deck makeup gain for automatic loudness matching between tracks
  private currentMakeupGain: GainNode | null = null;
  private nextMakeupGain: GainNode | null = null;

  // Crossfade / auto-mix engine state
  private crossfadeActive: boolean = false;
  private crossfadeRafId: number = 0;
  // playbackRate of the playing deck (beatmatching); glides back to 1.0 after a mix
  private currentDeckRate: number = 1;
  private rateGlideTimer: any = null;
  // Phrase-aligned time (in current-track seconds) where the next blend starts
  private plannedMixOutAt: number | null = null;
  // Whether the planned mix-out used the track analysis (if not, it is
  // recomputed as soon as the analysis arrives)
  private plannedMixOutUsedAnalysis: boolean = false;

  // Audio analyzer for frequency analysis
  private analyzer: AnalyserNode | null = null;
  // FX Router inserted between master gain and post-sum chain
  private fxRouter?: ReturnType<AIAudioProcessingService['buildFxRouter']>;

  // DJ Controls state
  fxIntensity: number = 0.6; // 0-1
  djMode: 'suave' | 'medio' | 'intenso' = 'medio';

  // Store event listener functions as properties so they can be properly removed
  private updateProgressListener = () => this.updateSongProgress();
  private currentSongEndedListener: (() => void) | null = null;

  // AI analysis properties
  private aiAnalysisInterval: any;
  private previousBassEnergy: number = 0;
  // NUEVO: referencia para detener FX “divertidos”
  private stopFunFxScheduler?: () => void;

  // UI background animation controls and visibility handler
  private waveResizeHandler: (() => void) | null = null;
  private waveRafId: number | null = null;
  private visibilityHandler: (() => void) | null = null;

  constructor(
    private trackAnalysisService: TrackAnalysisService,
    private metadataService: MetadataService,
    private aiAudioProcessingService: AIAudioProcessingService,
    private howlerAudioService: HowlerAudioService,
    private emotionAnalysisService: EmotionAnalysisService,
    private djEngine: DjEngineService,
    private autoDj: AutoDjService
  ) {
    this.loadLocalMusic();

    // Audio engine will be initialized on first user gesture (Play)
  }

  ngAfterViewInit(): void {
    this.initWaveBackground();
    // Handle tab visibility to suspend/resume audio contexts
    this.visibilityHandler = () => {
      try {
        if (document.hidden) {
          if (this.audioContext && this.audioContext.state === 'running') {
            this.audioContext.suspend();
          }
          this.howlerAudioService.suspendContext();
        } else {
          if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
          }
          this.howlerAudioService.resumeContext();
        }
      } catch {}
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private initWaveBackground(): void {
    const canvas = document.getElementById('wave-bg-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let width = window.innerWidth;
    const height = 260;
    canvas.width = width;
    canvas.height = height;
    // Responsive resize
    this.waveResizeHandler = () => {
      width = window.innerWidth;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', this.waveResizeHandler);
    // Wave parameters
    const waves = [
      { amplitude: 32, wavelength: 320, speed: 0.015, color: 'rgba(0,255,180,0.18)' },
      { amplitude: 18, wavelength: 180, speed: 0.022, color: 'rgba(0,180,255,0.13)' },
      { amplitude: 12, wavelength: 90, speed: 0.03, color: 'rgba(255,255,255,0.09)' }
    ];
    const drawWaves = (time: number) => {
      ctx.clearRect(0, 0, width, canvas.height);
      waves.forEach((wave, idx) => {
        ctx.beginPath();
        for (let x = 0; x <= width; x += 2) {
          const y = canvas.height/2 + Math.sin((x/wave.wavelength) + (time*wave.speed) + idx) * wave.amplitude;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = 3;
        ctx.stroke();
      });
    };
    const animate = (time: number) => {
      drawWaves(time/1000);
      this.waveRafId = requestAnimationFrame(animate);
    };
    this.waveRafId = requestAnimationFrame(animate);
  }


  /**
   * Initializes the Web Audio engine on first user gesture
   */
  private startAudioEngine(): void {
    if (this.audioContext) return;
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Create a master gain node
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;
      // Set up listener for 3D audio
      this.listenerNode = this.audioContext.listener;
      const ln: any = this.listenerNode as any;
      if (ln && ln.positionX) {
        ln.positionX.value = 0;
        ln.positionY.value = 0;
        ln.positionZ.value = 0;
        ln.forwardX.value = 0;
        ln.forwardY.value = 0;
        ln.forwardZ.value = -1;
        ln.upX.value = 0;
        ln.upY.value = 1;
        ln.upZ.value = 0;
      } else if (ln) {
        ln.setPosition(0, 0, 0);
        ln.setOrientation(0, 0, -1, 0, 1, 0);
      }
      // Minimal reverb chain
      this.createReverbEffect();
      // Build and insert FX Router between master gain and post-sum chain
      try {
        this.fxRouter = this.aiAudioProcessingService.buildFxRouter(this.audioContext);
        // Route: gainNode -> fxRouter.input -> DjEngine(post-sum) -> destination
        this.gainNode.connect(this.fxRouter.input);
        try { this.djEngine.init(this.audioContext, this.fxRouter.output); } catch (e) {
          console.warn('DjEngine init failed, falling back direct to destination', e);
          this.fxRouter.output.connect(this.audioContext.destination);
        }
        console.log('FX Router inserted: delay/reverb/filter available');
      } catch (routerErr) {
        console.warn('Failed to build/insert FX Router, routing master directly', routerErr);
        try { this.djEngine.init(this.audioContext, this.gainNode); } catch (e) { console.warn('DjEngine init failed, falling back direct to destination', e); this.gainNode.connect(this.audioContext.destination); }
      }
      console.log('AudioContext initialized for enhanced 3D audio (on user gesture)');
    } catch (e) {
      console.error('Error initializing AudioContext:', e);
    }
  }

  private startAutoDjIfReady(firstSong: Song) {
    try {
      if (!this.audioContext || !this.fxRouter) return;
      const currentMeta = {
        id: firstSong.songUrl,
        title: firstSong.title,
        artist: firstSong.artists,
        bpm: firstSong.bpm || 120,
        genre: firstSong.genre,
        energy: 0.7
      };
      const candidatesProvider = () => {
        const list: any[] = [];
        for (const s of this.songs) {
          if (!s.songUrl || s.songUrl === firstSong.songUrl) continue;
          list.push({ id: s.songUrl, title: s.title, artist: s.artists, bpm: s.bpm || 120, genre: s.genre, energy: 0.6 });
        }
        return list;
      };
      const masterInsert = this.fxRouter.output;
      this.autoDj.start({ ctx: this.audioContext, masterInsert, fxRouter: this.fxRouter, currentSong: currentMeta as any, candidatesProvider });
      console.log('Auto-DJ started');
    } catch (e) {
      console.warn('Failed to start Auto-DJ:', e);
    }
  }

  /**
   * Tears down HTML5 audio elements and Web Audio nodes to avoid leaks/duplication
   */
  private teardownHtmlAudio(): void {
    try {
      if (this.currentAudioPlayer) {
        try { this.currentAudioPlayer.removeEventListener('timeupdate', this.updateProgressListener); } catch {}
        try { if (this.currentSongEndedListener) this.currentAudioPlayer.removeEventListener('ended', this.currentSongEndedListener); } catch {}
        try { this.currentAudioPlayer.pause(); } catch {}
      }
      if (this.nextAudioPlayer) {
        try { this.nextAudioPlayer.pause(); } catch {}
      }
      this.currentAudioPlayer = null;
      this.nextAudioPlayer = null;

      // Stop any crossfade in progress and reset the auto-mix engine
      this.crossfadeActive = false;
      if (this.crossfadeRafId) {
        cancelAnimationFrame(this.crossfadeRafId);
        this.crossfadeRafId = 0;
      }
      if (this.rateGlideTimer) {
        clearInterval(this.rateGlideTimer);
        this.rateGlideTimer = null;
      }
      this.currentDeckRate = 1;
      this.plannedMixOutAt = null;
      this.plannedMixOutUsedAnalysis = false;

      const nodes: (AudioNode | null)[] = [
        this.currentSourceNode, this.nextSourceNode, this.currentPannerNode, this.nextPannerNode,
        this.reverbNode, this.reverbGain, this.dryGain,
        this.currentDelayNode, this.currentFeedbackGain, this.currentDelayMix, this.currentDryMix,
        this.nextDelayNode, this.nextFeedbackGain, this.nextDelayMix, this.nextDryMix,
        this.currentBassCutNode, this.nextBassCutNode,
        this.currentHiCutNode, this.nextHiCutNode,
        this.currentMakeupGain, this.nextMakeupGain,
        this.analyzer
      ];
      nodes.forEach(n => { try { n && n.disconnect(); } catch {} });
      this.currentSourceNode = this.nextSourceNode = null;
      this.currentPannerNode = this.nextPannerNode = null;
      this.reverbNode = this.reverbGain = this.dryGain = null;
      this.currentDelayNode = this.currentFeedbackGain = this.currentDelayMix = this.currentDryMix = null;
      this.nextDelayNode = this.nextFeedbackGain = this.nextDelayMix = this.nextDryMix = null;
      this.currentBassCutNode = this.nextBassCutNode = null;
      this.currentHiCutNode = this.nextHiCutNode = null;
      this.currentMakeupGain = this.nextMakeupGain = null;
      this.analyzer = null;
    } catch (e) {
      console.warn('Error tearing down HTML Audio pipeline', e);
    }
  }

  /**
   * Creates a minimal reverb effect for enhanced 3D audio
   */
  private async createReverbEffect(): Promise<void> {
    if (!this.audioContext) return;

    try {
      // Create convolver node for minimal reverb
      this.reverbNode = this.audioContext.createConvolver();

      // Create gain nodes for wet/dry mix
      // Significantly reduce the wet signal to minimize reverb effect
      this.reverbGain = this.audioContext.createGain();
      this.reverbGain.gain.value = 0.05; // 5% wet signal (minimal reverb)

      // Increase dry signal for clearer 3D audio
      this.dryGain = this.audioContext.createGain();
      this.dryGain.gain.value = 0.95; // 95% dry signal

      // Connect reverb to master gain
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.gainNode!);
      this.dryGain.connect(this.gainNode!);

      // Generate impulse response with minimal decay for enhanced clarity
      const impulseResponse = await this.generateRoomImpulseResponse();
      this.reverbNode.buffer = impulseResponse;

      console.log('Enhanced 3D audio initialized with minimal reverb');
    } catch (e) {
      console.error('Failed to create enhanced 3D audio effect:', e);
    }
  }

  /**
   * Generates a short, clean impulse response for enhanced 3D audio clarity
   * @returns AudioBuffer containing the impulse response
   */
  private generateRoomImpulseResponse(): Promise<AudioBuffer> {
    return new Promise((resolve) => {
      if (!this.audioContext) {
        throw new Error('AudioContext not initialized');
      }

      // Create a shorter impulse response buffer (0.5 seconds) for cleaner sound
      const sampleRate = this.audioContext.sampleRate;
      const length = 0.5 * sampleRate; // 0.5 seconds (reduced from 2 seconds)
      const impulseResponse = this.audioContext.createBuffer(2, length, sampleRate);

      // Fill the buffer with minimal, controlled reflections for clarity
      for (let channel = 0; channel < 2; channel++) {
        const channelData = impulseResponse.getChannelData(channel);

        // Initial impulse
        channelData[0] = 1.0;

        // Generate minimal early reflections with faster decay
        for (let i = 1; i < length; i++) {
          // Faster decay for cleaner sound (0.2s decay time)
          const decay = Math.exp(-i / (sampleRate * 0.2));

          // Reduced randomness and amplitude for clearer 3D positioning
          channelData[i] = (Math.random() * 2 - 1) * decay * 0.02;

          // Apply additional filtering to reduce muddiness
          if (i % 2 === 0) {
            channelData[i] *= 0.8; // Further reduce even samples for cleaner sound
          }
        }
      }

      resolve(impulseResponse);
    });
  }

  playFirstSong(): void {
    if (this.songs.length === 0) return;

    // Initialize audio engine on first user gesture if needed
    if (!this.audioContext) {
      this.startAudioEngine();
    }

    const firstSong = this.songs[0];

    // Reset transition flag
    this.transitionStarted = false;

    // Check if we're already using Howler and handle play/pause toggle
    const currentHowlSound = this.howlerAudioService.getCurrentSound();
    if (currentHowlSound) {
      // Toggle play/pause for Howler
      if (firstSong.isPlaying) {
        this.howlerAudioService.pause();
        firstSong.isPlaying = false;
        console.log('Paused Howler audio');
      } else {
        this.howlerAudioService.resume();
        firstSong.isPlaying = true;
        console.log('Resumed Howler audio');
      }
      return;
    }

    // Try to initialize with Howler for better audio quality (optional)
    if (this.useHowlerEngine && this.initializeWithHowler()) {
      console.log('Using Howler.js for enhanced audio quality and smoother transitions');
      // Analyze emotion and apply effects for the first song
      this.analyzeAndApplyEmotionEffects(firstSong);
      // Start autonomous DJ if available
      try { this.startAutoDjIfReady(firstSong); } catch {}
      return;
    }

    // Fallback to standard HTML5 Audio if Howler initialization fails

    // Create or update the current audio player
    if (!this.currentAudioPlayer) {
      this.currentAudioPlayer = new Audio(firstSong.songUrl);
      this.currentAudioPlayer.crossOrigin = 'anonymous';
      // Detect BPM when loading a new song
      this.analyzeSong(firstSong);
    } else if (this.currentAudioPlayer.src !== firstSong.songUrl) {
      // If the current song has changed, create a new audio player
      this.currentAudioPlayer.pause();
      this.currentAudioPlayer = new Audio(firstSong.songUrl);
      this.currentAudioPlayer.crossOrigin = 'anonymous';
      // Detect BPM when loading a new song
      this.analyzeSong(firstSong);
    }

    // Set up event listeners for current song (remove old ones first to avoid duplicates)
    if (this.currentAudioPlayer) {
      // Remove existing event listeners if any
      if (this.updateProgressListener) {
        this.currentAudioPlayer.removeEventListener('timeupdate', this.updateProgressListener);
      }
      if (this.currentSongEndedListener) {
        this.currentAudioPlayer.removeEventListener('ended', this.currentSongEndedListener);
      }

      // Create a new ended listener for this song
      this.currentSongEndedListener = () => {
        console.log('Song ended event triggered');

        // Track whether we attempted to start a transition
        let transitionAttempted = false;

        // Only handle the ended event if we haven't already started a transition
        // This prevents the gap between songs
        if (!this.transitionStarted && this.songs.length > 1) {
          console.log('Starting DJ transition on song end');
          // Start transition immediately if not already started
          this.startDjTransition();
          transitionAttempted = true;

          // Set a fallback timer to ensure the next song plays even if transition fails
          setTimeout(() => {
            if (!this.transitionStarted && this.songs.length > 1) {
              console.log('Fallback: DJ transition did not start properly, moving to next song');
              this.moveToNextSong();
            }
          }, 300); // Short delay to allow transition to start
        } else if (!this.transitionStarted) {
          // If there's no next song, just reset the current song
          firstSong.isPlaying = false;
          firstSong.currentTime = '0:00';
          firstSong.progress = 0;
        }

        // If transition is already in progress, the moveToNextSong will be handled
        // by the transition completion, not by this ended event
        if (this.transitionStarted && this.songs.length > 1) {
          console.log('Transition already in progress, letting it handle the song change');
          // Don't reset the song or move to next song here
          // The transition will handle it smoothly
        } else if (this.songs.length > 1 && !transitionAttempted) {
          // Only call moveToNextSong if we didn't attempt to start a transition
          // This prevents potential race conditions
          console.log('Moving to next song without transition');
          this.moveToNextSong();
        }
      };

      // Add new event listeners
      this.currentAudioPlayer.addEventListener('timeupdate', this.updateProgressListener);
      this.currentAudioPlayer.addEventListener('ended', this.currentSongEndedListener);

      // Set up 3D audio for current song
      this.setupSpatialAudio(this.currentAudioPlayer, true);
    }

    // Pick the most compatible next track (harmonic mixing) before wiring it
    this.selectBestNextTrack();
    this.plannedMixOutAt = null;
    this.plannedMixOutUsedAnalysis = false;

    // Initialize or update next audio player if there's a next song
    if (this.songs.length > 1) {
      const nextSong = this.songs[1];

      if (!this.nextAudioPlayer) {
        this.nextAudioPlayer = new Audio(nextSong.songUrl);
        this.nextAudioPlayer.crossOrigin = 'anonymous';
        // Detect BPM for next song
        this.analyzeSong(nextSong);
      } else if (this.nextAudioPlayer.src !== nextSong.songUrl) {
        // If the next song has changed, create a new audio player
        this.nextAudioPlayer.pause();
        this.nextAudioPlayer = new Audio(nextSong.songUrl);
        this.nextAudioPlayer.crossOrigin = 'anonymous';
        // Detect BPM for next song
        this.analyzeSong(nextSong);
      }

      this.nextAudioPlayer.volume = 0; // Start with volume at 0

      // Set up 3D audio for next song
      this.setupSpatialAudio(this.nextAudioPlayer, false);
    } else {
      // No next song available
      if (this.nextAudioPlayer) {
        this.nextAudioPlayer.pause();
        this.nextAudioPlayer = null;
      }
    }

    // Toggle play/pause
    if (firstSong.isPlaying) {
      if (this.currentAudioPlayer) {
        this.currentAudioPlayer.pause();
      }
      if (this.nextAudioPlayer && this.transitionStarted) {
        this.nextAudioPlayer.pause();
      }
      firstSong.isPlaying = false;
      this.transitionStarted = false;
    } else {
      // Resume AudioContext if it was suspended
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      if (this.currentAudioPlayer) {
        this.currentAudioPlayer.play();
        // Start real-time analyzer for dynamic FX based on energy
        try { this.startRealTimeAnalysis(); } catch {}
        // Analyze emotion and apply effects for the first song
        this.analyzeAndApplyEmotionEffects(firstSong);
        // Start autonomous DJ if available (HTML5 path)
        try { this.startAutoDjIfReady(firstSong); } catch {}
      }
      firstSong.isPlaying = true;
    }
  }

  /**
   * Sets up enhanced 3D audio for a given audio element
   * @param audioElement The audio element to set up 3D audio for
   * @param isCurrentSong Whether this is the current song (true) or next song (false)
   */
  private setupSpatialAudio(audioElement: HTMLAudioElement, isCurrentSong: boolean): void {
    if (!this.audioContext || !this.gainNode || !this.reverbNode || !this.reverbGain || !this.dryGain) return;

    // Disconnect existing nodes if they exist
    if (isCurrentSong) {
      if (this.currentSourceNode) {
        this.currentSourceNode.disconnect();
      }
      if (this.currentPannerNode) {
        this.currentPannerNode.disconnect();
      }
    } else {
      if (this.nextSourceNode) {
        this.nextSourceNode.disconnect();
      }
      if (this.nextPannerNode) {
        this.nextPannerNode.disconnect();
      }
    }

    // Create source node from audio element
    const sourceNode = this.audioContext.createMediaElementSource(audioElement);

    // Create enhanced audio processing chain for ultra-high-quality sound
    const processingNodes = this.createAudioProcessingChain(isCurrentSong);

    // Create panner node for enhanced 3D audio
    const pannerNode = this.audioContext.createPanner();

    // Configure panner for ultra-high-quality 3D audio
    pannerNode.panningModel = 'HRTF'; // Head-Related Transfer Function for realistic 3D audio
    pannerNode.distanceModel = 'exponential'; // More precise distance model for better depth perception
    pannerNode.refDistance = 1;
    pannerNode.maxDistance = 20000; // Extended range for better spatial resolution
    pannerNode.rolloffFactor = 1.0; // Optimized for clearer positioning without excessive attenuation

    // Configure directional audio cone for precise sound projection
    pannerNode.coneInnerAngle = 40; // Narrower inner cone for more precise directional sound
    pannerNode.coneOuterAngle = 180; // Wider outer cone for better peripheral sound
    pannerNode.coneOuterGain = 0.7; // Less reduction outside the cone for more natural sound field

    // Position the audio in 3D space with optimized positioning for immersive experience
    if (isCurrentSong) {
      // Current song positioned directly in front of listener with optimal elevation
      pannerNode.positionX.value = 0;
      pannerNode.positionY.value = 0.2; // Slightly above ear level (reduced from 0.5 for more natural positioning)
      pannerNode.positionZ.value = -1.5; // Closer to listener for more presence (changed from -2)

      // Orient the sound source to face the listener with precision
      if (pannerNode.orientationX) {
        pannerNode.orientationX.value = 0;
        pannerNode.orientationY.value = 0;
        pannerNode.orientationZ.value = 1; // Directly facing the listener
      } else {
        // Fallback for older browsers
        pannerNode.setOrientation(0, 0, 1);
      }
    } else {
      // Next song positioned with optimal separation for clear distinction
      pannerNode.positionX.value = 2; // Right side but not as far (changed from 3 for more natural positioning)
      pannerNode.positionY.value = 0; // At ear level for better localization (changed from -0.3)
      pannerNode.positionZ.value = 0; // Neither in front nor behind (changed from 1)

      // Orient the sound source to face the listener at an optimal angle
      if (pannerNode.orientationX) {
        pannerNode.orientationX.value = -0.5;
        pannerNode.orientationY.value = 0;
        pannerNode.orientationZ.value = -0.5; // Angled toward the listener
      } else {
        // Fallback for older browsers
        pannerNode.setOrientation(-0.5, 0, -0.5);
      }
    }

    // Create a splitter for the dry/wet paths
    const splitter = this.audioContext.createGain();

    // Connect nodes: source -> processing chain -> splitter
    sourceNode.connect(processingNodes.input);
    processingNodes.output.connect(splitter);

    // Connect to panner node
    splitter.connect(pannerNode);

    // Create a post-panner splitter for dry/wet paths
    const postPannerSplitter = this.audioContext.createGain();
    pannerNode.connect(postPannerSplitter);

    // Connect dry path: postPannerSplitter -> dryGain -> master gain
    postPannerSplitter.connect(this.dryGain);

    // Connect wet path: postPannerSplitter -> reverb -> reverbGain -> master gain
    postPannerSplitter.connect(this.reverbNode);

    // Store nodes for later use
    if (isCurrentSong) {
      this.currentSourceNode = sourceNode;
      this.currentPannerNode = pannerNode;
      // Store delay effect nodes for current song
      this.currentDelayNode = processingNodes.delayNode;
      this.currentFeedbackGain = processingNodes.feedbackGain;
      this.currentDelayMix = processingNodes.delayMix;
      this.currentDryMix = processingNodes.dryMix;
      this.currentBassCutNode = processingNodes.bassCut;
      this.currentHiCutNode = processingNodes.hiCut;
      this.currentMakeupGain = processingNodes.makeupGain;
    } else {
      this.nextSourceNode = sourceNode;
      this.nextPannerNode = pannerNode;
      // Store delay effect nodes for next song
      this.nextDelayNode = processingNodes.delayNode;
      this.nextFeedbackGain = processingNodes.feedbackGain;
      this.nextDelayMix = processingNodes.delayMix;
      this.nextDryMix = processingNodes.dryMix;
      this.nextBassCutNode = processingNodes.bassCut;
      this.nextHiCutNode = processingNodes.hiCut;
      this.nextMakeupGain = processingNodes.makeupGain;
    }
    // NOTE: sources are intentionally NOT attached to DjEngineService here.
    // Its planTransition() connected the raw sources to a second, parallel
    // audio path (bypassing this chain), which doubled the signal and made
    // transitions sound wrong.
  }

  /**
   * Creates an enhanced audio processing chain for ultra-high-quality 3D sound
   * @param isCurrentSong Whether this is for the current song
   * @returns Object with input and output nodes of the processing chain and delay effect nodes
   */
  private createAudioProcessingChain(isCurrentSong: boolean): {
    input: AudioNode,
    output: AudioNode,
    delayNode: DelayNode,
    feedbackGain: GainNode,
    delayMix: GainNode,
    dryMix: GainNode,
    bassCut: BiquadFilterNode,
    hiCut: BiquadFilterNode,
    makeupGain: GainNode
  } {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    // Create advanced audio processing nodes for ultra-high-quality sound

    // 0. Sweepable high-pass used for the DJ bass swap during transitions.
    // At 20 Hz it is acoustically neutral; during a crossfade its frequency is
    // ramped up to remove the lows of one deck while the other's come in.
    const bassCut = this.audioContext.createBiquadFilter();
    bassCut.type = 'highpass';
    bassCut.frequency.value = 20;
    bassCut.Q.value = 0.7;

    // 0b. Sweepable low-pass for echo-out / filter-fade transitions.
    // Neutral at 20 kHz; swept down to darken the outgoing deck.
    const hiCut = this.audioContext.createBiquadFilter();
    hiCut.type = 'lowpass';
    hiCut.frequency.value = 20000;
    hiCut.Q.value = 0.7;

    // 0c. Per-deck makeup gain: the auto-mix engine sets this so every track
    // plays at the same perceived loudness (automatic gain staging).
    const makeupGain = this.audioContext.createGain();
    makeupGain.gain.value = 1.0;

    // 1. Pre-gain to optimize input level
    const preGain = this.audioContext.createGain();
    preGain.gain.value = 0.9; // Slight reduction to prevent potential clipping

    // 2. Sub-bass enhancement filter (30-60Hz)
    const subBass = this.audioContext.createBiquadFilter();
    subBass.type = 'lowshelf';
    subBass.frequency.value = 60;
    subBass.gain.value = 2.0; // Moderate boost to sub-bass

    // 3. Bass enhancement filter (60-250Hz)
    const bassBoost = this.audioContext.createBiquadFilter();
    bassBoost.type = 'peaking';
    bassBoost.frequency.value = 120;
    bassBoost.Q.value = 1.2; // More focused Q for tighter bass
    bassBoost.gain.value = 3.5; // Enhanced bass boost

    // 4. Lower mid-range filter (250-500Hz)
    const lowerMid = this.audioContext.createBiquadFilter();
    lowerMid.type = 'peaking';
    lowerMid.frequency.value = 400;
    lowerMid.Q.value = 1.5;
    lowerMid.gain.value = -1.0; // Slight cut to reduce muddiness

    // 5. Mid-range clarity filter (500-2000Hz)
    const midRange = this.audioContext.createBiquadFilter();
    midRange.type = 'peaking';
    midRange.frequency.value = 1200;
    midRange.Q.value = 1.2;
    midRange.gain.value = 2.0; // Enhanced boost for vocal clarity

    // 6. Upper mid-range presence filter (2000-4000Hz)
    const upperMid = this.audioContext.createBiquadFilter();
    upperMid.type = 'peaking';
    upperMid.frequency.value = 3000;
    upperMid.Q.value = 1.5;
    upperMid.gain.value = 2.5; // Boost for presence and detail

    // 7. High-end brilliance filter (4000-10000Hz)
    const highEnd = this.audioContext.createBiquadFilter();
    highEnd.type = 'peaking';
    highEnd.frequency.value = 7500;
    highEnd.Q.value = 1.0;
    highEnd.gain.value = 2.5; // Enhanced boost for detail

    // 8. Air and sparkle filter (10000-20000Hz)
    const airFilter = this.audioContext.createBiquadFilter();
    airFilter.type = 'highshelf';
    airFilter.frequency.value = 12000;
    airFilter.gain.value = 3.0; // Enhanced boost for "air" and "sparkle"

    // 9. Dynamic compressor with optimized settings for 3D audio
    const compressor = this.audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 12; // Softer knee for more natural compression
    compressor.ratio.value = 4; // Lower ratio for more natural sound
    compressor.attack.value = 0.005; // Slightly slower attack to preserve transients
    compressor.release.value = 0.2; // Faster release for more dynamic sound

    // 10. Stereo enhancer for wider soundstage
    const stereoEnhancer = this.audioContext.createGain();
    stereoEnhancer.gain.value = 1.0;

    // 11. Delay effect for smooth transitions (initially with minimal effect)
    const delayNode = this.audioContext.createDelay(2.0); // Max delay of 2 seconds
    delayNode.delayTime.value = 0.01; // Start with minimal delay

    // Feedback for the delay (creates echo effect)
    const feedbackGain = this.audioContext.createGain();
    feedbackGain.gain.value = 0.0; // Start with no feedback

    // Wet/dry mix for the delay effect
    const delayMix = this.audioContext.createGain();
    delayMix.gain.value = 0.0; // Start with no delay in the mix

    const dryMix = this.audioContext.createGain();
    dryMix.gain.value = 1.0; // Full dry signal initially

    // Connect the delay feedback loop
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    // Connect the enhanced processing chain
    bassCut.connect(hiCut);
    hiCut.connect(preGain);
    preGain.connect(subBass);
    subBass.connect(bassBoost);
    bassBoost.connect(lowerMid);
    lowerMid.connect(midRange);
    midRange.connect(upperMid);
    upperMid.connect(highEnd);
    highEnd.connect(airFilter);
    airFilter.connect(stereoEnhancer);

    // Split the signal for wet/dry mix
    stereoEnhancer.connect(dryMix);
    stereoEnhancer.connect(delayNode);
    delayNode.connect(delayMix);

    // Mix the dry and wet signals
    const finalMixer = this.audioContext.createGain();
    dryMix.connect(finalMixer);
    delayMix.connect(finalMixer);

    // Connect to compressor for final output
    finalMixer.connect(compressor);

    // Final makeup gain for automatic loudness matching
    compressor.connect(makeupGain);

    // Return the input and output nodes of the chain, plus delay control nodes
    return {
      input: bassCut, // Chain starts at the sweepable bass-cut filter
      output: makeupGain,
      // Add these properties to the returned object
      delayNode: delayNode,
      feedbackGain: feedbackGain,
      delayMix: delayMix,
      dryMix: dryMix,
      bassCut: bassCut,
      hiCut: hiCut,
      makeupGain: makeupGain
    };
  }

  private moveToNextSong(): void {
    // Remove the first song
    this.songs.shift();

    // If there are still songs in the list
    if (this.songs.length > 0) {
      // Check if we need to add more songs for continuous playback
      if (this.songs.length < 2 && this.selectedPlaylist && this.selectedPlaylist.songs.length > 0) {
        // Select a random song from the playlist
        const randomIndex = Math.floor(Math.random() * this.selectedPlaylist.songs.length);
        const randomSongUpload = this.selectedPlaylist.songs[randomIndex];
        
        // Create a new Song object
        const newSong: Song = {
          title: 'Loading...',
          artists: this.selectedPlaylist.artist,
          composer: '',
          duration: '--:--',
          currentTime: '0:00',
          coverUrl: this.localCoverUrl,
          waveformData: Array(100).fill(0).map(() => Math.floor(Math.random() * 100)),
          songUrl: randomSongUpload.url,
          isPlaying: false,
          progress: 0,
          durationSeconds: 0
        };
        
        // Add to the songs array
        this.songs.push(newSong);
        
        // Load metadata for the new song
        this.metadataService.extractMetadata(newSong.songUrl).subscribe(
          metadata => {
            newSong.title = metadata.title || newSong.title;
            newSong.composer = metadata.composer || '';
            // Update duration if available
            if (metadata.duration) {
              const totalSeconds = Math.floor(metadata.duration);
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;
              newSong.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
              newSong.durationSeconds = totalSeconds;
            }
          },
          error => console.error('Error loading metadata for new song:', error)
        );
        
        console.log(`Added new random song for continuous playback: ${newSong.title}`);
      }
      // The next song becomes the current song
      const newCurrentSong = this.songs[0];

      // Reset transition flag for the new song and stop any stale crossfade loop
      this.transitionStarted = false;
      this.crossfadeActive = false;
      if (this.crossfadeRafId) {
        cancelAnimationFrame(this.crossfadeRafId);
        this.crossfadeRafId = 0;
      }

      // Check if we're using Howler for audio
      if (this.howlerAudioService.getCurrentSound()) {
        console.log('Moving to next song using Howler.js');

        // The current sound in Howler service is already the next song after transition
        // Just need to preload the new next song if available
        if (this.songs.length > 1) {
          const nextNextSong = this.songs[1];

          this.howlerAudioService.preloadNext(
            nextNextSong.songUrl,
            () => {
              console.log(`Next song ended: "${nextNextSong.title}"`);
              this.getHowlerEndedListener()();
            },
            () => {
              console.log(`Preloaded next song: "${nextNextSong.title}"`);
            }
          );
        }

        // Set up progress updates for the new current song
        const updateProgress = () => {
          if (this.howlerAudioService.getCurrentSound()) {
            const sound = this.howlerAudioService.getCurrentSound()!;
            const currentTime = sound.seek() as number;
            const duration = sound.duration();

            if (currentTime && duration) {
              // Calculate progress percentage
              const progress = (currentTime / duration) * 100;

              // Format current time as mm:ss
              const minutes = Math.floor(currentTime / 60);
              const seconds = Math.floor(currentTime % 60);
              const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

              // Update song properties
              newCurrentSong.currentTime = formattedTime;
              newCurrentSong.progress = progress;
            }

            // Continue updating if the song is playing
            if (sound.playing()) {
              requestAnimationFrame(updateProgress);
            }
          }
        };

        // Start updating progress
        updateProgress();
        
        // Analyze emotion and apply effects for the new current song
        this.analyzeAndApplyEmotionEffects(newCurrentSong);

        return;
      }

      // Swap audio players and Web Audio nodes
      this.currentAudioPlayer = this.nextAudioPlayer;
      this.currentSourceNode = this.nextSourceNode;
      this.currentPannerNode = this.nextPannerNode;

      // Swap delay effect nodes
      this.currentDelayNode = this.nextDelayNode;
      this.currentFeedbackGain = this.nextFeedbackGain;
      this.currentDelayMix = this.nextDelayMix;
      this.currentDryMix = this.nextDryMix;
      this.currentBassCutNode = this.nextBassCutNode;
      this.currentHiCutNode = this.nextHiCutNode;
      this.currentMakeupGain = this.nextMakeupGain;

      // Reset next nodes
      this.nextSourceNode = null;
      this.nextPannerNode = null;
      this.nextDelayNode = null;
      this.nextFeedbackGain = null;
      this.nextDelayMix = null;
      this.nextDryMix = null;
      this.nextBassCutNode = null;
      this.nextHiCutNode = null;
      this.nextMakeupGain = null;

      // Make sure the promoted deck plays with its full spectrum restored
      if (this.audioContext) {
        const now = this.audioContext.currentTime;
        try {
          this.currentBassCutNode?.frequency.cancelScheduledValues(now);
          this.currentBassCutNode?.frequency.setValueAtTime(20, now);
        } catch {}
        try {
          this.currentHiCutNode?.frequency.cancelScheduledValues(now);
          this.currentHiCutNode?.frequency.setValueAtTime(20000, now);
        } catch {}
      }

      // The promoted deck may be tempo-shifted from beatmatching; glide it
      // back to its native tempo, imperceptibly, like a pro DJ's tempo reset
      this.currentDeckRate = this.currentAudioPlayer?.playbackRate || 1;
      this.plannedMixOutAt = null;
      this.plannedMixOutUsedAnalysis = false;
      this.startRateGlide();

      // Reconnect analyzer to new current source if needed
      if (this.analyzer && this.currentSourceNode) {
        this.analyzer.disconnect();
        this.currentSourceNode.connect(this.analyzer);
      }

      if (this.currentAudioPlayer) {
        this.currentAudioPlayer.volume = 1; // Set volume to full

        // Remove existing event listeners if any
        if (this.updateProgressListener) {
          this.currentAudioPlayer.removeEventListener('timeupdate', this.updateProgressListener);
        }
        if (this.currentSongEndedListener) {
          this.currentAudioPlayer.removeEventListener('ended', this.currentSongEndedListener);
        }

        // Create a new ended listener for this song
        this.currentSongEndedListener = () => {
          console.log('Song ended event triggered in moveToNextSong');

          newCurrentSong.isPlaying = false;
          newCurrentSong.currentTime = '0:00';
          newCurrentSong.progress = 0;
          this.transitionStarted = false;

          // Track whether we attempted to start a transition
          let transitionAttempted = false;

          // Check if we should start a transition instead of directly moving to next song
          if (!this.transitionStarted && this.songs.length > 1 && this.nextAudioPlayer) {
            console.log('Starting DJ transition on song end from moveToNextSong');
            // Start transition immediately if not already started
            this.startDjTransition();
            transitionAttempted = true;

            // Set a fallback timer to ensure the next song plays even if transition fails
            setTimeout(() => {
              if (!this.transitionStarted && this.songs.length > 1) {
                console.log('Fallback: DJ transition did not start properly in moveToNextSong, moving to next song');
                this.moveToNextSong();
              }
            }, 300); // Short delay to allow transition to start
          }

          // If transition is already in progress, let it handle the song change
          if (this.transitionStarted && this.songs.length > 1) {
            console.log('Transition already in progress in moveToNextSong, letting it handle the song change');
            // The transition will handle it smoothly
          } else if (this.songs.length > 1 && !transitionAttempted) {
            // Only call moveToNextSong if we didn't attempt to start a transition
            console.log('Moving to next song without transition from moveToNextSong');
            this.moveToNextSong();
          }
        };

        // Add new event listeners
        this.currentAudioPlayer.addEventListener('timeupdate', this.updateProgressListener);
        this.currentAudioPlayer.addEventListener('ended', this.currentSongEndedListener);

        // Update panner position and orientation for current song (move it to the front)
        if (this.currentPannerNode && this.audioContext) {
          // Position in front of listener with slight elevation
          this.currentPannerNode.positionX.value = 0;
          this.currentPannerNode.positionY.value = 0.5; // Slightly above ear level
          this.currentPannerNode.positionZ.value = -2; // In front

          // Orient to face the listener
          if (this.currentPannerNode.orientationX) {
            this.currentPannerNode.orientationX.value = 0;
            this.currentPannerNode.orientationY.value = 0;
            this.currentPannerNode.orientationZ.value = 1; // Facing the listener
          } else {
            // Fallback for older browsers
            this.currentPannerNode.setOrientation(0, 0, 1);
          }

          // Reset reverb levels to default
          if (this.reverbGain && this.dryGain) {
            this.reverbGain.gain.value = 0.3; // Default reverb level
            this.dryGain.gain.value = 0.7; // Default dry level
          }
        }

        // Explicitly start playing the new current song to ensure no gap between songs
        const playPromise = this.currentAudioPlayer.play();
        
        // Analyze emotion and apply effects for the new current song
        this.analyzeAndApplyEmotionEffects(newCurrentSong);

        // Handle play promise to avoid uncaught promise rejection
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error('Error starting next song playback in moveToNextSong:', error);
            // Try again after a short delay if autoplay was prevented
            setTimeout(() => {
              this.currentAudioPlayer?.play().catch(e => console.error('Retry failed in moveToNextSong:', e));
            }, 100);
          });
        }
      }

      // Pick the most compatible next track (harmonic mixing) before wiring it
      this.selectBestNextTrack();

      // Create a new next audio player if there's another song
      if (this.songs.length > 1) {
        const newNextSong = this.songs[1];
        this.nextAudioPlayer = new Audio(newNextSong.songUrl);
        this.nextAudioPlayer.crossOrigin = 'anonymous';
        this.nextAudioPlayer.volume = 0;
        this.analyzeSong(newNextSong);

        // Set up 3D audio for the new next song
        this.setupSpatialAudio(this.nextAudioPlayer, false);
      } else {
        this.nextAudioPlayer = null;
      }

      // Update the UI
      newCurrentSong.isPlaying = true;
      newCurrentSong.progress = 0;
      newCurrentSong.currentTime = '0:00';
    }
  }

  private updateSongProgress(): void {
    if (!this.currentAudioPlayer || this.songs.length === 0) return;

    const firstSong = this.songs[0];

    // Update current time
    const currentSeconds = Math.floor(this.currentAudioPlayer.currentTime);
    const minutes = Math.floor(currentSeconds / 60);
    const seconds = currentSeconds % 60;
    firstSong.currentTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Update progress percentage (0-100)
    firstSong.progress = (this.currentAudioPlayer.currentTime / this.currentAudioPlayer.duration) * 100;

    // Check if we need to start the DJ transition. The mix-out point is
    // phrase-aligned: it lands on a downbeat where the track's outro begins
    // (from the structure analysis), falling back to a BPM-scaled lead time.
    if (this.songs.length > 1 && this.nextAudioPlayer && !this.transitionStarted) {
      const totalDuration = this.currentAudioPlayer.duration;
      const remainingTime = totalDuration - this.currentAudioPlayer.currentTime;

      // (Re)compute the mix-out point: initially with the BPM fallback, and
      // again once the track analysis arrives so outro/phrase alignment kicks in
      const hasAnalysis = !!this.songs[0]?.analysis;
      if ((this.plannedMixOutAt === null || (!this.plannedMixOutUsedAnalysis && hasAnalysis)) &&
          isFinite(totalDuration) && totalDuration > 0) {
        this.plannedMixOutAt = this.computeMixOutTime(totalDuration);
        this.plannedMixOutUsedAnalysis = hasAnalysis;
      }

      if (isFinite(remainingTime) && this.plannedMixOutAt !== null &&
          this.currentAudioPlayer.currentTime >= this.plannedMixOutAt) {
        console.log(`Starting DJ crossfade at ${this.currentAudioPlayer.currentTime.toFixed(2)}s (planned mix-out: ${this.plannedMixOutAt.toFixed(2)}s, remaining: ${remainingTime.toFixed(2)}s)`);
        this.startDjTransition();

        // Set a flag to track if we've already set up a fallback for this transition attempt
        if (!this.transitionFallbackSet) {
          this.transitionFallbackSet = true;

          // Set a fallback timer to ensure the next song plays even if transition fails
          // This timer will only trigger if the song is very close to ending (5 seconds or less)
          setTimeout(() => {
            // If we're very close to the end and transition hasn't started properly
            if (this.currentAudioPlayer &&
                this.songs.length > 1 &&
                !this.transitionStarted &&
                (this.currentAudioPlayer.duration - this.currentAudioPlayer.currentTime) <= 5) {
              console.log('Fallback: Song is about to end and DJ transition did not start properly, moving to next song');
              this.moveToNextSong();
            }
            // Reset the fallback flag
            this.transitionFallbackSet = false;
          }, 1000); // Check after 1 second
        }
      }
    }

    // Detect and enhance drops in the current song
    this.detectAndEnhanceDrops();
  }

  // Audio players for preloading songs beyond the next one
  private preloadedAudioPlayers: { [index: number]: HTMLAudioElement } = {};

  /**
   * Preloads songs beyond the next one to reduce transition delays
   */
  private preloadUpcomingSongs(): void {
    // Preload up to 3 songs beyond the next one (increased from 2)
    for (let i = 2; i < Math.min(this.songs.length, 5); i++) {
      const songToPreload = this.songs[i];

      // Skip if already preloaded
      if (this.preloadedAudioPlayers[i] && this.preloadedAudioPlayers[i].src === songToPreload.songUrl) {
        continue;
      }

      // Create new audio element for preloading
      console.log(`Preloading song ${i}: ${songToPreload.title}`);
      const preloadPlayer = new Audio(songToPreload.songUrl);
      preloadPlayer.crossOrigin = 'anonymous';
      preloadPlayer.preload = 'auto';

      // Set higher priority for the next songs in queue
      if (i === 2) {
        // Highest priority for the song that will play after the next one
        preloadPlayer.preload = 'auto';
        // Force immediate loading
        preloadPlayer.load();
      } else {
        // Still high priority but not as urgent
        preloadPlayer.preload = 'auto';
        // Use setTimeout to stagger loading and prevent network congestion
        setTimeout(() => preloadPlayer.load(), (i - 2) * 500);
      }

      // Store in preloaded players map
      this.preloadedAudioPlayers[i] = preloadPlayer;

      // Detect BPM for preloaded song
      this.analyzeSong(songToPreload);
    }
  }

  private startDjTransition(): void {
    // Check if we're using Howler for audio (preferred method)
    const currentHowlSound = this.howlerAudioService.getCurrentSound();
    const nextHowlSound = this.howlerAudioService.getNextSound();

    if (currentHowlSound && nextHowlSound && !this.howlerAudioService.isInTransition()) {
      console.log('Starting professional DJ transition with Howler.js for enhanced audio quality');
      this.transitionStarted = true;

      // Preload upcoming songs immediately to reduce future transition delays
      this.preloadUpcomingSongs();

      // Get BPM values for current and next songs
      const currentSong = this.songs[0];
      const nextSong = this.songs[1];
      const currentBpm = currentSong.bpm || 128; // Default to 128 if not detected
      const nextBpm = nextSong.bpm || 128; // Default to 128 if not detected

      console.log(`Transition between songs using Howler: Current BPM: ${currentBpm}, Next BPM: ${nextBpm}`);

      // Calculate remaining time and optimal transition duration
      const currentPos = currentHowlSound.seek() as number;
      const currentDuration = currentHowlSound.duration();
      const remainingTime = currentDuration - currentPos;

      // Calculate optimal transition duration based on BPM and remaining time
      // Use a longer transition for smoother crossfade (15-20 seconds)
      const optimalTransitionDuration = Math.min(remainingTime, 20);

      // Start the transition with Howler's superior crossfade
      this.howlerAudioService.startTransition(optimalTransitionDuration);

      // Also apply spatial and delay effects for enhanced immersion
      this.startSpatialTransition();

      return;
    }

    // Web Audio / HTML5 path: clean equal-power crossfade (Beatport-style auto mix)
    this.startCrossfade();
  }

  /**
   * Fallback lead time when no track analysis is available yet.
   * Uses the track's BPM so the blend covers a musical number of bars,
   * clamped to the 20-30s window; short tracks get a proportionally shorter fade.
   */
  private getCrossfadeLeadSeconds(): number {
    const duration = this.currentAudioPlayer?.duration || 0;

    // Short tracks: quick fade so the blend doesn't eat half the song
    if (duration > 0 && duration < 90) {
      return Math.max(4, Math.min(10, duration / 4));
    }

    const bpm = this.songs[0]?.bpm || 128;
    // 16 bars (64 beats) of the current track - a typical DJ blend length
    const sixteenBars = (60 / bpm) * 64;
    return Math.max(20, Math.min(30, sixteenBars));
  }

  /**
   * Where the blend out of the current track should start, in current-track
   * seconds. Prefers the analyzed outro start, snapped to a downbeat so the
   * mix begins on a bar like a real DJ; falls back to the BPM-scaled lead.
   */
  private computeMixOutTime(duration: number): number {
    const a = this.songs[0]?.analysis;
    let start = duration - this.getCrossfadeLeadSeconds();

    if (a && a.outroStart > 0 && isFinite(a.outroStart)) {
      // Blend where the outro begins, within sensible bounds
      start = Math.min(Math.max(a.outroStart, duration - 45), duration - 10);
    }

    // Snap to the bar grid so the blend starts on a downbeat
    if (a && a.barDuration > 0) {
      const k = Math.round((start - a.downbeatOffset) / a.barDuration);
      const snapped = a.downbeatOffset + k * a.barDuration;
      if (isFinite(snapped) && snapped > 4 && snapped < duration - 4) {
        start = snapped;
      }
    }
    return Math.max(1, start);
  }

  /**
   * Reorders the queue so the most compatible track (tempo, harmony, energy)
   * is next - the same logic rekordbox/djay use for automatic track selection.
   */
  private selectBestNextTrack(): void {
    if (this.transitionStarted || this.crossfadeActive) return;
    if (this.songs.length <= 2) return;

    const cur = this.songs[0];
    let bestIdx = 1;
    let bestScore = -1;
    for (let i = 1; i < this.songs.length; i++) {
      const score = this.compatibilityScore(cur, this.songs[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx !== 1) {
      const [pick] = this.songs.splice(bestIdx, 1);
      this.songs.splice(1, 0, pick);
      console.log(`Auto-DJ picked "${pick.title}" as next track (compatibility ${(bestScore * 100).toFixed(0)}%)`);
    }
  }

  /**
   * 0-1 mix compatibility between two tracks: tempo proximity (with
   * half/double-time folding), Camelot-wheel harmony, and energy continuity.
   */
  private compatibilityScore(a: Song, b: Song): number {
    // Tempo
    const bpmA = (a.analysis?.bpm || a.bpm || 0) * (this.currentDeckRate || 1);
    const bpmB = b.analysis?.bpm || b.bpm || 0;
    let tempoScore = 0.5;
    if (bpmA > 0 && bpmB > 0) {
      let t = bpmB;
      if (bpmA / t > 1.5) t *= 2;
      else if (bpmA / t < 0.67) t /= 2;
      const dev = Math.abs(bpmA / t - 1);
      tempoScore = Math.max(0, 1 - dev / 0.16);
    }

    // Harmony (Camelot wheel)
    const keyScore = this.camelotScore(a.camelot, b.camelot);

    // Energy: favor a gentle build over big jumps or drops
    let energyScore = 0.5;
    if (a.energy !== undefined && b.energy !== undefined) {
      const delta = b.energy - a.energy;
      energyScore = Math.max(0, 1 - Math.abs(delta - 0.05) / 0.5);
    }

    return tempoScore * 0.5 + keyScore * 0.3 + energyScore * 0.2;
  }

  /** Harmonic compatibility on the Camelot wheel (1.0 = perfect). */
  private camelotScore(a?: string, b?: string): number {
    if (!a || !b) return 0.5;
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!numA || !numB) return 0.5;
    const letA = a.slice(-1);
    const letB = b.slice(-1);
    let d = Math.abs(numA - numB);
    d = Math.min(d, 12 - d); // the wheel wraps around
    if (d === 0) return letA === letB ? 1 : 0.9; // same key / relative major-minor
    if (d === 1 && letA === letB) return 0.85;   // adjacent on the wheel
    if (d === 2 && letA === letB) return 0.45;   // "energy jump"
    if (d === 1) return 0.4;
    return 0.15;
  }

  /**
   * Decides how to mix into the next track, from both tracks' analyses:
   *  - 'beatmatch': tempos within 8% -> tempo-sync the incoming deck and
   *    phase-lock it during a long 16/32-beat blend (like SYNC on a CDJ).
   *  - 'blend': moderately different tempos -> plain equal-power blend.
   *  - 'echo-cut': incompatible tempos -> short filter-down + echo-out cut.
   */
  private buildTransitionPlan(current: HTMLAudioElement): {
    type: 'beatmatch' | 'blend' | 'echo-cut';
    fadeDuration: number;
    playbackRate: number;
    nextStartAt: number;
    makeupGainNext: number;
    curA?: TrackAnalysis;
    nextA?: TrackAnalysis;
  } {
    const curSong = this.songs[0];
    const nextSong = this.songs[1];
    const curA = curSong?.analysis;
    const nextA = nextSong?.analysis;
    const duration = current.duration || 0;
    const remaining = Math.max(1, duration - current.currentTime);

    // Auto-gain: keep perceived loudness constant across the whole set.
    // The outgoing deck's own makeup gain is folded in so the anchor never drifts.
    let makeupGainNext = 1;
    if (curA?.loudness && nextA?.loudness) {
      const curMakeup = this.currentMakeupGain?.gain?.value ?? 1;
      makeupGainNext = Math.max(0.5, Math.min(1.8, (curA.loudness * curMakeup) / nextA.loudness));
    }

    // The incoming track starts on its first energetic downbeat (mix-in point)
    let nextStartAt = 0;
    if (nextA && nextA.mixInPoint > 0 && isFinite(nextA.mixInPoint) &&
        nextA.mixInPoint < (nextA.duration || Infinity) * 0.5) {
      nextStartAt = nextA.mixInPoint;
    }

    // Tempo compatibility (with half/double-time folding)
    const curBpmBase = curA?.bpm || curSong?.bpm || 0;
    const nextBpm = nextA?.bpm || nextSong?.bpm || 0;
    const curEffBpm = curBpmBase * (this.currentDeckRate || 1);
    let type: 'beatmatch' | 'blend' | 'echo-cut' = 'blend';
    let playbackRate = 1;

    if (curEffBpm > 0 && nextBpm > 0) {
      let target = nextBpm;
      if (curEffBpm / target > 1.5) target *= 2;
      else if (curEffBpm / target < 0.67) target /= 2;
      const rate = curEffBpm / target;
      const haveGrids = !!(curA && nextA && curA.beatInterval > 0 && nextA.beatInterval > 0);

      if (haveGrids && rate >= 0.92 && rate <= 1.08) {
        type = 'beatmatch';
        playbackRate = rate;
      } else if (rate >= 0.84 && rate <= 1.19) {
        type = 'blend';
      } else {
        type = 'echo-cut';
      }
    }

    // Blend length: a musical number of beats, capped by the remaining time
    let fadeDuration: number;
    if (type === 'beatmatch' && curA) {
      const wallBeat = curA.beatInterval / (this.currentDeckRate || 1);
      const beats = (curA.energy > 0.55 && (nextA?.energy ?? 0) > 0.55) ? 32 : 16;
      fadeDuration = beats * wallBeat;
    } else if (type === 'blend') {
      fadeDuration = this.getCrossfadeLeadSeconds();
    } else {
      fadeDuration = 8;
    }
    fadeDuration = Math.max(1, Math.min(remaining - 0.3, fadeDuration));

    return { type, fadeDuration, playbackRate, nextStartAt, makeupGainNext, curA, nextA };
  }

  /**
   * Starts the automatic DJ transition. The next track begins on its mix-in
   * downbeat, tempo-synced when possible, rises with an equal-power curve
   * while the current one fades out, with automatic gain staging, a bass
   * swap (or filter/echo cut), and a beat phase-lock that micro-nudges the
   * incoming deck exactly like a DJ riding the jog wheel.
   */
  private startCrossfade(): void {
    if (this.crossfadeActive) return;
    if (!this.currentAudioPlayer || !this.nextAudioPlayer || this.songs.length < 2) return;

    const current = this.currentAudioPlayer;
    const next = this.nextAudioPlayer;

    const duration = current.duration;
    if (!isFinite(duration) || duration <= 0) return;

    this.transitionStarted = true;
    this.crossfadeActive = true;

    // Preload upcoming songs so future transitions have no loading gap
    this.preloadUpcomingSongs();

    const plan = this.buildTransitionPlan(current);
    const fadeDuration = plan.fadeDuration;
    const fadeStart = current.currentTime;

    console.log(
      `Crossfade [${plan.type}] ${fadeDuration.toFixed(1)}s into "${this.songs[1]?.title}"` +
      (plan.type === 'beatmatch' ? `, sync rate ${plan.playbackRate.toFixed(4)}` : '') +
      `, gain ${plan.makeupGainNext.toFixed(2)}, next from ${plan.nextStartAt.toFixed(1)}s`
    );

    // Prepare the incoming deck
    if (next.readyState < 3) { // HAVE_FUTURE_DATA
      try { next.load(); } catch {}
    }
    try { (next as any).preservesPitch = true; } catch {} // master-tempo style: sync without chipmunking
    next.volume = 0;
    try { next.playbackRate = plan.playbackRate; } catch {}
    if (plan.nextStartAt > 0) {
      if (next.readyState >= 1) { // HAVE_METADATA - seekable now
        try { next.currentTime = plan.nextStartAt; } catch {}
      } else {
        // Seek to the mix-in point as soon as metadata arrives (if the blend
        // just started; later than ~1s in, jumping would be audible)
        const seekOnce = () => {
          next.removeEventListener('loadedmetadata', seekOnce);
          if (this.crossfadeActive && this.nextAudioPlayer === next && next.currentTime < 1) {
            try { next.currentTime = plan.nextStartAt; } catch {}
          }
        };
        next.addEventListener('loadedmetadata', seekOnce);
      }
    }

    // Auto-gain: the incoming track lands at the same perceived loudness
    if (this.nextMakeupGain && this.audioContext) {
      try {
        this.nextMakeupGain.gain.setTargetAtTime(plan.makeupGainNext, this.audioContext.currentTime, 0.4);
      } catch {}
    }

    const playPromise = next.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.error('Error starting next song during crossfade:', error);
        setTimeout(() => next.play().catch(e => console.error('Crossfade play retry failed:', e)), 150);
      });
    }

    // Transition FX (bass swap / filter sweep / echo tail) per plan type
    this.scheduleTransitionFx(plan);

    let lastSyncAt = -1;
    const tick = () => {
      if (!this.crossfadeActive) return;
      // Stop if the decks were swapped elsewhere (e.g. fallback moveToNextSong)
      if (this.currentAudioPlayer !== current || this.nextAudioPlayer !== next) {
        this.crossfadeActive = false;
        return;
      }

      // Keep the flag asserted so 'ended' fallbacks don't double-advance
      this.transitionStarted = true;

      // If the user paused, freeze the blend; resume the incoming deck with playback
      if (current.paused && !current.ended) {
        if (!next.paused) { try { next.pause(); } catch {} }
        this.crossfadeRafId = requestAnimationFrame(tick);
        return;
      }
      if (next.paused && !current.ended) {
        next.play().catch(() => {});
      }

      const remainingNow = (current.duration || duration) - current.currentTime;
      const progress = Math.max(0, Math.min(1, (current.currentTime - fadeStart) / fadeDuration));

      // Equal-power curves: perceived loudness stays constant during the blend
      current.volume = Math.max(0, Math.min(1, Math.cos(progress * Math.PI / 2)));
      next.volume = Math.max(0, Math.min(1, Math.sin(progress * Math.PI / 2)));

      // Beat phase-lock (PLL): measure the beat-phase error between decks and
      // micro-nudge the incoming deck's rate, like a DJ touching the jog wheel
      if (plan.type === 'beatmatch' && plan.curA && plan.nextA &&
          current.currentTime - lastSyncAt >= 0.25) {
        lastSyncAt = current.currentTime;
        const fbCur = (current.currentTime - plan.curA.beatOffset) / plan.curA.beatInterval;
        const fbNext = (next.currentTime - plan.nextA.beatOffset) / plan.nextA.beatInterval;
        let err = (fbCur - fbNext) % 1;
        if (err > 0.5) err -= 1;
        else if (err < -0.5) err += 1;
        const nudge = Math.max(-0.02, Math.min(0.02, err * 0.08));
        try { next.playbackRate = plan.playbackRate * (1 + nudge); } catch {}
      }

      // Delay/echo tail on the outgoing deck as it fades
      try { this.adjustDelayEffect(remainingNow); } catch {}

      if (current.ended || remainingNow <= 0.25 || progress >= 1) {
        this.finishCrossfade(current, next, plan.playbackRate);
        return;
      }
      this.crossfadeRafId = requestAnimationFrame(tick);
    };
    this.crossfadeRafId = requestAnimationFrame(tick);
  }

  /**
   * Schedules the audible "DJ hands" of the transition:
   *  - blends: bass swap so the two basslines never clash, plus a subtle
   *    tempo-synced delay tail;
   *  - echo-cut: low-pass sweep down + generous echo on the outgoing deck.
   */
  private scheduleTransitionFx(plan: { type: string; fadeDuration: number; curA?: TrackAnalysis }): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    const dur = plan.fadeDuration;
    const bpm = (plan.curA?.bpm || this.songs[0]?.bpm || 126) * (this.currentDeckRate || 1);

    try { this.fxRouter?.setDelayTempo(bpm, 4); } catch {}

    try {
      if (plan.type === 'echo-cut') {
        if (this.currentHiCutNode) {
          const f = this.currentHiCutNode.frequency;
          f.cancelScheduledValues(now);
          f.setValueAtTime(20000, now);
          f.exponentialRampToValueAtTime(380, now + dur * 0.95);
        }
        this.fxRouter?.setDelayWet(0.35, now + dur * 0.4, now + dur + 3);
        this.fxRouter?.setDelayFeedback(0.45, now + dur * 0.4);
      } else {
        this.scheduleBassSwap(dur);
        this.fxRouter?.setDelayWet(0.18, now + dur * 0.7, now + dur + 2);
        this.fxRouter?.setDelayFeedback(0.3, now + dur * 0.7);
      }
    } catch (e) {
      console.warn('Transition FX scheduling failed:', e);
    }
  }

  /**
   * Schedules the "bass swap": the incoming deck enters without lows (so the
   * two basslines never clash) and gets them back mid-blend, while the
   * outgoing deck loses its lows during the second half of the fade.
   */
  private scheduleBassSwap(fadeDuration: number): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    try {
      if (this.nextBassCutNode) {
        const f = this.nextBassCutNode.frequency;
        f.cancelScheduledValues(now);
        f.setValueAtTime(220, now);
        f.setValueAtTime(220, now + fadeDuration * 0.3);
        f.exponentialRampToValueAtTime(20, now + fadeDuration * 0.75);
      }
      if (this.currentBassCutNode) {
        const f = this.currentBassCutNode.frequency;
        f.cancelScheduledValues(now);
        f.setValueAtTime(20, now);
        f.setValueAtTime(20, now + fadeDuration * 0.35);
        f.exponentialRampToValueAtTime(240, now + fadeDuration * 0.9);
      }
    } catch (e) {
      console.warn('Bass swap scheduling failed:', e);
    }
  }

  /**
   * Ends the crossfade: silences and detaches the outgoing deck and promotes
   * the incoming one via moveToNextSong().
   */
  private finishCrossfade(current: HTMLAudioElement, next: HTMLAudioElement, finalRate: number = 1): void {
    if (!this.crossfadeActive) return;
    this.crossfadeActive = false;
    if (this.crossfadeRafId) cancelAnimationFrame(this.crossfadeRafId);

    // Detach listeners from the outgoing element BEFORE stopping it, so its
    // 'ended' event can't fire later and trigger a second song change
    try {
      current.removeEventListener('timeupdate', this.updateProgressListener);
      if (this.currentSongEndedListener) {
        current.removeEventListener('ended', this.currentSongEndedListener);
      }
    } catch {}
    try { current.pause(); } catch {}
    current.volume = 0;
    next.volume = 1;
    // Drop any phase-lock nudge residue; keep the clean sync rate for the glide
    try { next.playbackRate = finalRate; } catch {}

    console.log('Crossfade complete, promoting next track');
    this.moveToNextSong();
  }

  /**
   * After a beatmatched mix the promoted deck may play up to 8% off its
   * native tempo. Glide it back to 1.0 in imperceptible steps (a pro DJ's
   * slow tempo reset) so the next transition starts from natural speed.
   */
  private startRateGlide(): void {
    if (this.rateGlideTimer) {
      clearInterval(this.rateGlideTimer);
      this.rateGlideTimer = null;
    }
    if (Math.abs(this.currentDeckRate - 1) < 0.003) {
      this.currentDeckRate = 1;
      this.applyCurrentDeckRate();
      return;
    }
    this.rateGlideTimer = setInterval(() => {
      // Hold tempo while a new blend is running
      if (this.crossfadeActive) return;
      this.currentDeckRate += (1 - this.currentDeckRate) * 0.08;
      if (Math.abs(this.currentDeckRate - 1) < 0.003) {
        this.currentDeckRate = 1;
        clearInterval(this.rateGlideTimer);
        this.rateGlideTimer = null;
      }
      this.applyCurrentDeckRate();
    }, 500);
  }

  private applyCurrentDeckRate(): void {
    if (this.currentAudioPlayer) {
      try { this.currentAudioPlayer.playbackRate = this.currentDeckRate; } catch {}
    }
  }

  /**
   * Initializes the delay effect for smooth transition between songs
   */
  private initializeDelayEffect(): void {
    if (!this.audioContext || !this.currentDelayNode || !this.currentFeedbackGain ||
        !this.currentDelayMix || !this.currentDryMix) {
      return;
    }

    // Set initial delay parameters for current song
    // Start with no delay effect, it will be applied when 10 seconds remain
    const now = this.audioContext.currentTime;

    // Set delay time to a small initial value but keep it inactive
    this.currentDelayNode.delayTime.setValueAtTime(0.2, now);

    // Set feedback to zero initially
    this.currentFeedbackGain.gain.setValueAtTime(0, now);

    // Start with no delay in the mix
    this.currentDelayMix.gain.setValueAtTime(0, now);
    this.currentDryMix.gain.setValueAtTime(1, now);

    // If we have next song delay nodes, initialize them with no effect
    if (this.nextDelayNode && this.nextFeedbackGain && this.nextDelayMix && this.nextDryMix) {
      // Disable delay effect for next song
      this.nextDelayNode.delayTime.setValueAtTime(0.01, now);
      this.nextFeedbackGain.gain.setValueAtTime(0, now);
      this.nextDelayMix.gain.setValueAtTime(0, now);
      this.nextDryMix.gain.setValueAtTime(1, now);
    }
  }

  private startSpatialTransition(): void {
    if (!this.currentPannerNode || !this.nextPannerNode || !this.audioContext ||
        !this.reverbGain || !this.dryGain) return;

    // Schedule spatial movement for smooth transition
    const now = this.audioContext.currentTime;
    const transitionDuration = 20; // 20 seconds transition

    // Create intermediate points for more natural movement
    const quarterTime = transitionDuration / 4;
    const halfTime = transitionDuration / 2;
    const threeQuarterTime = (transitionDuration * 3) / 4;

    // Current song: complex 3D movement path from front to left-back
    // Starting position (front, slightly elevated)
    this.currentPannerNode.positionX.setValueAtTime(0, now);
    this.currentPannerNode.positionY.setValueAtTime(0.5, now);
    this.currentPannerNode.positionZ.setValueAtTime(-2, now);

    // First quarter: begin moving left and slightly up
    this.currentPannerNode.positionX.linearRampToValueAtTime(-1, now + quarterTime);
    this.currentPannerNode.positionY.linearRampToValueAtTime(0.7, now + quarterTime);
    this.currentPannerNode.positionZ.linearRampToValueAtTime(-1.5, now + quarterTime);

    // Second quarter: continue left, start moving back
    this.currentPannerNode.positionX.linearRampToValueAtTime(-2, now + halfTime);
    this.currentPannerNode.positionY.linearRampToValueAtTime(0.6, now + halfTime);
    this.currentPannerNode.positionZ.linearRampToValueAtTime(-0.5, now + halfTime);

    // Third quarter: further left and slightly down
    this.currentPannerNode.positionX.linearRampToValueAtTime(-2.5, now + threeQuarterTime);
    this.currentPannerNode.positionY.linearRampToValueAtTime(0.3, now + threeQuarterTime);
    this.currentPannerNode.positionZ.linearRampToValueAtTime(0.5, now + threeQuarterTime);

    // Final position: far left, behind, lower
    this.currentPannerNode.positionX.linearRampToValueAtTime(-3, now + transitionDuration);
    this.currentPannerNode.positionY.linearRampToValueAtTime(0, now + transitionDuration);
    this.currentPannerNode.positionZ.linearRampToValueAtTime(1, now + transitionDuration);

    // Also adjust orientation to follow the movement path
    if (this.currentPannerNode.orientationX) {
      // Start facing listener
      this.currentPannerNode.orientationX.setValueAtTime(0, now);
      this.currentPannerNode.orientationY.setValueAtTime(0, now);
      this.currentPannerNode.orientationZ.setValueAtTime(1, now);

      // Gradually turn as it moves
      this.currentPannerNode.orientationX.linearRampToValueAtTime(0.7, now + halfTime);
      this.currentPannerNode.orientationZ.linearRampToValueAtTime(0.7, now + halfTime);

      // End facing away from listener
      this.currentPannerNode.orientationX.linearRampToValueAtTime(0, now + transitionDuration);
      this.currentPannerNode.orientationZ.linearRampToValueAtTime(-1, now + transitionDuration);
    }

    // Next song: complex 3D movement path from right-back to front
    // Starting position (right, slightly below, behind)
    this.nextPannerNode.positionX.setValueAtTime(3, now);
    this.nextPannerNode.positionY.setValueAtTime(-0.3, now);
    this.nextPannerNode.positionZ.setValueAtTime(1, now);

    // First quarter: begin moving center and up
    this.nextPannerNode.positionX.linearRampToValueAtTime(2, now + quarterTime);
    this.nextPannerNode.positionY.linearRampToValueAtTime(0, now + quarterTime);
    this.nextPannerNode.positionZ.linearRampToValueAtTime(0.5, now + quarterTime);

    // Second quarter: continue to center, start moving forward
    this.nextPannerNode.positionX.linearRampToValueAtTime(1, now + halfTime);
    this.nextPannerNode.positionY.linearRampToValueAtTime(0.2, now + halfTime);
    this.nextPannerNode.positionZ.linearRampToValueAtTime(0, now + halfTime);

    // Third quarter: approaching center and moving forward
    this.nextPannerNode.positionX.linearRampToValueAtTime(0.5, now + threeQuarterTime);
    this.nextPannerNode.positionY.linearRampToValueAtTime(0.4, now + threeQuarterTime);
    this.nextPannerNode.positionZ.linearRampToValueAtTime(-1, now + threeQuarterTime);

    // Final position: center, slightly elevated, in front
    this.nextPannerNode.positionX.linearRampToValueAtTime(0, now + transitionDuration);
    this.nextPannerNode.positionY.linearRampToValueAtTime(0.5, now + transitionDuration);
    this.nextPannerNode.positionZ.linearRampToValueAtTime(-2, now + transitionDuration);

    // Also adjust orientation to follow the movement path
    if (this.nextPannerNode.orientationX) {
      // Start angled toward listener
      this.nextPannerNode.orientationX.setValueAtTime(-0.7, now);
      this.nextPannerNode.orientationY.setValueAtTime(0, now);
      this.nextPannerNode.orientationZ.setValueAtTime(-0.7, now);

      // Gradually turn to face listener directly
      this.nextPannerNode.orientationX.linearRampToValueAtTime(-0.3, now + halfTime);
      this.nextPannerNode.orientationZ.linearRampToValueAtTime(-0.95, now + halfTime);

      // End facing listener directly
      this.nextPannerNode.orientationX.linearRampToValueAtTime(0, now + transitionDuration);
      this.nextPannerNode.orientationZ.linearRampToValueAtTime(1, now + transitionDuration);
    }

    // Adjust reverb levels during transition for enhanced spatial effect
    // Increase reverb for current song as it moves away
    this.reverbGain.gain.setValueAtTime(0.3, now);
    this.reverbGain.gain.linearRampToValueAtTime(0.5, now + transitionDuration);

    // Adjust dry/wet balance
    this.dryGain.gain.setValueAtTime(0.7, now);
    this.dryGain.gain.linearRampToValueAtTime(0.5, now + transitionDuration);
  }

  /**
   * Dynamically adjusts delay effect parameters based on remaining time and audio characteristics
   * @param remainingTime Time remaining in seconds for the current song
   */
  private adjustDelayEffect(remainingTime: number): void {
    if (!this.audioContext || !this.currentDelayNode || !this.currentFeedbackGain ||
        !this.currentDelayMix || !this.currentDryMix || !this.currentAudioPlayer) {
      return;
    }

    const now = this.audioContext.currentTime;

    // Create an analyzer to get audio characteristics
    if (!this.analyzer) {
      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 2048;

      // Connect the analyzer to the current source if not already connected
      if (this.currentSourceNode) {
        this.currentSourceNode.connect(this.analyzer);
      }
    }

    // Get frequency data for analysis
    const bufferLength = this.analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyzer.getByteFrequencyData(dataArray);

    // Calculate average energy in different frequency bands
    const bassEnergy = this.calculateAverageEnergy(dataArray, 0, 200);
    const midEnergy = this.calculateAverageEnergy(dataArray, 200, 2000);
    const highEnergy = this.calculateAverageEnergy(dataArray, 2000, 20000);

    // Normalize energy values (0-1)
    const normalizedBass = bassEnergy / 255;
    const normalizedMid = midEnergy / 255;
    const normalizedHigh = highEnergy / 255;

    // Calculate transition progress (0-1, where 0 is start of transition and 1 is end)
    const transitionProgress = Math.max(0, Math.min(1, 1 - (remainingTime / 20)));

    // Only apply delay effect to the first song when it's 10 seconds from ending
    if (remainingTime <= 10) {
      // Adjust delay parameters based on remaining time and audio characteristics

      // 1. Delay time: increase as we get closer to the end, influenced by bass energy
      // More bass = slightly longer delay for a richer effect
      const baseDelayTime = 0.2 + (transitionProgress * 0.3); // 0.2 to 0.5 seconds
      const bassInfluence = normalizedBass * 0.1; // Up to 0.1 seconds additional delay
      const delayTime = baseDelayTime + bassInfluence;

      // 2. Feedback: increase for more pronounced echoes as we approach the end
      // Higher mid frequencies = slightly more feedback for clarity
      const baseFeedback = 0.1 + (transitionProgress * 0.3); // 0.1 to 0.4
      const midInfluence = normalizedMid * 0.1; // Up to 0.1 additional feedback
      const feedback = baseFeedback + midInfluence;

      // 3. Wet/dry mix: increase wet signal as we approach the end
      // Higher frequencies = slightly more wet signal for sparkle
      const baseWetMix = 0.1 + (transitionProgress * 0.3); // 0.1 to 0.4
      const highInfluence = normalizedHigh * 0.1; // Up to 0.1 additional wet mix
      const wetMix = baseWetMix + highInfluence;
      const dryMix = 1 - (wetMix * 0.5); // Don't fully reduce dry signal

      // Apply parameters with smooth transitions to current song only
      this.currentDelayNode.delayTime.linearRampToValueAtTime(delayTime, now + 0.1);
      this.currentFeedbackGain.gain.linearRampToValueAtTime(feedback, now + 0.1);
      this.currentDelayMix.gain.linearRampToValueAtTime(wetMix, now + 0.1);
      this.currentDryMix.gain.linearRampToValueAtTime(dryMix, now + 0.1);
    }

    // Keep next song's delay effect disabled
    if (this.nextDelayNode && this.nextFeedbackGain && this.nextDelayMix && this.nextDryMix) {
      // Set delay mix to 0 for next song (no delay effect)
      this.nextDelayNode.delayTime.setValueAtTime(0.01, now);
      this.nextFeedbackGain.gain.setValueAtTime(0, now);
      this.nextDelayMix.gain.setValueAtTime(0, now);
      this.nextDryMix.gain.setValueAtTime(1, now);
    }
  }

  /**
   * Calculates the average energy in a specific frequency range
   * @param dataArray Frequency data array
   * @param minFreq Minimum frequency in Hz
   * @param maxFreq Maximum frequency in Hz
   * @returns Average energy value (0-255)
   */
  private calculateAverageEnergy(dataArray: Uint8Array, minFreq: number, maxFreq: number): number {
    if (!this.audioContext || !this.analyzer) return 0;

    const sampleRate = this.audioContext.sampleRate;
    const binCount = this.analyzer.frequencyBinCount;
    const frequencyResolution = sampleRate / (2 * binCount);

    const minBin = Math.floor(minFreq / frequencyResolution);
    const maxBin = Math.min(binCount - 1, Math.floor(maxFreq / frequencyResolution));

    let sum = 0;
    let count = 0;

    for (let i = minBin; i <= maxBin; i++) {
      sum += dataArray[i];
      count++;
    }

    return count > 0 ? sum / count : 0;
  }

  // Properties for drop detection
  private previousMidEnergy: number = 0;
  private previousHighEnergy: number = 0;
  private dropDetected: boolean = false;
  private dropEffectActive: boolean = false;
  private dropEffectStartTime: number = 0;
  private dropEffectDuration: number = 3; // Duration of drop effect in seconds
  private dropDetectionThreshold: number = 0.4; // Threshold for detecting drops (0-1)
  private dropCooldownTime: number = 10; // Minimum time between drops in seconds
  private lastDropTime: number = 0;
  private currentFilterNode: BiquadFilterNode | null = null;

  // AI-suggested filter nodes
  private aiSuggestedFilters: BiquadFilterNode[] = [];
  private lastAiAnalysisTime: number = 0;

  // Dynamic filter and effect storage
  private dynamicFilters: Array<{
    node: BiquadFilterNode,
    applyAt: number,
    duration: number,
    applied: boolean
  }> = [];

  // Flag to indicate if dynamic analysis is enabled
  private dynamicAnalysisEnabled: boolean = true;

  /**
   * Detects drops in the current song and enhances them with audio effects
   * Also uses AI to suggest appropriate filters based on audio analysis
   * Now includes dynamic filter analysis for more intelligent effects
   */
  private detectAndEnhanceDrops(): void {
    if (!this.audioContext || !this.currentAudioPlayer || !this.currentSourceNode) return;

    // Create analyzer if it doesn't exist
    if (!this.analyzer) {
      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 2048;
      this.currentSourceNode.connect(this.analyzer);
    }

    const now = this.audioContext.currentTime;
    const currentTime = this.currentAudioPlayer.currentTime;
    const songDuration = this.currentAudioPlayer.duration || 0;

    // Get frequency data for analysis
    const bufferLength = this.analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyzer.getByteFrequencyData(dataArray);

    // Calculate average energy in different frequency bands
    const bassEnergy = this.calculateAverageEnergy(dataArray, 20, 250);
    const midEnergy = this.calculateAverageEnergy(dataArray, 250, 2000);
    const highEnergy = this.calculateAverageEnergy(dataArray, 2000, 20000);

    // Normalize energy values (0-1)
    const normalizedBass = bassEnergy / 255;
    const normalizedMid = midEnergy / 255;
    const normalizedHigh = highEnergy / 255;

    // Calculate energy changes
    const bassDelta = normalizedBass - this.previousBassEnergy;
    const midDelta = normalizedMid - this.previousMidEnergy;
    const highDelta = normalizedHigh - this.previousHighEnergy;

    // Store current energy values for next comparison
    this.previousBassEnergy = normalizedBass;
    this.previousMidEnergy = normalizedMid;
    this.previousHighEnergy = normalizedHigh;

    // Process dynamic filters - check if any need to be applied or removed
    this.processDynamicFilters(now);

    // Use AI to suggest filters and effects based on audio analysis
    // Only perform analysis every few seconds to avoid excessive processing
    if (currentTime - this.lastAiAnalysisTime >= this.aiAnalysisInterval) {
      this.lastAiAnalysisTime = currentTime;

      // Get the current song's metadata
      const currentSong = this.songs.length > 0 ? this.songs[0] : null;

      // Extract genre from the song title or artists if available
      let genre: string | undefined = undefined;
      if (currentSong) {
        // Common genre keywords to look for in title or artist
        const genreKeywords = [
          'rock', 'pop', 'hip hop', 'rap', 'jazz', 'blues', 'country',
          'electronic', 'dance', 'edm', 'techno', 'house', 'trance',
          'ambient', 'folk', 'metal', 'classical', 'reggae', 'r&b', 'soul'
        ];

        const titleAndArtist = `${currentSong.title} ${currentSong.artists}`.toLowerCase();

        // Check if any genre keyword is in the title or artist
        for (const keyword of genreKeywords) {
          if (titleAndArtist.includes(keyword)) {
            genre = keyword;
            break;
          }
        }
      }

      if (this.dynamicAnalysisEnabled) {
        // Use the new dynamic analysis method
        this.applyDynamicFilters(dataArray, currentTime, songDuration, currentSong);
      } else {
        // Use the original static analysis method
        this.applyAiSuggestedFilters(dataArray);
      }
    }

    // Check if we're in cooldown period after a drop
    const timeSinceLastDrop = currentTime - this.lastDropTime;
    if (timeSinceLastDrop < this.dropCooldownTime) {
      // Still in cooldown, don't detect new drops

      // If drop effect is active, check if it should end
      if (this.dropEffectActive && (now - this.dropEffectStartTime) > this.dropEffectDuration) {
        this.endDropEffect();
      }

      return;
    }

    // Detect drops based on sudden increases in energy
    // A drop typically has a sudden increase in bass and overall energy
    const energyIncrease = bassDelta + midDelta + highDelta;
    const isSignificantBassIncrease = bassDelta > this.dropDetectionThreshold;
    const isHighOverallEnergy = normalizedBass > 0.7 || normalizedMid > 0.7;

    // Detect drop
    if (!this.dropDetected && isSignificantBassIncrease && isHighOverallEnergy && energyIncrease > this.dropDetectionThreshold) {
      console.log('Drop detected at', currentTime, 'seconds');
      this.dropDetected = true;
      this.lastDropTime = currentTime;

      // Apply drop effect
      this.applyDropEffect();
    } else if (this.dropDetected && bassDelta < -0.2) {
      // Reset drop detection when energy decreases significantly
      this.dropDetected = false;
    }

    // If drop effect is active, check if it should end
    if (this.dropEffectActive && (now - this.dropEffectStartTime) > this.dropEffectDuration) {
      this.endDropEffect();
    }
  }

  /**
   * Applies dynamic filters based on AI analysis of song progression
   * @param frequencyData Frequency data from the analyzer
   * @param currentTime Current playback time in seconds
   * @param songDuration Total song duration in seconds
   * @param currentSong Current song metadata
   */
  private applyDynamicFilters(
    frequencyData: Uint8Array,
    currentTime: number,
    songDuration: number,
    currentSong: Song | null
  ): void {
    if (!this.audioContext || !this.currentSourceNode) return;

    // Get dynamic filter and effect suggestions from AI
    const dynamicSuggestions = this.aiAudioProcessingService.analyzeSongDynamics(
      frequencyData,
      this.audioContext.sampleRate,
      currentTime,
      songDuration,
      currentSong ? {
        title: currentSong.title,
        artist: currentSong.artists,
        genre: currentSong.genre
      } : undefined
    );

    console.log('AI suggested dynamic filters:', dynamicSuggestions.filters);
    console.log('AI suggested dynamic effects:', dynamicSuggestions.effects);

    // Create and schedule dynamic filters
    for (const filterSuggestion of dynamicSuggestions.filters) {
      if (filterSuggestion.applyAt !== undefined && filterSuggestion.duration !== undefined) {
        // Create filter node
        const filterNode = this.audioContext.createBiquadFilter();
        filterNode.type = filterSuggestion.type;
        filterNode.frequency.value = filterSuggestion.frequency;
        filterNode.gain.value = 0; // Start with no effect

        if (filterSuggestion.Q !== undefined) {
          filterNode.Q.value = filterSuggestion.Q;
        }

        // Store the filter for later application
        this.dynamicFilters.push({
          node: filterNode,
          applyAt: filterSuggestion.applyAt,
          duration: filterSuggestion.duration,
          applied: false
        });

        console.log(`Scheduled dynamic filter to apply at ${filterSuggestion.applyAt.toFixed(2)}s for ${filterSuggestion.duration.toFixed(2)}s`);
      }
    }

    // Apply dynamic effects if we have the necessary nodes
    if (this.reverbGain && this.currentDelayNode && this.currentFeedbackGain &&
        this.currentDelayMix && this.currentDryMix) {

      const effects = dynamicSuggestions.effects;

      // If the effect has timing information, schedule it for later
      if (effects.applyAt !== undefined && effects.duration !== undefined) {
        // Schedule effect changes for later
        setTimeout(() => {
          // Apply reverb suggestion with smooth transition
          this.reverbGain!.gain.setValueAtTime(
            this.reverbGain!.gain.value,
            this.audioContext!.currentTime
          );
          this.reverbGain!.gain.linearRampToValueAtTime(
            effects.reverb,
            this.audioContext!.currentTime + 0.5
          );

          // Apply delay suggestions with smooth transition
          this.currentDelayNode!.delayTime.setValueAtTime(
            this.currentDelayNode!.delayTime.value,
            this.audioContext!.currentTime
          );
          this.currentDelayNode!.delayTime.linearRampToValueAtTime(
            effects.delayTime,
            this.audioContext!.currentTime + 0.5
          );

          this.currentFeedbackGain!.gain.setValueAtTime(
            this.currentFeedbackGain!.gain.value,
            this.audioContext!.currentTime
          );
          this.currentFeedbackGain!.gain.linearRampToValueAtTime(
            effects.feedback,
            this.audioContext!.currentTime + 0.5
          );

          this.currentDelayMix!.gain.setValueAtTime(
            this.currentDelayMix!.gain.value,
            this.audioContext!.currentTime
          );
          this.currentDelayMix!.gain.linearRampToValueAtTime(
            effects.delay,
            this.audioContext!.currentTime + 0.5
          );

          console.log('Applied dynamic effects');

          // Schedule removal of effects
          setTimeout(() => {
            // Gradually return to default values
            this.reverbGain!.gain.linearRampToValueAtTime(
              0.2, // Default reverb value
              this.audioContext!.currentTime + 1
            );

            this.currentDelayMix!.gain.linearRampToValueAtTime(
              0.1, // Default delay value
              this.audioContext!.currentTime + 1
            );

            console.log('Removed dynamic effects');
          }, (effects.duration || 0) * 1000);
        }, Math.max(0, (effects.applyAt - currentTime) * 1000));

        console.log(`Scheduled dynamic effects to apply at ${effects.applyAt.toFixed(2)}s for ${effects.duration.toFixed(2)}s`);
      } else {
        // Apply effects immediately
        this.reverbGain.gain.setValueAtTime(
          this.reverbGain.gain.value,
          this.audioContext.currentTime
        );
        this.reverbGain.gain.linearRampToValueAtTime(
          effects.reverb,
          this.audioContext.currentTime + 1
        );

        this.currentDelayNode.delayTime.setValueAtTime(
          this.currentDelayNode.delayTime.value,
          this.audioContext.currentTime
        );
        this.currentDelayNode.delayTime.linearRampToValueAtTime(
          effects.delayTime,
          this.audioContext.currentTime + 1
        );

        this.currentFeedbackGain.gain.setValueAtTime(
          this.currentFeedbackGain.gain.value,
          this.audioContext.currentTime
        );
        this.currentFeedbackGain.gain.linearRampToValueAtTime(
          effects.feedback,
          this.audioContext.currentTime + 1
        );

        this.currentDelayMix.gain.setValueAtTime(
          this.currentDelayMix.gain.value,
          this.audioContext.currentTime
        );
        this.currentDelayMix.gain.linearRampToValueAtTime(
          effects.delay,
          this.audioContext.currentTime + 1
        );

        console.log('Applied AI-suggested effects immediately');
      }
    }
  }

  /**
   * Processes dynamic filters, applying or removing them as needed
   * @param now Current audio context time
   */
  private processDynamicFilters(now: number): void {
    if (!this.audioContext || !this.currentSourceNode) return;

    const currentTime = this.currentAudioPlayer?.currentTime || 0;

    // Process each dynamic filter
    for (let i = this.dynamicFilters.length - 1; i >= 0; i--) {
      const filter = this.dynamicFilters[i];

      // Check if it's time to apply the filter
      if (!filter.applied && currentTime >= filter.applyAt) {
        // Connect the filter to the audio graph
        this.currentSourceNode.disconnect();
        this.currentSourceNode.connect(filter.node);

        // Connect to the destination (or next node in the chain)
        if (this.gainNode) {
          filter.node.connect(this.gainNode);
        } else {
          filter.node.connect(this.audioContext.destination);
        }

        // Gradually apply the filter effect
        filter.node.gain.setValueAtTime(0, now);
        filter.node.gain.linearRampToValueAtTime(filter.node.gain.value, now + 0.5);

        // Mark as applied
        filter.applied = true;

        console.log(`Applied dynamic filter at ${currentTime.toFixed(2)}s`);

        // Schedule removal of the filter
        setTimeout(() => {
          if (this.audioContext && filter.node) {
            // Gradually remove the filter effect
            filter.node.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.5);

            // After fade-out, disconnect and remove the filter
            setTimeout(() => {
              if (this.currentSourceNode && this.gainNode && filter.node) {
                // Reconnect the source directly to the destination
                this.currentSourceNode.disconnect(filter.node);
                filter.node.disconnect(this.gainNode);
                this.currentSourceNode.connect(this.gainNode);

                // Remove from the array
                const index = this.dynamicFilters.indexOf(filter);
                if (index !== -1) {
                  this.dynamicFilters.splice(index, 1);
                }

                console.log(`Removed dynamic filter at ${this.currentAudioPlayer?.currentTime.toFixed(2)}s`);
              }
            }, 500); // Wait for fade-out to complete
          }
        }, filter.duration * 1000);
      }

      // Check if the filter should be removed (expired)
      else if (filter.applied && currentTime >= filter.applyAt + filter.duration + 0.5) {
        // Filter has expired and fade-out should be complete, remove it if it's still in the array
        const index = this.dynamicFilters.indexOf(filter);
        if (index !== -1) {
          this.dynamicFilters.splice(index, 1);
        }
      }
    }
  }

  /**
   * Uses AI to suggest and apply filters based on audio analysis
   * @param frequencyData Frequency data from the analyzer
   */
  async applyAiSuggestedFilters(frequencyData: Uint8Array) {
    // Convert Uint8Array to Float32Array
    const floatFrequencyData = new Float32Array(frequencyData.length);
    for (let i = 0; i < frequencyData.length; i++) {
      floatFrequencyData[i] = frequencyData[i];
    }

    // Await AI suggestions
    const suggestions = await this.aiAudioProcessingService.analyzeAndSuggestFilters(
      floatFrequencyData,
      this.audioContext?.sampleRate || 44100,
      this.songs.length > 0 ? {
        title: this.songs[0].title,
        artist: this.songs[0].artists,
        genre: this.songs[0].genre
      } : undefined
    );

    this.lastAiAnalysisTime = Date.now();

    console.log('AI suggested filters:', suggestions.filters);
    console.log('AI suggested effects:', suggestions.effects);

    // Remove any existing AI-suggested filters
    for (const filter of this.aiSuggestedFilters) {
      filter.disconnect();
    }
    this.aiSuggestedFilters = [];

    // Create and apply new filters based on AI suggestions
    if (suggestions.filters.length > 0) {
      if (!this.currentSourceNode) return;
      let lastNode: AudioNode = this.currentSourceNode;
      for (const filterSuggestion of suggestions.filters) {
        const filterNode = this.audioContext?.createBiquadFilter();
        if (!filterNode) return;
        filterNode.type = filterSuggestion.type;
        filterNode.frequency.value = filterSuggestion.frequency;
        filterNode.gain.value = filterSuggestion.gain;
        if (filterSuggestion.Q !== undefined) {
          filterNode.Q.value = filterSuggestion.Q;
        }
        lastNode.disconnect();
        lastNode.connect(filterNode);
        lastNode = filterNode;
        this.aiSuggestedFilters.push(filterNode);
      }
      if (this.gainNode) {
        lastNode.connect(this.gainNode);
      }
      console.log(`Applied ${suggestions.filters.length} AI-suggested filters`);
    }

    // Apply suggested effects if we have the necessary nodes
    if (this.reverbGain && this.currentDelayNode && this.currentFeedbackGain &&
        this.currentDelayMix && this.currentDryMix) {
      this.reverbGain.gain.setValueAtTime(
        this.reverbGain.gain.value,
        this.audioContext?.currentTime || 0
      );
      this.reverbGain.gain.linearRampToValueAtTime(
        suggestions.effects.reverb,
(this.audioContext?.currentTime || 0) + 1
      );
      this.currentDelayNode.delayTime.setValueAtTime(
        this.currentDelayNode.delayTime.value,
        this.audioContext?.currentTime || 0
      );
      this.currentDelayNode.delayTime.linearRampToValueAtTime(
        suggestions.effects.delayTime,
        (this.audioContext?.currentTime || 0) + 1
      );
      this.currentFeedbackGain.gain.setValueAtTime(
        this.currentFeedbackGain.gain.value,
this.audioContext?.currentTime || 0
      );
      this.currentFeedbackGain.gain.linearRampToValueAtTime(
        suggestions.effects.feedback,
(this.audioContext ? this.audioContext.currentTime : 0) + 1
      );
      this.currentDelayMix.gain.setValueAtTime(
        this.currentDelayMix.gain.value,
this.audioContext?.currentTime || 0
      );
      this.currentDelayMix.gain.linearRampToValueAtTime(
        suggestions.effects.delay,
        (this.audioContext ? this.audioContext.currentTime : 0) + 1
      );
      console.log('Applied AI-suggested effects');
    }
  }


  /**
   * Provides feedback to the AI about the quality of its suggestions
   * @param rating User rating from 1-5
   * @param adjustments Any manual adjustments made to the filters/effects
   */
  public provideAiFeedback(rating: number, adjustments?: {
    filters?: Array<{
      type: BiquadFilterType;
      frequency: number;
      gain: number;
      Q?: number;
    }>;
    effects?: {
      reverb?: number;
      delay?: number;
      delayTime?: number;
      feedback?: number;
    };
  }): void {
    // Find the timestamp of the last analysis
    const lastAnalysisTime = this.lastAiAnalysisTime;

    if (lastAnalysisTime > 0) {
      // Provide feedback to the AI service
      this.aiAudioProcessingService.provideFeedback(
        lastAnalysisTime,
        rating,
        adjustments
      );

      console.log(`Provided AI feedback with rating: ${rating}`);
    } else {
      console.warn('No recent AI analysis found to provide feedback for');
    }
  }

  /**
   * Applies audio effects to enhance a drop
   */
  private applyDropEffect(): void {
    if (!this.audioContext || !this.currentDelayNode || !this.currentFeedbackGain ||
        !this.currentDelayMix || !this.currentDryMix || !this.reverbGain || !this.dryGain) {
      return;
    }

    console.log('Applying drop effect');
    this.dropEffectActive = true;
    this.dropEffectStartTime = this.audioContext.currentTime;
    const now = this.dropEffectStartTime;

    // 1. Increase reverb for a more spacious sound during the drop
    this.reverbGain.gain.setValueAtTime(this.reverbGain.gain.value, now);
    this.reverbGain.gain.linearRampToValueAtTime(0.5, now + 0.1); // Increase reverb

    this.dryGain.gain.setValueAtTime(this.dryGain.gain.value, now);
    this.dryGain.gain.linearRampToValueAtTime(0.8, now + 0.1); // Keep dry signal strong

    // 2. Add delay effect with rhythmic timing
    this.currentDelayNode.delayTime.setValueAtTime(this.currentDelayNode.delayTime.value, now);
    this.currentDelayNode.delayTime.linearRampToValueAtTime(0.25, now + 0.1); // 1/16th note at 120bpm

    this.currentFeedbackGain.gain.setValueAtTime(this.currentFeedbackGain.gain.value, now);
    this.currentFeedbackGain.gain.linearRampToValueAtTime(0.4, now + 0.1); // Moderate feedback

    this.currentDelayMix.gain.setValueAtTime(this.currentDelayMix.gain.value, now);
    this.currentDelayMix.gain.linearRampToValueAtTime(0.4, now + 0.1); // Moderate delay mix

    this.currentDryMix.gain.setValueAtTime(this.currentDryMix.gain.value, now);
    this.currentDryMix.gain.linearRampToValueAtTime(0.9, now + 0.1); // Keep dry signal strong

    // 3. Create a filter sweep effect if we have a filter node
    if (this.currentFilterNode) {
      // Start with a low frequency and sweep up
      this.currentFilterNode.frequency.setValueAtTime(200, now);
      this.currentFilterNode.frequency.exponentialRampToValueAtTime(8000, now + 0.5);
      this.currentFilterNode.frequency.exponentialRampToValueAtTime(2000, now + 1.5);

      // Increase resonance for more dramatic effect
      this.currentFilterNode.Q.setValueAtTime(1, now);
      this.currentFilterNode.Q.linearRampToValueAtTime(8, now + 0.5);
      this.currentFilterNode.Q.linearRampToValueAtTime(1, now + 1.5);
    }
  }

  /**
   * Ends the drop effect by returning audio parameters to normal
   */
  private endDropEffect(): void {
    if (!this.audioContext || !this.currentDelayNode || !this.currentFeedbackGain ||
        !this.currentDelayMix || !this.currentDryMix || !this.reverbGain || !this.dryGain) {
      return;
    }

    console.log('Ending drop effect');
    this.dropEffectActive = false;
    const now = this.audioContext.currentTime;

    // Return reverb to normal
    this.reverbGain.gain.linearRampToValueAtTime(0.3, now + 0.5);
    this.dryGain.gain.linearRampToValueAtTime(0.7, now + 0.5);

    // Return delay effect to normal
    this.currentDelayNode.delayTime.linearRampToValueAtTime(0.2, now + 0.5);
    this.currentFeedbackGain.gain.linearRampToValueAtTime(0.1, now + 0.5);
    this.currentDelayMix.gain.linearRampToValueAtTime(0.1, now + 0.5);
    this.currentDryMix.gain.linearRampToValueAtTime(1, now + 0.5);

    // Return filter to normal if it exists
    if (this.currentFilterNode) {
      this.currentFilterNode.frequency.linearRampToValueAtTime(20000, now + 0.5); // Open filter
      this.currentFilterNode.Q.linearRampToValueAtTime(1, now + 0.5); // Normal resonance
    }
  }

  /**
   * Decodes a URL string with character encoding detection
   * @param url The URL to decode
   * @returns The decoded URL string
   */
  private decodeUrlWithEncodingDetection(url: string): string {
    try {
      // Try to detect the character encoding
      const detection = jschardet.detect(url);

      // If encoding is detected with high confidence, use it
      if (detection && detection.confidence > 0.8) {
        console.log(`Detected encoding: ${detection.encoding} with confidence: ${detection.confidence}`);

        // For UTF-8 and ASCII, decodeURIComponent works well
        if (detection.encoding === 'utf-8' || detection.encoding === 'ascii') {
          return decodeURIComponent(url);
        }

        // For other encodings, we could use more specialized decoding
        // but for now we'll fall back to the default
        console.log(`Using default decoding for ${detection.encoding}`);
      }

      // Fall back to default decoding
      return decodeURIComponent(url);
    } catch (error) {
      console.error('Error decoding URL with encoding detection:', error);
      // If there's an error, fall back to the default decoding
      try {
        return decodeURIComponent(url);
      } catch (e) {
        console.error('Error with default decoding, returning original URL:', e);
        return url;
      }
    }
  }

  private populateSongsFromUrls(playlistArtist: string = 'Biblioteca local'): void {
    // Randomize the songList array
    const shuffledSongList = [...this.songList].sort(() => Math.random() - 0.5);

    // Create songs with default values first
    const initialSongs = shuffledSongList.map(songUpload => {
      // Set placeholder values until metadata is loaded
      const duration = '--:--';
      const totalDurationSeconds = 0;
      const currentTime = '0:00';
      const coverUrl = this.localCoverUrl;
      const waveformData = Array(100).fill(0).map(() => Math.floor(Math.random() * 100));

      return {
        title: 'Loading...',
        artists: playlistArtist,
        composer: '',
        duration,
        currentTime,
        coverUrl,
        waveformData,
        songUrl: songUpload.url,
        isPlaying: false,
        progress: 0,
        durationSeconds: totalDurationSeconds
      };
    });

    // Set initial songs with title from filename for instant display
    this.songs = initialSongs.map((song, idx) => {
      const url = shuffledSongList[idx].url;
      const decodedUrl = this.decodeUrlWithEncodingDetection(url);
      const filename = decodedUrl.split('/').pop() || '';
      const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
      // Try to get duration quickly from audio element
      let duration = '--:--';
      let durationSeconds = 0;
      const tempAudio = new Audio(url);
      tempAudio.addEventListener('loadedmetadata', () => {
        if (tempAudio.duration && !isNaN(tempAudio.duration) && isFinite(tempAudio.duration)) {
          const totalSeconds = Math.floor(tempAudio.duration);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          this.songs[idx].duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          this.songs[idx].durationSeconds = totalSeconds;
        }
      });
      return {
        ...song,
        title: nameWithoutExt,
        duration,
        durationSeconds
      };
    });

    // Load metadata for each song
    shuffledSongList.forEach((songUpload, index) => {
      // Extract metadata using the metadata service
      this.metadataService.extractMetadata(songUpload.url).subscribe(
        metadata => {
          // Update song with extracted metadata
          if (index < this.songs.length) {
            // Keep existing values for properties not in metadata
            const updatedSong = { ...this.songs[index] };

            // Update with metadata values (prefer the file's own ID3 tags)
            updatedSong.title = metadata.title || updatedSong.title;
            updatedSong.artists = metadata.artists || metadata.artist || playlistArtist;
            updatedSong.composer = metadata.composer || '';

            // Album art comes only from the file's embedded picture (no external APIs)
            if (metadata.picture) {
              updatedSong.coverUrl = metadata.picture;
            }

            // Update the song in the array
            this.songs[index] = updatedSong;
          }
        },
        error => {
          console.error('Error extracting metadata:', error);

          // If metadata extraction fails, fall back to filename parsing
          if (index < this.songs.length) {
            // Extract basic metadata from filename
            const decodedUrl = this.decodeUrlWithEncodingDetection(songUpload.url);
            const filename = decodedUrl.split('/').pop() || '';
            const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

            let title = 'Unknown Title';
            let artists = '';

            // Check if the filename has the format "Title - Artist"
            const dashParts = nameWithoutExt.split(' - ');
            if (dashParts.length > 1) {
              title = dashParts[0];
              artists = playlistArtist; // Always use playlist artist
            } else {
              // Check for artist names in parentheses
              const parenthesesMatch = nameWithoutExt.match(/\((.*?)\)/);
              if (parenthesesMatch) {
                const parenthesesContent = parenthesesMatch[1];
                const nonArtistTerms = ['original', 'extended', 'remix', 'mix', 'version', 'edit'];
                const isLikelyArtist = !nonArtistTerms.some(term =>
                  parenthesesContent.toLowerCase().includes(term.toLowerCase()));

                if (isLikelyArtist) {
                  title = nameWithoutExt.replace(/\(.*?\)/, '').trim();
                  artists = playlistArtist;
                } else {
                  title = nameWithoutExt;
                  // Use playlist artist
                  artists = playlistArtist;
                }
              } else {
                title = nameWithoutExt;
                artists = playlistArtist;
              }
            }

            // Update the song with the extracted metadata
            this.songs[index].title = title;
            this.songs[index].artists = artists;
          }
        }
      );
    });
  }

  private getHowlerEndedListener(): () => void {
    return () => {
      console.log('Howler song ended event triggered');

      if (!this.transitionStarted && this.songs.length > 1) {
        console.log('Starting DJ transition on song end (Howler)');
        this.startDjTransition();
      } else if (!this.transitionStarted) {
        const currentSong = this.songs[0];
        if (currentSong) {
          currentSong.isPlaying = false;
          currentSong.currentTime = '0:00';
          currentSong.progress = 0;
        }
      }
    };
  }

  /**
   * Initializes audio playback using Howler.js for enhanced quality and smoother transitions
   * @returns True if initialization was successful, false otherwise
   */
  private initializeWithHowler(): boolean {
    try {
      if (this.songs.length === 0) return false;

      // Ensure HTML5 audio pipeline is fully torn down before using Howler
      this.teardownHtmlAudio();

      const firstSong = this.songs[0];

      // Set up the transition complete callback
      this.howlerAudioService.setOnTransitionComplete(() => {
        console.log('Howler transition completed, moving to next song');
        this.moveToNextSong();
      });

      // Create a current song ended listener
      const currentSongEndedListener = () => {
        console.log('Howler song ended event triggered');

        // Only handle the ended event if we haven't already started a transition
        if (!this.transitionStarted && this.songs.length > 1) {
          console.log('Starting DJ transition on song end (Howler)');
          this.startDjTransition();
        } else if (!this.transitionStarted) {
          // If there's no next song, just reset the current song
          firstSong.isPlaying = false;
          firstSong.currentTime = '0:00';
          firstSong.progress = 0;
        }
      };

      // Load and play the first song with Howler
      const currentSound = this.howlerAudioService.loadAndPlay(
        firstSong.songUrl,
        currentSongEndedListener,
        () => {
          console.log(`Howler loaded first song: "${firstSong.title}"`);
          firstSong.isPlaying = true;

          // Iniciar análisis AI periódico
          this.aiAnalysisInterval = setInterval(() => this.analyzeAndApplyAIEffects(), 5000);

          // Update progress periodically
          const updateProgress = () => {
            if (this.howlerAudioService.getCurrentSound()) {
              const sound = this.howlerAudioService.getCurrentSound()!;
              const currentTime = sound.seek() as number;
              const duration = sound.duration();

              if (currentTime && duration) {
                // Calculate progress percentage
                const progress = (currentTime / duration) * 100;

                // Format current time as mm:ss
                const minutes = Math.floor(currentTime / 60);
                const seconds = Math.floor(currentTime % 60);
                const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                // Update song properties
                firstSong.currentTime = formattedTime;
                firstSong.progress = progress;

                // Check if we need to start DJ transition (20 seconds before end)
                const remainingTime = duration - currentTime;
                if (remainingTime <= 20 && !this.transitionStarted && this.songs.length > 1) {
                  console.log(`Starting DJ transition with ${remainingTime.toFixed(1)} seconds remaining (Howler)`);
                  this.startDjTransition();
                  
                  // Fallback timer in case transition doesn't start properly
                  setTimeout(() => {
                    if (!this.transitionStarted) {
                      console.log('Fallback: Moving to next song after timeout (Howler)');
                      this.moveToNextSong();
                    }
                  }, (remainingTime + 2) * 1000);
                }
              }

              // Continue updating if the song is playing
              if (sound.playing()) {
                requestAnimationFrame(updateProgress);
              }
            }
          };

          // Start updating progress
          updateProgress();
        }
      );

      // Preload the next song if available
      if (this.songs.length > 1) {
        const nextSong = this.songs[1];

        this.howlerAudioService.preloadNext(
          nextSong.songUrl,
          () => {
            console.log(`Next song ended: "${nextSong.title}"`);
            this.getHowlerEndedListener()();
          },
          () => {
            console.log(`Preloaded next song: "${nextSong.title}"`);
          }
        );
      }

      return true;
    } catch (error) {
      console.error('Error initializing with Howler:', error);
      return false;
    }
  }

  private async analyzeAndApplyAIEffects() {
    const sound = this.howlerAudioService.getCurrentSound();
    if (!sound || !this.audioContext) return;

    // Access the underlying HTMLAudioElement from Howler.js
    const audioElement = (sound as any)._sounds?.[0]?._node as HTMLAudioElement;
    if (!audioElement) return;

    try {
      // Create a new MediaElementAudioSourceNode using the component's AudioContext
      const sourceNode = this.audioContext.createMediaElementSource(audioElement);

      // Create and configure the AnalyserNode
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 2048;

      // Connect the source to the analyser, then to the destination
      sourceNode.connect(analyser);
      analyser.connect(this.audioContext.destination); // Or connect to your master gain

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);
      analyser.getFloatTimeDomainData(dataArray);

      const suggestions = await this.aiAudioProcessingService.analyzeAndSuggestFilters(dataArray, this.audioContext.sampleRate);

      // Apply effects using methods from the service
      if (suggestions.effects.reverb > 0) {
        this.howlerAudioService.applyReverb(suggestions.effects.reverb);
        console.log('Aplicando modo espacial con reverb:', suggestions.effects.reverb);
      }
      if (suggestions.effects.delay > 0) {
        this.howlerAudioService.applyDelay(suggestions.effects.delay);
        console.log('Aplicando eco con delay:', suggestions.effects.delay);
      }
      if ('spatial3D' in suggestions.effects && suggestions.effects.spatial3D) {
        this.howlerAudioService.apply3DPanner();
        console.log('Aplicando modo 3D');
      }

      // Disconnect the analyser after use to prevent memory leaks
      analyser.disconnect();
      sourceNode.disconnect();

    } catch (error) {
      console.error('Error connecting audio nodes:', error);
    }
  }

  /**
   * Runs the full DJ analysis for a song (BPM + beatgrid, musical key,
   * energy, structure, loudness) off the main thread and stores the result
   * on the Song object. Replaces the old MediaRecorder-based BPM detection.
   */
  private analyzeSong(song: Song): void {
    if (!song.songUrl || song.analysis) return;
    this.trackAnalysisService.analyze(song.songUrl)
      .then(analysis => {
        song.analysis = analysis;
        if (analysis.bpm > 0) song.bpm = Math.round(analysis.bpm * 10) / 10;
        // Only claim a key when the chroma correlation is decisive enough;
        // a low-confidence guess would mislead the harmonic selection
        if (analysis.camelot && analysis.keyConfidence >= 0.05) {
          song.camelot = analysis.camelot;
          song.keyName = analysis.keyName;
        }
        song.energy = Math.round(analysis.energy * 100) / 100;
        if (!song.durationSeconds && isFinite(analysis.duration) && analysis.duration > 0) {
          const totalSeconds = Math.floor(analysis.duration);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          song.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          song.durationSeconds = totalSeconds;
        }
        console.log(
          `DJ analysis "${song.title}": ${song.bpm} BPM, key ${analysis.camelot || '?'} ` +
          `(${analysis.keyName || '?'}), energy ${(analysis.energy * 100).toFixed(0)}%, ` +
          `outro @${analysis.outroStart.toFixed(1)}s, mix-in @${analysis.mixInPoint.toFixed(1)}s`
        );
      })
      .catch(err => {
        console.warn(`Track analysis failed for "${song.title}":`, err);
        if (!song.bpm) song.bpm = 128;
      });
  }

  /**
   * Analyzes the emotion of a song and applies appropriate effects like a professional DJ
   * @param song The song to analyze and apply effects to
   */
  private async analyzeAndApplyEmotionEffects(song: Song): Promise<void> {
    try {
      console.log(`Analyzing emotion for "${song.title}" by ${song.artists}...`);
      
      // Create mock audio data for emotion analysis
      const mockAudioData = {
        tempo: song.bpm || 120,
        energy: 0.7, // Default energy level
        frequencyData: new Uint8Array(1024).fill(128), // Mock frequency data
        spectralCentroid: 1000,
        spectralRolloff: 5000,
        zeroCrossingRate: 0.1
      };
      
      // Analyze the emotion of the song
      const emotionResult = this.emotionAnalysisService.analyzeEmotion(
        mockAudioData,
        {
          title: song.title,
          artist: song.artists,
          genre: song.genre || 'unknown'
        }
      );
      
      console.log(`Detected emotion: ${emotionResult.primaryEmotion} (${(emotionResult.confidence * 100).toFixed(1)}% confidence)`);
      console.log(`Secondary emotion: ${emotionResult.secondaryEmotion}`);
      console.log(`Mood: ${emotionResult.characteristics.mood}`);
      console.log(`Energy level: ${emotionResult.characteristics.energy}`);
      
      // Apply emotion-based effects using the emotion analysis service
      if (this.audioContext && this.gainNode) {
        const effectNodes = this.emotionAnalysisService.applyEmotionEffects(
          this.audioContext,
          this.gainNode,
          emotionResult.primaryEmotion,
          emotionResult.intensity
        );
        console.log(`Applied ${effectNodes.length} emotion-based effect nodes`);
      }
      
      // Also use the existing AI audio processing service for additional enhancements
      if (this.aiAudioProcessingService) {
        // Apply AI mix transitions based on the detected emotion
        if (this.audioContext && this.gainNode) {
          this.aiAudioProcessingService.applyAIMixTransition(
            this.gainNode,
            this.gainNode, // Using same node as placeholder
            this.audioContext,
            2.0 // 2 second transition duration
          );
        }
      }

      // Apply a timed FX plan on the inserted FX Router based on emotion (audible)
      if (this.audioContext && this.fxRouter) {
        const bpm = song.bpm || 120;
        try { this.fxRouter.setDelayTempo(bpm, 4); } catch {}
        const plan = {
          reverb: Math.min(0.6, Math.max(0, (emotionResult as any).suggestedEffects?.reverb ?? 0.2)),
          delay: Math.min(0.5, Math.max(0, (emotionResult as any).suggestedEffects?.delay ?? 0.15)),
          delayTime: 60 / bpm / 4,
          feedback: 0.25,
          applyAt: this.audioContext.currentTime + 0.2,
          duration: 3.0
        };
        try { this.aiAudioProcessingService.applyPlannedEffects(this.audioContext, this.fxRouter, plan, bpm); } catch {}
        // Add a quick reverb duck for punch moments
        try { setTimeout(() => this.fxRouter?.pulseReverbDuck(-10, 0.2), 250); } catch {}
        console.log('Emotion FX plan applied on FX Router with BPM sync');
      }

      // === NUEVO: arrancar scheduler de FX divertidos beat-synced ===
      if (this.audioContext && this.gainNode) {
        if (this.stopFunFxScheduler) {
          try { this.stopFunFxScheduler(); } catch {}
          this.stopFunFxScheduler = undefined;
        }

        const bpm = song.bpm || 120;
        const pullContext = () => {
          const energy = emotionResult.characteristics.energy ?? 0.6;
          const arousal = emotionResult.characteristics.arousal ?? 0.6;
          let phase: 'build-up' | 'drop' | 'breakdown' | 'transition' | 'steady' = 'steady';
          if (arousal > 0.8) phase = 'build-up';
          if (energy > 0.8) phase = 'drop';
          return { phase, energy, valence: emotionResult.characteristics.valence, arousal };
        };
        const reverbBus = this.reverbNode || undefined;
        this.stopFunFxScheduler = this.aiAudioProcessingService.startBeatSyncedFunFxScheduler({
          audioContext: this.audioContext,
          masterNode: this.gainNode,
          bpm,
          reverbBus,
          pullContext
        });
      }
      // === FIN NUEVO ===
      
      console.log(`Applied emotion-based effects for "${song.title}" - DJ enhancement complete`);
      
    } catch (error) {
      console.error('Error analyzing emotion or applying effects:', error);
      // Fallback to default effects if emotion analysis fails
      console.log('Applying default DJ effects as fallback');
    }
  }

  /**
   * Sistema de análisis de energía en tiempo real
   */
  private startRealTimeAnalysis(): void {
    if (!this.audioContext) return;

    // Reuse existing analyzer if already created
    if (!this.analyzer) {
      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 2048;

      // Tap current source (HTML5 pipeline) if present
      try {
        if (this.currentSourceNode) {
          this.currentSourceNode.connect(this.analyzer);
        }
      } catch {}
    }

    const analyser = this.analyzer;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const analyze = () => {
      analyser.getByteFrequencyData(dataArray);

      // Detectar drops, builds, breakdowns
      const energyProfile = this.calculateEnergyProfile(dataArray);
      const currentTime = this.howlerAudioService.getCurrentPosition();

      // Predecir y aplicar efectos automáticamente
      this.predictAndApplyEffects(energyProfile, currentTime);

      requestAnimationFrame(analyze);
    };

    analyze();
  }

  private calculateEnergyProfile(frequencyData: Uint8Array): {
    bass: number,
    mid: number,
    treble: number,
    overall: number,
    trend: 'building' | 'dropping' | 'stable'
  } {
    const bassEnd = Math.floor(frequencyData.length * 0.1);
    const midEnd = Math.floor(frequencyData.length * 0.5);
    
    let bassEnergy = 0, midEnergy = 0, trebleEnergy = 0;
    
    for (let i = 0; i < bassEnd; i++) {
      bassEnergy += frequencyData[i];
    }
    for (let i = bassEnd; i < midEnd; i++) {
      midEnergy += frequencyData[i];
    }
    for (let i = midEnd; i < frequencyData.length; i++) {
      trebleEnergy += frequencyData[i];
    }
    
    bassEnergy /= bassEnd;
    midEnergy /= (midEnd - bassEnd);
    trebleEnergy /= (frequencyData.length - midEnd);
    
    const overall = (bassEnergy + midEnergy + trebleEnergy) / 3;
    
    // Detectar tendencia
    const trend = this.detectEnergyTrend(overall);
    
    return { bass: bassEnergy, mid: midEnergy, treble: trebleEnergy, overall, trend };
  }

  private detectEnergyTrend(currentEnergy: number): 'building' | 'dropping' | 'stable' {
    // Simple trend detection logic - can be enhanced with more sophisticated algorithms
    if (!this.previousBassEnergy) {
      this.previousBassEnergy = currentEnergy;
      return 'stable';
    }
    
    const energyDiff = currentEnergy - this.previousBassEnergy;
    this.previousBassEnergy = currentEnergy;
    
    if (energyDiff > 10) return 'building';
    if (energyDiff < -10) return 'dropping';
    return 'stable';
  }

  private predictAndApplyEffects(energyProfile: any, currentTime: number): void {
    const currentSong = this.songs[0];
    if (!currentSong) return;
    
    // Detectar secciones de la canción
    const songProgress = currentTime / (currentSong.durationSeconds || 180);
    
    let effects: any = {};
    
    // Intro (0-15%)
    if (songProgress < 0.15) {
      effects = {
        reverb: 0.3,
        delay: 0.2,
        eq: { bass: 0, mid: 1, treble: 2 }
      };
    }
    // Build-up detectado
    else if (energyProfile.trend === 'building') {
      effects = {
        delay: 0.4,
        phaser: 0.3,
        eq: { bass: 2, mid: 3, treble: 4 }
      };
    }
    // Drop detectado
    else if (energyProfile.trend === 'dropping' && energyProfile.overall > 150) {
      effects = {
        distortion: 0.1,
        reverb: 0.1,
        eq: { bass: 5, mid: 2, treble: 3 }
      };
    }
    // Breakdown/Outro
    else if (songProgress > 0.8) {
      effects = {
        reverb: 0.5,
        delay: 0.3,
        chorus: 0.4,
        eq: { bass: -1, mid: 0, treble: 1 }
      };
    }
    
    // Aplicar efectos si hay cambios significativos
    if (Object.keys(effects).length > 0) {
      this.howlerAudioService.applyAIEffectChain(effects);
    }
  }

  // === DJ Controls helpers and triggers ===
  private getModeFactor(): number {
    switch (this.djMode) {
      case 'suave': return 0.7;
      case 'intenso': return 1.3;
      default: return 1.0;
    }
  }

  private applyFxPlanScaled(plan: {
    reverb: number,
    delay: number,
    delayTime: number,
    feedback: number,
    applyAt?: number,
    duration?: number
  }, bpm: number) {
    if (!this.audioContext || !this.fxRouter) return;
    const factor = Math.min(1.5, Math.max(0.3, this.fxIntensity * this.getModeFactor()));

    const scaled = {
      ...plan,
      reverb: Math.max(0, Math.min(0.8, plan.reverb * factor)),
      delay: Math.max(0, Math.min(0.7, plan.delay * factor)),
      feedback: Math.max(0.05, Math.min(0.5, plan.feedback * (0.8 + (factor - 1) * 0.5))),
      duration: plan.duration ? Math.max(0.8, Math.min(6.0, plan.duration * (0.9 + (factor - 1) * 0.4))) : undefined
    };

    this.aiAudioProcessingService.applyPlannedEffects(this.audioContext, this.fxRouter, scaled, bpm);
  }

  triggerFilterSweep(beats: number = 4, open: boolean = true) {
    if (!this.audioContext || !this.fxRouter) return;
    const bpm = this.songs[0]?.bpm || 120;
    const spb = 60 / Math.max(1, bpm);
    const duration = beats * spb;

    const start = this.audioContext.currentTime + 0.05;
    const end = start + duration;
    const filter = this.fxRouter.insertFilter;

    filter.type = 'lowpass';
    filter.Q.setValueAtTime(0.9, start);
    filter.frequency.setValueAtTime(open ? 400 : 12000, start);
    filter.frequency.linearRampToValueAtTime(open ? 12000 : 400, end);
  }

  triggerDelayFill(subdivision: 2 | 4 | 8 = 8, beats: number = 2) {
    if (!this.audioContext || !this.fxRouter) return;
    const bpm = this.songs[0]?.bpm || 120;
    this.fxRouter.setDelayTempo(bpm, subdivision);
    const start = this.audioContext.currentTime + 0.05;
    const duration = beats * (60 / Math.max(1, bpm));
    const end = start + duration;

    this.fxRouter.setDelayWet(0.3 * this.fxIntensity, start, end);
    this.fxRouter.setDelayFeedback(0.3, start);
  }

  triggerDropPunch() {
    if (!this.audioContext || !this.fxRouter) return;
    this.fxRouter.pulseReverbDuck(-12, 0.2);
  }

  ngOnDestroy(): void {
    // Remove document visibility handler
    try {
      if (this.visibilityHandler) {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
      }
    } catch {}

    // Remove window resize listener for background waves
    try {
      if (this.waveResizeHandler) {
        window.removeEventListener('resize', this.waveResizeHandler);
      }
    } catch {}

    // Cancel background animation frame
    try {
      if (this.waveRafId !== null) {
        cancelAnimationFrame(this.waveRafId);
        this.waveRafId = null;
      }
    } catch {}

    // Clear intervals
    try { if (this.updateInterval) { clearInterval(this.updateInterval); this.updateInterval = null; } } catch {}
    try { if (this.aiAnalysisInterval) { clearInterval(this.aiAnalysisInterval); this.aiAnalysisInterval = null; } } catch {}
    try { if (this.rateGlideTimer) { clearInterval(this.rateGlideTimer); this.rateGlideTimer = null; } } catch {}

    // Detach audio element listeners and pause
    try { if (this.currentAudioPlayer && this.updateProgressListener) this.currentAudioPlayer.removeEventListener('timeupdate', this.updateProgressListener); } catch {}
    try { if (this.currentAudioPlayer && this.currentSongEndedListener) this.currentAudioPlayer.removeEventListener('ended', this.currentSongEndedListener); } catch {}
    try { this.currentAudioPlayer?.pause(); } catch {}
    try { this.nextAudioPlayer?.pause(); } catch {}

    // Stop beat-synced fun FX scheduler
    try {
      if (this.stopFunFxScheduler) {
        this.stopFunFxScheduler();
        this.stopFunFxScheduler = undefined;
      }
    } catch {}

    // Dispose FX Router
    try { if (this.fxRouter) { this.fxRouter.dispose(); this.fxRouter = undefined; } } catch {}

    // Teardown HTML audio/WebAudio pipeline
    this.teardownHtmlAudio();

    // Teardown Howler resources
    try {
      this.howlerAudioService.teardown();
    } catch {}

    // Stop DJ engine loop
    try { this.djEngine.stop(); } catch {}
    // Stop Auto-DJ loop
    try { this.autoDj.stop(); } catch {}

    // Terminate analyzer worker

    // Close/suspend our AudioContext
    try {
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }
    } catch {}
  }

}
