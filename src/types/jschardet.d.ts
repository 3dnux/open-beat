declare module 'jschardet' {
  interface DetectionResult {
    encoding: string;
    confidence: number;
  }

  export function detect(buffer: string | Buffer): DetectionResult;
}
