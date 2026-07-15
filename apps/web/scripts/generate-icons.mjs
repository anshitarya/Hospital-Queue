/**
 * Quick icon generator — draws the HQ logo onto a canvas and exports
 * the four PWA icon sizes required by the manifest + TWA.
 *
 * Usage (one-off, run locally):
 *   node apps/web/scripts/generate-icons.mjs
 *
 * Requires: npm install -g canvas  (or: pnpm add -D canvas in apps/web)
 * Output:   apps/web/public/icons/icon-{96,192,512}.png
 *                               icon-{192,512}-maskable.png
 */

import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

const BRAND = '#1d6dff';
const DARK  = '#0f172a';

function drawIcon(size, maskable = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const padding = maskable ? size * 0.12 : 0;

  // Background
  ctx.fillStyle = DARK;
  if (maskable) {
    // Full bleed square for maskable
    ctx.fillRect(0, 0, size, size);
  } else {
    // Rounded square
    const r = size * 0.22;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
  }

  // "HQ" text
  const fontSize = (size - padding * 2) * 0.42;
  ctx.fillStyle = BRAND;
  ctx.font = `900 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HQ', size / 2, size / 2);

  // Subtle underline accent
  const lineW = fontSize * 0.9;
  const lineY = size / 2 + fontSize * 0.55;
  const lineH = Math.max(2, size * 0.025);
  ctx.fillStyle = BRAND;
  ctx.beginPath();
  ctx.roundRect(size / 2 - lineW / 2, lineY, lineW, lineH, lineH / 2);
  ctx.fill();

  return canvas.toBuffer('image/png');
}

const sizes = [
  { size: 96,  maskable: false, name: 'icon-96.png' },
  { size: 192, maskable: false, name: 'icon-192.png' },
  { size: 192, maskable: true,  name: 'icon-192-maskable.png' },
  { size: 512, maskable: false, name: 'icon-512.png' },
  { size: 512, maskable: true,  name: 'icon-512-maskable.png' },
];

for (const { size, maskable, name } of sizes) {
  const buf = drawIcon(size, maskable);
  const dest = path.join(outDir, name);
  writeFileSync(dest, buf);
  console.log(`✓ ${dest}`);
}

console.log('\nAll icons generated. Commit public/icons/ to git.');
