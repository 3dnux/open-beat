/**
 * Home component for the HeyDJ application
 *
 * This component includes character encoding detection using the jschardet library.
 * jschardet is used to detect the character encoding of song URLs before decoding them,
 * which helps handle special characters in song titles and artist names correctly.
 * If jschardet fails to detect the encoding or if there's an error, it falls back to
 * the default decodeURIComponent behavior.
 */
import {ChangeDetectionStrategy, Component, AfterViewInit} from '@angular/core';
import {SongCarousel, Song} from '../dj/song-carousel/song-carousel';
import {ListSong} from '../dj/list-song/list-song';
import * as jschardet from 'jschardet';
import { AlbumArtService } from '../services/album-art.service';
import { BpmDetectionService } from '../services/bpm-detection.service';
import { DjTransitionService } from '../services/dj-transition.service';
import { MetadataService } from '../services/metadata.service';
import { AIAudioProcessingService } from '../services/ai-audio-processing.service';
import { HowlerAudioService } from '../services/howler-audio.service';
import { EmotionAnalysisService } from '../services/emotion-analysis.service';

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
    SongCarousel,
    ListSong
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.Default
})
export class Home implements AfterViewInit {


  playlistsApp: playlists[] = [
    {
      name: 'Tiësto Set #029',
      artist: 'Tiesto',
      img: 'https://geo-media.beatport.com/image_size/590x404/846683c6-4b4d-44db-8ebe-13d5d3cd5f92.jpg',
      songs: [
        {
          url: 'https://zoneapi.cloud/music/Adagio%20For%20Strings.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/C\'mon%20(Original%20Mix).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/Coming%20Home%20(Extended%20Mix).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/Dawnbreaker%20(Extended%20Mix).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/Drifting%20(Extended%20Mix).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/Grapevine%20(Extended%20Mix).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/Light%20Years%20Away%20(Extended%20Radio%20Edit).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/Lose%20Control%20(Extended%20Mix).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/Meet%20Her%20(Ti%C3%ABsto%20vs.%20Da%20Hool%20-%20Extended%20Mix).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/My%20Whistle%20(Extended%20Mix).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/Party%20Time%20(Extended%20Mix).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/Pulverturm%20(Ti%C3%ABsto\'s%20Big%20Room%20Extended%20Remix).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/Red%20Lights%20(Extended%20Version).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/The%20Hypno.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/WOW%20(Extended%20Mix).mp3'
        }
      ]
    },
    {
      name: 'Deorro Set #001',
      artist: 'Deorro',
      img: 'https://geo-media.beatport.com/image_size/590x404/651dd449-1d01-4a84-b352-c3a5caecb7fe.jpg',
      songs: [
        {
          url: 'https://zoneapi.cloud/music/deorro/Five More Hours - Original Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/deorro/Flashlight - Original Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/deorro/Freak (feat. Steve Bays) - Original Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/deorro/Me Caes Muy Bien - Original Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/deorro/Perdoname - Original Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/deorro/Savage - Extended Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/deorro/Yee - Extended Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/deorro/Yo Las Pongo - Original Mix.mp3'
        }
      ]
    },
    {
      name: 'Purple Disco Machine Set #004',
      artist:'Purple Disco Machine',
      img: 'https://geo-media.beatport.com/image_size/590x404/7425b20c-6134-428c-b006-b0572f07a75f.jpg',
      songs: [
        {
          url: 'https://zoneapi.cloud/music/purple/About Damn Time - Purple Disco Machine Extended Remix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/All My Life - Extended Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/At Night - Purple Disco Machine Extended Remix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/Body Funk - Original Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/Coma Cat - Purple Disco Machine Extended Re-Work.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/Dished (Male Stripper) - Extended Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/Don\'t You Want Me - Purple Disco Machine Extended Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/Drop The Pressure - Purple Disco Machine Remix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/Emotion - Extended Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/Get Up 24 - Original Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/Heartbreaker - Extended Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/In My Arms - Extended Mix.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/link-ref-Groovejet.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/On My Mind - Purple Disco Machine Remix (Extended).mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/Substitution - Extended.mp3'
        },
        {
          url: 'https://zoneapi.cloud/music/purple/YoYo Disco - Purple Disco Machine Extended Remix.mp3'
        }
      ]
    }
  ];



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

  // Audio analyzer for frequency analysis
  private analyzer: AnalyserNode | null = null;

  // DJ transition nodes
  private transitionNodes: {
    currentEqLow: BiquadFilterNode,
    currentEqMid: BiquadFilterNode,
    currentEqHigh: BiquadFilterNode,
    nextEqLow: BiquadFilterNode,
    nextEqMid: BiquadFilterNode,
    nextEqHigh: BiquadFilterNode,
    currentGain: GainNode,
    nextGain: GainNode
  } | null = null;

  // Store event listener functions as properties so they can be properly removed
  private updateProgressListener = () => this.updateSongProgress();
  private currentSongEndedListener: (() => void) | null = null;

  // AI analysis properties
  private aiAnalysisInterval: any;
  private previousBassEnergy: number = 0;

  constructor(
    private albumArtService: AlbumArtService,
    private bpmDetectionService: BpmDetectionService,
    private djTransitionService: DjTransitionService,
    private metadataService: MetadataService,
    private aiAudioProcessingService: AIAudioProcessingService,
    private howlerAudioService: HowlerAudioService,
    private emotionAnalysisService: EmotionAnalysisService
  ) {
    this.populateSongsFromUrls();

    // Initialize Web Audio API context
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('AudioContext initialized for enhanced 3D audio with improved quality');

      // Create a master gain node
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;
      this.gainNode.connect(this.audioContext.destination);

      // Set up listener for 3D audio
      this.listenerNode = this.audioContext.listener;

      // Position the listener at the center of the audio space
      if (this.listenerNode.positionX) {
        // Modern browsers support direct position setting
        this.listenerNode.positionX.value = 0;
        this.listenerNode.positionY.value = 0;
        this.listenerNode.positionZ.value = 0;

        // Set listener orientation (facing forward)
        // forward x, y, z (0, 0, -1) means facing forward
        // up x, y, z (0, 1, 0) means "up" is in the positive y direction
        this.listenerNode.forwardX.value = 0;
        this.listenerNode.forwardY.value = 0;
        this.listenerNode.forwardZ.value = -1;
        this.listenerNode.upX.value = 0;
        this.listenerNode.upY.value = 1;
        this.listenerNode.upZ.value = 0;
      } else {
        // Fallback for older browsers
        this.listenerNode.setPosition(0, 0, 0);
        this.listenerNode.setOrientation(0, 0, -1, 0, 1, 0);
      }

      // Create reverb effect for spatial ambience
      this.createReverbEffect();
    } catch (e) {
      console.error('Error initializing AudioContext:', e);
    }
  }

  ngAfterViewInit(): void {
    this.initWaveBackground();
  }

  private initWaveBackground(): void {
    const canvas = document.getElementById('wave-bg-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let width = window.innerWidth;
    let height = 260;
    canvas.width = width;
    canvas.height = height;
    // Responsive resize
    window.addEventListener('resize', () => {
      width = window.innerWidth;
      canvas.width = width;
      canvas.height = height;
    });
    // Wave parameters
    const waves = [
      { amplitude: 32, wavelength: 320, speed: 0.015, color: 'rgba(0,255,180,0.18)' },
      { amplitude: 18, wavelength: 180, speed: 0.022, color: 'rgba(0,180,255,0.13)' },
      { amplitude: 12, wavelength: 90, speed: 0.03, color: 'rgba(255,255,255,0.09)' }
    ];
    function drawWaves(time: number) {
      if (ctx) {
        ctx.clearRect(0, 0, width, height);

        waves.forEach((wave, idx) => {
          ctx.beginPath();
          for (let x = 0; x <= width; x += 2) {
            const y = height/2 + Math.sin((x/wave.wavelength) + (time*wave.speed) + idx) * wave.amplitude;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = wave.color;
          ctx.lineWidth = 3;
          ctx.stroke();
        });
      }
    }
    function animate(time: number) {
      drawWaves(time/1000);
      requestAnimationFrame(animate);
    }
    animate(0);
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
    if (this.songs.length === 0 || !this.audioContext) return;

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

    // Try to initialize with Howler for better audio quality
    if (this.initializeWithHowler()) {
      console.log('Using Howler.js for enhanced audio quality and smoother transitions');
      // Analyze emotion and apply effects for the first song
      this.analyzeAndApplyEmotionEffects(firstSong);
      return;
    }

    // Fallback to standard HTML5 Audio if Howler initialization fails

    // Create or update the current audio player
    if (!this.currentAudioPlayer) {
      this.currentAudioPlayer = new Audio(firstSong.songUrl);
      this.currentAudioPlayer.crossOrigin = 'anonymous';
      // Detect BPM when loading a new song
      this.detectBpm(this.currentAudioPlayer, firstSong);
    } else if (this.currentAudioPlayer.src !== firstSong.songUrl) {
      // If the current song has changed, create a new audio player
      this.currentAudioPlayer.pause();
      this.currentAudioPlayer = new Audio(firstSong.songUrl);
      this.currentAudioPlayer.crossOrigin = 'anonymous';
      // Detect BPM when loading a new song
      this.detectBpm(this.currentAudioPlayer, firstSong);
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

    // Initialize or update next audio player if there's a next song
    if (this.songs.length > 1) {
      const nextSong = this.songs[1];

      if (!this.nextAudioPlayer) {
        this.nextAudioPlayer = new Audio(nextSong.songUrl);
        this.nextAudioPlayer.crossOrigin = 'anonymous';
        // Detect BPM for next song
        this.detectBpm(this.nextAudioPlayer, nextSong);
      } else if (this.nextAudioPlayer.src !== nextSong.songUrl) {
        // If the next song has changed, create a new audio player
        this.nextAudioPlayer.pause();
        this.nextAudioPlayer = new Audio(nextSong.songUrl);
        this.nextAudioPlayer.crossOrigin = 'anonymous';
        // Detect BPM for next song
        this.detectBpm(this.nextAudioPlayer, nextSong);
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
        // Analyze emotion and apply effects for the first song
        this.analyzeAndApplyEmotionEffects(firstSong);
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
    } else {
      this.nextSourceNode = sourceNode;
      this.nextPannerNode = pannerNode;
      // Store delay effect nodes for next song
      this.nextDelayNode = processingNodes.delayNode;
      this.nextFeedbackGain = processingNodes.feedbackGain;
      this.nextDelayMix = processingNodes.delayMix;
      this.nextDryMix = processingNodes.dryMix;
    }
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
    dryMix: GainNode
  } {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    // Create advanced audio processing nodes for ultra-high-quality sound

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

    // Return the input and output nodes of the chain, plus delay control nodes
    return {
      input: preGain, // Use preGain as the input node instead of bassBoost
      output: compressor,
      // Add these properties to the returned object
      delayNode: delayNode,
      feedbackGain: feedbackGain,
      delayMix: delayMix,
      dryMix: dryMix
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
          coverUrl: 'https://dj.beatport.com/picx/vinyl_default2.png',
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

      // Reset transition flag for the new song
      this.transitionStarted = false;

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

      // Reset next nodes
      this.nextSourceNode = null;
      this.nextPannerNode = null;
      this.nextDelayNode = null;
      this.nextFeedbackGain = null;
      this.nextDelayMix = null;
      this.nextDryMix = null;

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

      // Create a new next audio player if there's another song
      if (this.songs.length > 1) {
        const newNextSong = this.songs[1];
        this.nextAudioPlayer = new Audio(newNextSong.songUrl);
        this.nextAudioPlayer.crossOrigin = 'anonymous';
        this.nextAudioPlayer.volume = 0;

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

    // Check if we need to start the DJ transition (exactly 20 seconds before the end as requested)
    if (this.songs.length > 1 && this.nextAudioPlayer && !this.transitionStarted) {
      const totalDuration = this.currentAudioPlayer.duration;
      const remainingTime = totalDuration - this.currentAudioPlayer.currentTime;

      // Start transition exactly 20 seconds before the end (AI-driven transition)
      if (remainingTime <= 20) {
        console.log(`Starting AI-driven DJ transition with ${remainingTime.toFixed(2)} seconds remaining`);
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
      this.detectBpm(preloadPlayer, songToPreload);
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

    // Fallback to original method if Howler isn't being used
    if (!this.nextAudioPlayer || this.transitionStarted || !this.currentAudioPlayer || !this.audioContext) return;

    console.log('Starting professional DJ transition with BPM matching and EQ transitions (fallback method)');
    this.transitionStarted = true;

    // Preload upcoming songs immediately to reduce future transition delays
    // This is now called earlier in the process to ensure songs are preloaded well before they're needed
    this.preloadUpcomingSongs();

    // Get BPM values for current and next songs
    const currentSong = this.songs[0];
    const nextSong = this.songs[1];
    const currentBpm = currentSong.bpm || 128; // Default to 128 if not detected
    const nextBpm = nextSong.bpm || 128; // Default to 128 if not detected

    console.log(`Transition between songs: Current BPM: ${currentBpm}, Next BPM: ${nextBpm}`);

    // Calculate remaining time of current song
    const remainingTime = this.currentAudioPlayer.duration - this.currentAudioPlayer.currentTime;

    // Aggressively preload the next song to ensure it's ready to play
    if (this.nextAudioPlayer.readyState < 4) { // HAVE_ENOUGH_DATA = 4
      console.log('Ensuring next song is fully loaded before transition');
      this.nextAudioPlayer.load();

      // If the next song isn't fully loaded, wait a short time and try again
      if (this.nextAudioPlayer.readyState < 4) {
        const loadCheckInterval = setInterval(() => {
          if (this.nextAudioPlayer && this.nextAudioPlayer.readyState >= 4) {
            clearInterval(loadCheckInterval);
            this.continueTransition(currentBpm, nextBpm, remainingTime);
          }
        }, 100);

        // Set a timeout to prevent waiting too long
        // Reduced from 2000ms to 1500ms to start transition sooner
        setTimeout(() => {
          clearInterval(loadCheckInterval);
          console.log('Proceeding with transition even though next song may not be fully loaded');
          this.continueTransition(currentBpm, nextBpm, remainingTime);
        }, 1500);

        return;
      }
    }

    // Continue with the transition
    // --- AI-driven mixing enhancement ---
    if (this.djTransitionService && this.aiAudioProcessingService && this.currentSourceNode && this.nextSourceNode && this.transitionNodes) {
      this.djTransitionService.startTransition(
        this.transitionNodes,
        currentBpm,
        nextBpm,
        remainingTime,
        this.audioContext,
        this.aiAudioProcessingService,
        this.currentSourceNode,
        this.nextSourceNode
      );
    } else {
      this.continueTransition(currentBpm, nextBpm, remainingTime);
    }
  }

  /**
   * Continues the DJ transition after ensuring the next song is loaded
   */
  private continueTransition(currentBpm: number, nextBpm: number, remainingTime: number): void {
    if (!this.nextAudioPlayer || !this.currentAudioPlayer || !this.audioContext) return;

    // Calculate optimal start time based on BPM and phrase alignment
    // Start transition earlier to ensure no gap between songs
    const optimalStartTime = this.djTransitionService.calculateOptimalStartTime(
      this.currentAudioPlayer.currentTime,
      this.currentAudioPlayer.duration,
      currentBpm,
      nextBpm
    );

    // If we're past the optimal start time, start transition immediately
    // Otherwise, schedule the transition for the optimal time
    if (this.currentAudioPlayer.currentTime >= optimalStartTime) {
      this.executeTransition(currentBpm, nextBpm, remainingTime);
    } else {
      const timeUntilTransition = (optimalStartTime - this.currentAudioPlayer.currentTime) * 1000;
      console.log(`Scheduling transition to start in ${timeUntilTransition / 1000} seconds for optimal phrase alignment`);
      setTimeout(() => {
        this.executeTransition(currentBpm, nextBpm, remainingTime);
      }, timeUntilTransition);
    }
  }

  /**
   * Executes the actual DJ transition using the DjTransitionService
   * @param currentBpm BPM of the current song
   * @param nextBpm BPM of the next song
   * @param remainingTime Remaining time of the current song in seconds
   */
  private executeTransition(currentBpm: number, nextBpm: number, remainingTime: number): void {
    if (!this.nextAudioPlayer || !this.currentAudioPlayer || !this.audioContext || !this.currentSourceNode || !this.nextSourceNode) return;

    // Ensure the next song is ready to play
    if (this.nextAudioPlayer.readyState < 3) { // HAVE_FUTURE_DATA = 3
      this.nextAudioPlayer.load();
    }

    // Start playing the next song
    const playPromise = this.nextAudioPlayer.play();

    // Handle play promise to avoid uncaught promise rejection
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.error('Error starting next song playback:', error);
        // Try again after a short delay if autoplay was prevented
        setTimeout(() => {
          this.nextAudioPlayer?.play().catch(e => console.error('Retry failed:', e));
        }, 100);
      });
    }

    // Create professional DJ transition using our service
    const transitionResult = this.djTransitionService.createTransition(
      this.currentSourceNode,
      this.nextSourceNode,
      currentBpm,
      nextBpm,
      this.audioContext
    );

    // Store the transition nodes
    this.transitionNodes = transitionResult.transitionNodes;

    // Connect the output chains to the main gain node
    transitionResult.currentChain.connect(this.gainNode!);
    transitionResult.nextChain.connect(this.gainNode!);

    // Start the transition
    this.djTransitionService.startTransition(
      this.transitionNodes,
      currentBpm,
      nextBpm,
      remainingTime,
      this.audioContext
    );

    // We'll still use our spatial audio for enhanced effect
    this.startSpatialTransition();

    // Start adjusting volumes for smooth transition
    this.adjustVolumes();
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

  private adjustVolumes(): void {
    // Check if we're using Howler for audio (preferred method)
    if (this.howlerAudioService.getCurrentSound() && this.howlerAudioService.getNextSound() && this.transitionStarted) {
      // Let Howler handle the crossfade with its superior fade algorithm
      // This is already set up in the startTransition method

      // Adjust delay effect parameters based on remaining time
      const currentSound = this.howlerAudioService.getCurrentSound();
      const remainingTime = currentSound ?
        currentSound.duration() - (currentSound.seek() as number) : 0;

      this.adjustDelayEffect(remainingTime);

      // If the current song has ended but the ended event hasn't fired yet,
      // manually trigger the transition to the next song
      if (remainingTime <= 0 && this.songs.length > 1) {
        this.moveToNextSong();
        return; // Stop the animation frame loop
      }

      // Continue adjusting effects until the current song ends
      if (remainingTime > 0) {
        requestAnimationFrame(() => this.adjustVolumes());
      }

      return;
    }

    // Fallback to original method if Howler isn't being used
    if (!this.currentAudioPlayer || !this.nextAudioPlayer || !this.transitionStarted) return;

    // Get remaining time of current song
    const remainingTime = this.currentAudioPlayer.duration - this.currentAudioPlayer.currentTime;

    // Calculate volume levels based on remaining time with improved curve
    // Use a more natural exponential fade curve instead of linear
    // This prevents the abrupt volume changes near the end of songs
    const transitionProgress = Math.max(0, Math.min(1, 1 - (remainingTime / 20)));

    // Use cosine curve for current song (stays louder longer, then fades quickly at the end)
    // Use sine curve for next song (starts quietly, then increases more quickly)
    const currentVolume = Math.cos(transitionProgress * Math.PI / 2); // 1 -> 0 with curve
    const nextVolume = Math.sin(transitionProgress * Math.PI / 2); // 0 -> 1 with curve

    // Apply volume changes
    this.currentAudioPlayer.volume = currentVolume;
    this.nextAudioPlayer.volume = nextVolume;

    // Adjust delay effect parameters based on remaining time
    this.adjustDelayEffect(remainingTime);

    // If the current song is about to end (less than 0.5 seconds remaining),
    // ensure the next song is playing at full volume for seamless transition
    if (remainingTime < 0.5 && this.nextAudioPlayer.volume < 1) {
      this.nextAudioPlayer.volume = 1;
    }

    // If the current song has ended but the ended event hasn't fired yet,
    // manually trigger the transition to the next song
    if (remainingTime <= 0 && this.songs.length > 1) {
      this.moveToNextSong();
      return; // Stop the animation frame loop
    }

    // Continue adjusting volumes and effects until the current song ends
    if (remainingTime > 0) {
      requestAnimationFrame(() => this.adjustVolumes());
    }
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

  private populateSongsFromUrls(playlistArtist: string = 'Tiesto'): void {
    // Randomize the songList array
    const shuffledSongList = [...this.songList].sort(() => Math.random() - 0.5);

    // Create songs with default values first
    const initialSongs = shuffledSongList.map(songUpload => {
      // Set placeholder values until metadata is loaded
      const duration = '--:--';
      const totalDurationSeconds = 0;
      const currentTime = '0:00';
      const coverUrl = 'https://dj.beatport.com/picx/vinyl_default2.png';
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
      const nameWithoutExt = filename.replace('.mp3', '');
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

            // Update with metadata values
            updatedSong.title = metadata.title || updatedSong.title;
            // Always use the playlist artist instead of extracted artist
            updatedSong.artists = playlistArtist;
            updatedSong.composer = metadata.composer || '';

            // Update the song in the array
            this.songs[index] = updatedSong;

            // Try to get album art if available
            if (metadata.picture) {
              updatedSong.coverUrl = metadata.picture;
            } else {
              // If no picture in metadata, try to get album art from the service
              this.albumArtService.getAlbumArt(playlistArtist, metadata.title || '')
                .subscribe(
                  artUrl => {
                    if (artUrl && index < this.songs.length) {
                      this.songs[index].coverUrl = artUrl;
                    }
                  },
                  error => console.error('Error fetching album art:', error)
                );
            }
          }
        },
        error => {
          console.error('Error extracting metadata:', error);

          // If metadata extraction fails, fall back to filename parsing
          if (index < this.songs.length) {
            // Extract basic metadata from filename
            const decodedUrl = this.decodeUrlWithEncodingDetection(songUpload.url);
            const filename = decodedUrl.split('/').pop() || '';
            const nameWithoutExt = filename.replace('.mp3', '');

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

    // After creating songs with default images, fetch album artwork for each song
    this.fetchAlbumArtForSongs();
  }

  /**
   * Fetches album artwork for all songs using the AlbumArtService
   * with a 1.5-second delay after song information is loaded
   */
  private fetchAlbumArtForSongs() {
    // Add a 1.5-second delay before fetching album art
    setTimeout(() => {
      console.log('Starting album art fetch after 1.5-second delay');
      this.songs.forEach((song, index) => {
        // Fetch album art for each song
        this.albumArtService.getAlbumArt(song.title, song.artists)
          .subscribe(imageUrl => {
            // Update the song's cover URL with the fetched image URL
            this.songs[index].coverUrl = imageUrl;
            console.log(`Fetched album art for "${song.title}" by ${song.artists}: ${imageUrl}`);
          });
      });
    }, 2000); // 1.5 seconds delay
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
   * Detects the BPM of a song using the BPM detection service
   * @param audioElement The audio element containing the song
   * @param song The song object to update with BPM information
   */
  private detectBpm(audioElement: HTMLAudioElement, song: Song): void {
    if (!this.audioContext) return;

    console.log(`Detecting BPM for "${song.title}" by ${song.artists}...`);

    // Create a temporary buffer to analyze
    const tempAudio = new Audio(song.songUrl);
    tempAudio.crossOrigin = 'anonymous';

    // Update song duration when metadata is loaded
    tempAudio.addEventListener('loadedmetadata', () => {
      if (tempAudio.duration && !isNaN(tempAudio.duration) && isFinite(tempAudio.duration)) {
        // Calculate duration in minutes and seconds
        const totalSeconds = Math.floor(tempAudio.duration);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        // Update song duration properties
        song.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        song.durationSeconds = totalSeconds;

        console.log(`Updated duration for "${song.title}": ${song.duration} (${totalSeconds}s)`);
      }
    });

    // Create a temporary source node and connect it to a MediaRecorder
    const tempContext = new AudioContext();
    const tempSource = tempContext.createMediaElementSource(tempAudio);
    const tempDestination = tempContext.createMediaStreamDestination();
    tempSource.connect(tempDestination);

    // Create a buffer to store audio data
    let audioChunks: Blob[] = [];
    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(tempDestination.stream);
    } catch (error: any) {
      console.error('Error creating MediaRecorder:', error);
      return;
    }

    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      // Create a blob from the recorded chunks
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });

      // Convert blob to ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();

      try {
        // Decode the audio data
        const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);

        // Detect BPM using our service
        const bpm = await this.bpmDetectionService.detectBpm(audioBuffer);

        // Update the song with the detected BPM
        song.bpm = bpm;
        console.log(`Detected BPM for "${song.title}": ${bpm}`);

        // Clean up
        tempContext.close();
      } catch (error: any) {
        console.error('Error detecting BPM:', error);
        // Set a default BPM if detection fails
        song.bpm = 128;
      }
    };

    // Start recording
    mediaRecorder.start();

    // Play a short segment of the audio (first 30 seconds is usually enough for BPM detection)
    tempAudio.play();

    // Stop after 30 seconds or when the audio ends
    const stopTime = Math.min(30, tempAudio.duration || 30);
    setTimeout(() => {
      tempAudio.pause();
      mediaRecorder.stop();
      tempAudio.src = '';
    }, stopTime * 1000);
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
    
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 2048;
    
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

}
