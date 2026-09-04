#!/usr/bin/env node
/**
 * Builds the single-file standalone reader (dist/standalone/librero-bionico.html):
 * the bookshelf and Kindle-style reader without Angular, with the text of the
 * bundled public-domain books already extracted and embedded. pdf.js and its
 * worker are inlined too (the worker runs on the main thread), so user PDFs
 * can be opened without any network access.
 *
 *   node scripts/build-standalone.mjs
 */
import { build } from 'esbuild';
import * as sass from 'sass';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist/standalone');
const BOOKS_DIR = path.join(ROOT, 'src/assets/books');
const COVERS = [
  { from: '#7a1f1f', to: '#3d0d0d', accent: '#d9a441', ink: '#f7e8c8' },
  { from: '#1e4d4a', to: '#0c2624', accent: '#c9b27c', ink: '#eef4ec' },
  { from: '#2d2140', to: '#120c1d', accent: '#e0893b', ink: '#f3e9dc' },
];
const BOOKS = [
  { id: 'lazarillo-de-tormes', title: 'Vida de Lazarillo de Tormes', author: 'Anónimo', year: '1554', cover: COVERS[0] },
  { id: 'marianela', title: 'Marianela', author: 'Benito Pérez Galdós', year: '1878', cover: COVERS[1] },
  { id: 'cuentos-de-amor-de-locura-y-de-muerte', title: 'Cuentos de amor, de locura y de muerte', author: 'Horacio Quiroga', year: '1917', cover: COVERS[2] },
];

async function extractBooks() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-'));
  const mod = path.join(tmp, 'pdf-paragraphs.mjs');
  await build({ entryPoints: [path.join(ROOT, 'src/app/reader/pdf-paragraphs.ts')], bundle: true, format: 'esm', platform: 'node', outfile: mod, logLevel: 'warning' });
  const { buildLines, assembleFlow } = await import(pathToFileURL(mod).href);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const out = [];
  for (const b of BOOKS) {
    const data = new Uint8Array(fs.readFileSync(path.join(BOOKS_DIR, `${b.id}.pdf`)));
    const task = pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
    const doc = await task.promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ lines: buildLines(content.items.filter(it => 'str' in it)), width: page.view[2] - page.view[0], height: page.view[3] - page.view[1] });
      page.cleanup();
    }
    const flow = assembleFlow(pages);
    out.push({ ...b, pages: doc.numPages, flow });
    console.log(`✓ ${b.id}: ${doc.numPages} páginas, ${flow.length} párrafos`);
    await task.destroy();
  }
  return out;
}

function compileStyles() {
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const shelf = read('src/app/reader/bookshelf/bookshelf.scss').replace(/:host\s*\{[^}]*\}/g, '');
  const reader = read('src/app/reader/reader/reader.scss').replace(/:host\s*\{[^}]*\}/g, '').replace(/([^\s;{}])[ \t]+::ng-deep\s*\{/g, '$1 {').replace(/::ng-deep\s*\{/g, '& {');
  const scss = `${read('src/standalone/app.scss')}\n#app { ${shelf} }\n#app { ${reader} }`;
  return sass.compileString(scss, { style: 'compressed', loadPaths: [ROOT] }).css;
}

async function compileScript() {
  const result = await build({
    entryPoints: [path.join(ROOT, 'src/standalone/app.ts')],
    bundle: true, format: 'esm', target: 'es2022', minify: true, write: false, logLevel: 'warning',
  });
  return result.outputFiles[0].text;
}

const [books, css, js] = await Promise.all([extractBooks(), Promise.resolve(compileStyles()), compileScript()]);
const template = fs.readFileSync(path.join(ROOT, 'src/standalone/index.html'), 'utf8');
/** pdf.js ESM build as an inline module: drop the trailing export list, keep the globalThis assignments. */
const inlineModule = f => fs.readFileSync(path.join(ROOT, 'node_modules/pdfjs-dist/build', f), 'utf8').replace(/export\s*\{[^}]*\};?\s*$/, '');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const json = JSON.stringify(books).replace(/<\//g, '<\\/');
const html = template
  .replace('/*__STYLE__*/', css)
  .replace('/*__BOOKS__*/', json)
  .replace('/*__PDFJS__*/', () => safe(inlineModule('pdf.min.mjs')))
  .replace('/*__PDFWORKER__*/', () => safe(inlineModule('pdf.worker.min.mjs')))
  .replace('/*__SCRIPT__*/', () => safe(js));
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'librero-bionico.html');
fs.writeFileSync(file, html);
console.log(`→ ${path.relative(ROOT, file)} (${(html.length / 1024).toFixed(0)} kB)`);
