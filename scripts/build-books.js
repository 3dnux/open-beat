#!/usr/bin/env node
/**
 * Rebuilds the public-domain PDFs bundled with the bionic reader
 * (src/assets/books/*.pdf) from Project Gutenberg plain-text editions.
 *
 *   node scripts/build-books.js
 *
 * Requires network access and Playwright (`npx playwright install chromium`
 * or a global install) to print the HTML to PDF with Chromium.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const OUT_DIR = path.resolve(__dirname, '../src/assets/books');
const BOOKS = [
  { id: 320, slug: 'lazarillo-de-tormes', title: 'Vida de Lazarillo de Tormes', subtitle: 'y de sus fortunas y adversidades', author: 'Anónimo', year: '1554' },
  { id: 17340, slug: 'marianela', title: 'Marianela', subtitle: '', author: 'Benito Pérez Galdós', year: '1878' },
  { id: 13507, slug: 'cuentos-de-amor-de-locura-y-de-muerte', title: 'Cuentos de amor, de locura y de muerte', subtitle: '', author: 'Horacio Quiroga', year: '1917' },
];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s).replace(/_([^_]+)_/g, '<em>$1</em>').replace(/--/g, '—');
const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

function isHeading(p) {
  if (p.length > 60) return false;
  return /^#.*#$/.test(p) || /^-?[IVXLC]+-?\.?$/.test(p) || /^(Pr[óo]logo|Tratado\s+\p{L}+)$/iu.test(p);
}

function subtitle(text) {
  return `<br><span style="font-weight:normal;font-style:italic;font-size:13pt">${esc(text)}</span>`;
}

function buildHtml(b, raw) {
  const lines = raw.replace(/\r/g, '').split('\n');
  const start = lines.findIndex(l => l.startsWith('*** START OF THE PROJECT'));
  const end = lines.findIndex(l => l.startsWith('*** END OF THE PROJECT'));
  const body = lines.slice(start + 1, end);

  const paras = [];
  let cur = [];
  for (const l of body) {
    if (l.trim() === '') { if (cur.length) { paras.push(cur.join(' ').replace(/\s+/g, ' ').trim()); cur = []; } }
    else cur.push(l.trim());
  }
  if (cur.length) paras.push(cur.join(' ').trim());

  // Story titles in the Quiroga edition are upper-case without accents; the index (one title per line) has the accented forms.
  const index = [];
  const idxLine = body.findIndex(l => /^#?INDICE#?$/i.test(l.trim()));
  if (idxLine >= 0) for (let i = idxLine + 1; i < body.length && !/^#/.test(body[i].trim()); i++) if (body[i].trim()) index.push(body[i].trim());
  const idxStart = paras.findIndex(p => /^#?INDICE#?$/i.test(p));
  const pretty = t => index.find(n => norm(n) === norm(t)) || t;

  let first = paras.findIndex((p, i) => i > idxStart && isHeading(p) && !/^#?INDICE#?$/i.test(p));
  let content = paras.slice(first);
  const fin = content.findIndex(p => /^FIN( DE .*)?$/.test(p));
  if (fin > 0) content = content.slice(0, fin);

  let html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(b.title)}</title>
<style>
@page { size: 5.5in 8.5in; margin: 0.8in 0.75in; }
body { font-family: 'Liberation Serif', 'DejaVu Serif', serif; font-size: 12pt; line-height: 1.45; text-align: justify; }
p { margin: 0; text-indent: 1.4em; orphans: 2; widows: 2; }
p.first { text-indent: 0; }
h1 { font-size: 26pt; text-align: center; margin: 2.5in 0 0.3in 0; font-weight: normal; letter-spacing: 0.04em; }
h2 { font-size: 15pt; text-align: center; margin: 1.2in 0 0.45in 0; page-break-before: always; font-weight: bold; }
h3 { font-size: 13pt; text-align: center; margin: 0.35in 0 0.3in 0; font-weight: normal; font-style: italic; }
p.author { text-align: center; text-indent: 0; font-size: 15pt; margin-top: 0.4in; }
p.sub { text-align: center; text-indent: 0; font-style: italic; font-size: 14pt; }
p.year { text-align: center; text-indent: 0; margin-top: 0.3in; color: #555; }
p.note { text-align: center; text-indent: 0; font-size: 9.5pt; color: #666; margin-top: 2.5in; }
</style></head><body>
<h1>${esc(b.title)}</h1>
${b.subtitle ? `<p class="sub">${esc(b.subtitle)}</p>` : ''}
<p class="author">${esc(b.author)}</p>
<p class="year">${esc(b.year)}</p>
<p class="note">Texto de dominio público. Fuente: Project Gutenberg (ebook #${b.id}).</p>
`;

  let afterHeading = false;
  for (let i = 0; i < content.length; i++) {
    const p = content[i];
    if (isHeading(p)) {
      const text = p.replace(/^#|#$/g, '').replace(/^-|-$/g, '').trim();
      const next = content[i + 1];
      const hasSubtitle = next && next.length < 80 && !/[.!?]$/.test(next) && !isHeading(next);
      if (/^[IVXLC]+\.?$/.test(text) && hasSubtitle && next.length < 50) { html += `<h2>${esc(text)}${subtitle(next)}</h2>\n`; i++; }
      else if (/^Tratado/i.test(text) && hasSubtitle) { html += `<h2>${esc(text)}${subtitle(next)}</h2>\n`; i++; }
      else if (/^#/.test(p) && p === p.toUpperCase()) html += `<h2>${esc(pretty(text.charAt(0) + text.slice(1).toLowerCase()))}</h2>\n`;
      else if (/^#/.test(p)) html += `<h3>${esc(text)}</h3>\n`;
      else if (/^[IVXLC]+\.?$/.test(text)) html += `<h3>${esc(text)}</h3>\n`; // numbered section inside a story
      else html += `<h2>${esc(text)}</h2>\n`;
      afterHeading = true;
      continue;
    }
    html += `<p${afterHeading ? ' class="first"' : ''}>${inline(p)}</p>\n`;
    afterHeading = false;
  }
  return html + '</body></html>';
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'open-beat-books-'));
  const playwrightRoot = execSync('npm root -g').toString().trim();
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(playwrightRoot, 'playwright'))); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  for (const b of BOOKS) {
    const res = await fetch(`https://www.gutenberg.org/cache/epub/${b.id}/pg${b.id}.txt`);
    if (!res.ok) throw new Error(`Gutenberg #${b.id}: HTTP ${res.status}`);
    const htmlPath = path.join(work, `${b.slug}.html`);
    fs.writeFileSync(htmlPath, buildHtml(b, await res.text()));
    const page = await browser.newPage();
    await page.goto('file://' + htmlPath, { waitUntil: 'load' });
    await page.pdf({
      path: path.join(OUT_DIR, `${b.slug}.pdf`),
      preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;text-align:center;font-family:serif;font-size:9px;color:#666;"><span class="pageNumber"></span></div>',
      margin: { top: '0.8in', bottom: '0.8in', left: '0.75in', right: '0.75in' },
    });
    await page.close();
    console.log('✓', b.slug);
  }
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
