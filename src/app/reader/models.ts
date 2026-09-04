export interface BookCover {
  /** Main cover colour (top of the gradient). */
  from: string;
  /** Secondary cover colour (bottom of the gradient). */
  to: string;
  /** Accent used for the title band and spine details. */
  accent: string;
  /** Text colour on the cover. */
  ink: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  year?: string;
  /** Public URL of the PDF (built-in books). */
  src?: string;
  /** Raw PDF bytes (books added by the user, stored in IndexedDB). */
  data?: ArrayBuffer;
  cover: BookCover;
  /** True for books uploaded by the user. */
  local?: boolean;
  pages?: number;
}

export type ParagraphKind = 'h1' | 'h2' | 'h3' | 'p';

export interface Paragraph {
  kind: ParagraphKind;
  text: string;
  /** 1-based PDF page where the paragraph starts. */
  page: number;
  /** Paragraph ends at the right margin without closing punctuation (may continue on the next page). */
  open?: boolean;
  /** First line is indented (a paragraph start, never a continuation). */
  indented?: boolean;
}

export interface ReadingProgress {
  /** PDF page shown at the top of the screen. */
  page: number;
  /** Index of the first visible paragraph in the book flow. */
  index?: number;
  percent?: number;
  totalPages?: number;
  updatedAt: number;
}

export type ReaderTheme = 'white' | 'sepia' | 'green' | 'dark';
export type ReaderFont = 'serif' | 'sans' | 'lexend' | 'atkinson';

export interface ReaderSettings {
  bionic: boolean;
  /** Fraction of every word rendered in bold (0.3 - 0.7). */
  fixation: number;
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
  font: ReaderFont;
  /** Warm light overlay, 0-100. */
  warmth: number;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  bionic: true,
  fixation: 0.5,
  fontSize: 20,
  lineHeight: 1.6,
  theme: 'sepia',
  font: 'serif',
  warmth: 0,
};
