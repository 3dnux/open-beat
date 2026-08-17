import { Component, Input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Song } from '../song-carousel/song-carousel';

@Component({
  selector: 'app-list-song',
  imports: [
    DecimalPipe
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
