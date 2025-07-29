import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AlbumArtService {
  private defaultCoverUrl = 'https://dj.beatport.com/picx/vinyl_default2.png';

  constructor(private http: HttpClient) { }

  /**
   * Fetches album artwork from iTunes API based on song title and artist
   * @param title The song title
   * @param artist The song artist
   * @returns Observable with the image URL or default image URL if not found
   */
  getAlbumArt(title: string, artist: string): Observable<string> {
    const cleanTitle = this.cleanSearchTerm(title);
    const cleanArtist = this.cleanSearchTerm(artist);
    const searchTerm = `${cleanTitle} ${cleanArtist}`;
    const apiUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&limit=1`;

    return this.http.get<any>(apiUrl).pipe(
      map(response => {
        if (response && response.results && response.results.length > 0) {
          let artworkUrl = response.results[0].artworkUrl100;
          if (artworkUrl) {
            artworkUrl = artworkUrl.replace('100x100', '600x600');
            return artworkUrl;
          }
        }
        return null;
      }),
      catchError(() => of(null)),
      // Si iTunes falla, intenta con Cover Art Archive
      // Usamos switchMap para encadenar la segunda petición
      // Si la respuesta de iTunes es null, buscamos en MusicBrainz
      // Si tampoco hay resultado, devolvemos la portada por defecto
      // NOTA: MusicBrainz requiere primero buscar el release MBID
      // Usamos la API de búsqueda de release de MusicBrainz
      // https://musicbrainz.org/ws/2/release/?query=artist:ARTIST%20AND%20release:TITLE&fmt=json
      // Luego usamos el MBID para consultar la Cover Art Archive
      switchMap((itunesUrl: string|null) => {
        if (itunesUrl) return of(itunesUrl);
        // Buscar MBID en MusicBrainz
        const mbUrl = `https://musicbrainz.org/ws/2/release/?query=artist:${encodeURIComponent(cleanArtist)}%20AND%20release:${encodeURIComponent(cleanTitle)}&fmt=json&limit=1`;
        return this.http.get<any>(mbUrl).pipe(
          map(mbResp => {
            if (mbResp && mbResp.releases && mbResp.releases.length > 0) {
              const mbid = mbResp.releases[0].id;
              // Construir URL de portada
              return `https://coverartarchive.org/release/${mbid}/front-500`;
            }
            return this.defaultCoverUrl;
          }),
          catchError(() => of(this.defaultCoverUrl))
        );
      })
    );
  }

  /**
   * Clean up search terms by removing common words and special characters
   * @param term The search term to clean
   * @returns Cleaned search term
   */
  private cleanSearchTerm(term: string): string {
    if (!term) return '';

    // Remove text in parentheses, common terms, and special characters
    return term
      .replace(/\([^)]*\)/g, '') // Remove text in parentheses
      .replace(/(original|extended|remix|mix|version|edit)/gi, '') // Remove common terms
      .replace(/[^\w\s]/gi, '') // Remove special characters
      .trim();
  }
}
