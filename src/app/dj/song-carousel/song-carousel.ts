import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {DecimalPipe} from '@angular/common';
import type { TrackAnalysis } from '../../services/track-analysis.service';

export interface Song {
  title: string;
  artists: string;
  composer?: string; // Added composer field
  duration: string;
  currentTime: string;
  waveformData: number[]; // valores 0-100
  coverUrl: string;
  songUrl: string;
  isPlaying?: boolean;
  progress?: number; // 0-100 percentage of song played
  bpm?: number; // Beats Per Minute
  audioElement?: HTMLAudioElement;
  durationSeconds?: number; // Total duration in seconds
  genre?: string; // Song genre
  camelot?: string; // Musical key as Camelot code (e.g. '8A') for harmonic mixing
  keyName?: string; // Musical key name (e.g. 'A minor')
  energy?: number; // 0-1 overall intensity
  analysis?: TrackAnalysis; // Full DJ analysis (beatgrid, structure, loudness...)
}


@Component({
  selector: 'app-song-carousel',
  imports: [
    DecimalPipe
  ],
  templateUrl: './song-carousel.html',
  styleUrl: './song-carousel.scss',
  changeDetection: ChangeDetectionStrategy.Default
})
export class SongCarousel {
  /**
   * Array of songs to display in the carousel.
   * The component will display up to 2 songs:
   * - songs[0]: The currently playing song (displayed as a full card)
   * - songs[1]: The next song to play (displayed as a circular image)
   */
  @Input() public songs: Song[] = [];
}
