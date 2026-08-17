#!/usr/bin/env node
/**
 * Generates src/assets/music/manifest.json with every audio file found in
 * src/assets/music (subfolders included). The app reads this manifest at
 * startup to build the local playlist, since a browser cannot list a
 * directory by itself.
 *
 * Runs automatically before `npm start` and `npm run build`.
 */
const fs = require('fs');
const path = require('path');

const MUSIC_DIR = path.join(__dirname, '..', 'src', 'assets', 'music');
const MANIFEST_PATH = path.join(MUSIC_DIR, 'manifest.json');
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus', '.webm']);

function collectAudioFiles(dir, baseDir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectAudioFiles(fullPath, baseDir));
    } else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      // Store the path relative to the music folder, always with forward slashes
      files.push(path.relative(baseDir, fullPath).split(path.sep).join('/'));
    }
  }
  return files;
}

fs.mkdirSync(MUSIC_DIR, { recursive: true });
const tracks = collectAudioFiles(MUSIC_DIR, MUSIC_DIR).sort((a, b) => a.localeCompare(b));
fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ tracks }, null, 2) + '\n');
console.log(`Music manifest: ${tracks.length} track(s) -> ${path.relative(process.cwd(), MANIFEST_PATH)}`);
