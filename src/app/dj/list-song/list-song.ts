import { Component, Input } from '@angular/core';
import { Song } from '../song-carousel/song-carousel';

@Component({
  selector: 'app-list-song',
  imports: [
  ],
  templateUrl: './list-song.html',
  styleUrl: './list-song.scss'
})
export class ListSong {
  /**
   * Array of songs to display in the vertical list.
   */
  @Input() public songs: Song[] = [];
}
