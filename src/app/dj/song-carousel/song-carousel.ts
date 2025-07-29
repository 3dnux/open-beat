import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

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
}


@Component({
  selector: 'app-song-carousel',
  imports: [
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
