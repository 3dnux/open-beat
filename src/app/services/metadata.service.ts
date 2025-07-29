import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import * as jschardet from 'jschardet';
import * as mm from 'music-metadata';

// Define the metadata interface
export interface AudioMetadata {
  title?: string;
  artist?: string;
  artists?: string;
  composer?: string;
  album?: string;
  year?: string;
  genre?: string;
  picture?: string;
  duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class MetadataService {
  constructor(private http: HttpClient) {}

  /**
   * Extracts metadata from an audio file URL
   * @param url The URL of the audio file
   * @returns Observable with the extracted metadata
   */
  extractMetadata(url: string): Observable<AudioMetadata> {
    // First extract metadata from URL for immediate response
    const urlMetadata = this.extractMetadataFromUrl(url);

    // Return URL-based metadata immediately while fetching detailed metadata
    // This provides a fast initial response while better metadata is being processed
    const initialResponse = of(urlMetadata);

    // Fetch the audio file and extract detailed metadata using music-metadata
    const detailedMetadata = this.http.get(url, { responseType: 'blob' }).pipe(
      switchMap(blob => from(this.extractMetadataFromBlob(blob, url))),
      catchError(error => {
        console.error('Error fetching audio file:', error);
        // Return basic metadata extracted from the URL if fetching fails
        return of(urlMetadata);
      })
    );

    // Return the initial response immediately
    return detailedMetadata;
  }

  /**
   * Extracts metadata from an audio blob using music-metadata library
   * @param blob The audio blob
   * @param url The original URL (used as fallback for metadata extraction)
   * @returns Promise with the extracted metadata
   */
  private extractMetadataFromBlob(blob: Blob, url: string): Promise<AudioMetadata> {
    return new Promise((resolve) => {
      try {
        console.log('Extracting metadata using music-metadata library');

        // Set a timeout to handle cases where metadata extraction takes too long
        const timeoutId = setTimeout(() => {
          console.warn('Metadata extraction timeout, using URL-based extraction as fallback');
          resolve(this.extractMetadataFromUrl(url));
        }, 10000); // 10 seconds timeout for metadata extraction

        // Use music-metadata to parse the blob
        mm.parseBlob(blob)
          .then(metadata => {
            clearTimeout(timeoutId);
            console.log('Successfully extracted metadata using music-metadata:', metadata);

            // Extract common metadata
            const common = metadata.common || {};

            // Create metadata object from the parsed data
            const extractedMetadata: AudioMetadata = {
              title: common.title || this.extractMetadataFromUrl(url).title,
              artist: common.artist || this.extractMetadataFromUrl(url).artist,
              artists: common.artists ? common.artists.join(', ') : common.artist,
              composer: common.composer ? common.composer.join(', ') : undefined,
              album: common.album,
              year: common.year ? common.year.toString() : undefined,
              genre: common.genre ? common.genre.join(', ') : undefined,
              picture: common.picture && common.picture.length > 0
                ? URL.createObjectURL(new Blob([common.picture[0].data], { type: common.picture[0].format }))
                : undefined,
              duration: metadata.format.duration
            };

            // If we got meaningful metadata, use it
            if (extractedMetadata.title && extractedMetadata.title !== 'Unknown Title') {
              console.log('Successfully extracted metadata:', extractedMetadata);
              resolve(extractedMetadata);
            } else {
              // If metadata is incomplete, try URL-based extraction as backup
              console.log('Metadata incomplete, merging with URL extraction');
              const urlMetadata = this.extractMetadataFromUrl(url);

              // Merge the metadata, preferring music-metadata data when available
              const mergedMetadata = {
                title: extractedMetadata.title !== 'Unknown Title' ? extractedMetadata.title : urlMetadata.title,
                artist: extractedMetadata.artist !== 'Unknown Artist' ? extractedMetadata.artist : urlMetadata.artist,
                artists: extractedMetadata.artists || urlMetadata.artists,
                composer: extractedMetadata.composer || urlMetadata.composer,
                album: extractedMetadata.album || urlMetadata.album,
                year: extractedMetadata.year || urlMetadata.year,
                genre: extractedMetadata.genre || urlMetadata.genre,
                picture: extractedMetadata.picture || urlMetadata.picture
              };

              resolve(mergedMetadata);
            }
          })
          .catch(error => {
            clearTimeout(timeoutId);
            console.error('Error extracting metadata with music-metadata:', error);

            // Fall back to HTML5 Audio element as a secondary method
            this.extractMetadataFromAudioElement(new Audio(URL.createObjectURL(blob)), url)
              .then(audioElementMetadata => {
                resolve(audioElementMetadata);
              })
              .catch(audioError => {
                console.error('Error with audio element fallback:', audioError);
                resolve(this.extractMetadataFromUrl(url));
              });
          });
      } catch (error) {
        console.error('Error in extractMetadataFromBlob:', error);
        resolve(this.extractMetadataFromUrl(url));
      }
    });
  }

  /**
   * Extracts metadata from an HTML5 Audio element
   * @param audio The audio element
   * @param url The original URL (used for fallback extraction)
   * @returns Promise with the extracted metadata
   */
  private extractMetadataFromAudioElement(audio: HTMLAudioElement, url: string): Promise<AudioMetadata> {
    return new Promise((resolve) => {
      try {
        // Set a timeout to handle cases where metadata loading takes too long
        const timeoutId = setTimeout(() => {
          console.warn('Audio element metadata loading timeout, using URL-based extraction as fallback');
          resolve(this.extractMetadataFromUrl(url));
        }, 5000); // 5 seconds timeout

        // Listen for metadata loading
        audio.onloadedmetadata = () => {
          clearTimeout(timeoutId);
          console.log('Audio metadata loaded successfully from audio element');

          // First try to get metadata from the audio element
          // Note: Browser support for these properties varies
          const mediaMetadata = (audio as any).mediaMetadata || {};

          // Try to extract metadata from media session API if available
          const mediaSession = (navigator as any).mediaSession?.metadata;

          // Get basic metadata from the audio element
          let title = mediaMetadata.title || mediaSession?.title;
          let artist = mediaMetadata.artist || mediaSession?.artist;
          let album = mediaMetadata.album || mediaSession?.album;
          let composer = mediaMetadata.composer;

          // If we couldn't get metadata from the audio element, fall back to URL extraction
          const urlMetadata = this.extractMetadataFromUrl(url);

          // Use URL-extracted metadata as fallback
          title = title || urlMetadata.title;
          artist = artist || urlMetadata.artist;
          album = album || urlMetadata.album;

          // Try to extract composer from title or artist if not found
          if (!composer) {
            // Check if the title or artist contains "composed by" or similar phrases
            const composerRegex = /(composed by|composer:?|music by)\s*([^,;()\[\]]+)/i;
            const titleMatch = title ? title.match(composerRegex) : null;
            const artistMatch = artist ? artist.match(composerRegex) : null;

            if (titleMatch) {
              composer = titleMatch[2].trim();
            } else if (artistMatch) {
              composer = artistMatch[2].trim();
            }

            // If still no composer, check if there are multiple artists separated by commas,
            // the first one might be the composer
            if (!composer && artist && artist.includes(',')) {
              const artistParts = artist.split(',');
              if (artistParts.length > 1) {
                // Use the first part as composer if it's not already the artist
                const potentialComposer = artistParts[0].trim();
                if (potentialComposer !== title) {
                  composer = potentialComposer;
                }
              }
            }
          }

          const metadata = {
            title,
            artist,
            artists: artist, // Add artists field with same value as artist
            composer,
            album,
            year: mediaMetadata.year || urlMetadata.year,
            genre: mediaMetadata.genre || urlMetadata.genre,
            picture: mediaMetadata.artwork?.[0]?.src || urlMetadata.picture
          };

          resolve(metadata);
        };

        // Handle errors
        audio.onerror = (error) => {
          clearTimeout(timeoutId);
          console.error('Error loading audio element for metadata extraction:', error);
          resolve(this.extractMetadataFromUrl(url));
        };

        // Start loading if not already loading
        if (audio.readyState === 0) {
          audio.load();
        }
      } catch (error) {
        console.error('Error in extractMetadataFromAudioElement:', error);
        resolve(this.extractMetadataFromUrl(url));
      }
    });
  }

  /**
   * Extracts basic metadata from the URL using filename parsing
   * @param url The URL of the audio file
   * @returns Extracted metadata
   */
  private extractMetadataFromUrl(url: string): AudioMetadata {
    // First decode the entire URL to handle any encoding issues
    const decodedUrl = this.decodeUrlComponent(url);

    // Extract filename from URL
    const filename = decodedUrl.split('/').pop() || '';

    // Remove .mp3 extension
    const nameWithoutExt = filename.replace('.mp3', '');

    let title = 'Unknown Title';
    let artist = 'Unknown Artist';
    let composer = '';

    // Check if the filename has the format "Title - Artist"
    const dashParts = nameWithoutExt.split(' - ');
    if (dashParts.length > 1) {
      title = dashParts[0].trim();
      artist = dashParts[1].trim();
    } else {
      // Check for artist names in parentheses like "Title (Artist Remix)"
      const parenthesesMatch = nameWithoutExt.match(/\((.*?)\)/);
      if (parenthesesMatch) {
        // Extract the content inside parentheses
        const parenthesesContent = parenthesesMatch[1];

        // Check if it contains common terms that indicate it's not an artist name
        const nonArtistTerms = ['original', 'extended', 'remix', 'mix', 'version', 'edit'];
        const isLikelyArtist = !nonArtistTerms.some(term =>
          parenthesesContent.toLowerCase().includes(term.toLowerCase()));

        if (isLikelyArtist) {
          title = nameWithoutExt.replace(/\(.*?\)/, '').trim();
          artist = parenthesesContent.trim();
        } else {
          // If parentheses content is not likely an artist, use the whole name as title
          title = nameWithoutExt;

          // Check if it might be a remix or edit, which could indicate the original artist
          if (parenthesesContent.toLowerCase().includes('remix')) {
            const remixMatch = parenthesesContent.match(/(.*?)\s+remix/i);
            if (remixMatch && remixMatch[1]) {
              composer = remixMatch[1].trim();
            }
          }
        }
      } else {
        // If no clear artist information, use the whole name as title
        title = nameWithoutExt;
      }
    }

    return {
      title,
      artist,
      artists: artist, // Add artists field with same value as artist
      composer,
      album: '',
      year: '',
      genre: ''
    };
  }

  /**
   * Decodes URL components with encoding detection
   * @param url The URL component to decode
   * @returns Decoded URL component
   */
  private decodeUrlComponent(url: string): string {
    try {
      // Try to detect the encoding
      const detected = this.detectEncoding(url);

      // Log the detected encoding for debugging
      if (detected) {
        console.log(`Decoding URL with detected encoding: ${detected}`);
      }

      // For UTF-8 and ASCII, decodeURIComponent works well
      if (detected === 'utf-8' || detected === 'ascii') {
        return decodeURIComponent(url);
      }

      // For other encodings, we could implement specialized decoding
      // but for now we'll try decodeURIComponent and handle errors
      try {
        return decodeURIComponent(url);
      } catch (decodeError) {
        console.warn(`Error with decodeURIComponent for encoding ${detected}, returning original URL:`, decodeError);
        return url;
      }
    } catch (e) {
      console.error('Error in decodeUrlComponent:', e);

      // If there's an error in the overall process, try a simple decodeURIComponent as last resort
      try {
        return decodeURIComponent(url);
      } catch (decodeError) {
        console.error('Final decoding attempt failed, returning original URL:', decodeError);
        return url;
      }
    }
  }

  /**
   * Detects the encoding of a string using jschardet
   * @param str The string to detect encoding for
   * @returns The detected encoding or null if detection failed
   */
  private detectEncoding(str: string): string | null {
    try {
      // Use jschardet for more accurate encoding detection
      const detection = jschardet.detect(str);

      if (detection && detection.confidence > 0.8) {
        console.log(`Detected encoding: ${detection.encoding} with confidence: ${detection.confidence}`);
        return detection.encoding.toLowerCase();
      }

      // If detection failed or has low confidence, fall back to basic detection
      const hasHighAscii = Array.from(str).some(char => char.charCodeAt(0) > 127);

      if (!hasHighAscii) {
        return 'ascii';
      }

      // If there are high ASCII characters, assume UTF-8
      return 'utf-8';
    } catch (e) {
      console.error('Error detecting encoding:', e);
      return null;
    }
  }
}
