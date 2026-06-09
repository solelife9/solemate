#!/usr/bin/env node
// Generates Keego launcher PNGs for all mipmap densities.
// Design matches the adaptive icon: orange (#FF6500) bg + white "K" strokes.
// Adaptive icon coords viewport = 108×108; same proportions scaled to each size.
// Run from project root: node scripts/gen-icon.js
'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 ─────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG encoder ───────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const lb = Buffer.allocUnsafe(4);
  lb.writeUInt32BE(data.length, 0);
  const cb = Buffer.allocUnsafe(4);
  cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([lb, tb, data, cb]);
}

function encodePNG(w, h, rgbPixels /* Uint8Array w*h*3 */) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0; // 8-bit RGB

  const stride = 1 + w * 3;
  const raw = Buffer.allocUnsafe(h * stride);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: None
    raw.set(rgbPixels.subarray(y * w * 3, (y + 1) * w * 3), y * stride + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Geometry ──────────────────────────────────────────────────────────────────
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Soft coverage: 1 inside, linear falloff over 1px for anti-aliasing.
function coverage(dist, halfWidth) {
  return Math.max(0, Math.min(1, halfWidth + 0.5 - dist));
}

// ── Icon generator ────────────────────────────────────────────────────────────
// Adaptive icon viewport = 108dp.
// K strokes (from ic_launcher_foreground.xml, strokeWidth=12):
//   stem:      (44,33)→(44,75)
//   upper arm: (45,56)→(73,34)
//   lower arm: (45,54)→(75,75)
const K_LINES = [
  [44,33, 44,75],
  [45,56, 73,34],
  [45,54, 75,75],
];
const K_HALF_STROKE = 6; // strokeWidth/2
const VIEWPORT = 108;

// Orange background: #FF6500
const BG_R = 0xFF, BG_G = 0x65, BG_B = 0x00;
// White foreground: #FFFFFF
const FG_R = 0xFF, FG_G = 0xFF, FG_B = 0xFF;

function generateIconRGB(size) {
  const s = size / VIEWPORT;
  const half = K_HALF_STROKE * s;
  const pixels = new Uint8Array(size * size * 3);

  const scaledLines = K_LINES.map(([ax,ay,bx,by]) => [ax*s, ay*s, bx*s, by*s]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // sub-pixel center
      const px = x + 0.5, py = y + 0.5;

      // coverage from each K stroke
      let cov = 0;
      for (const [ax,ay,bx,by] of scaledLines) {
        cov = Math.max(cov, coverage(distSeg(px, py, ax, ay, bx, by), half));
      }

      const i = (y * size + x) * 3;
      // blend: 0=orange, 1=white
      pixels[i]   = Math.round(BG_R + (FG_R - BG_R) * cov);
      pixels[i+1] = Math.round(BG_G + (FG_G - BG_G) * cov);
      pixels[i+2] = Math.round(BG_B + (FG_B - BG_B) * cov);
    }
  }
  return pixels;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const SIZES = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

for (const { dir, size } of SIZES) {
  const rgb = generateIconRGB(size);
  const png = encodePNG(size, size, rgb);
  const d   = path.join(RES, dir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'ic_launcher.png'),       png);
  fs.writeFileSync(path.join(d, 'ic_launcher_round.png'), png);
  console.log(`  ${dir} ${size}×${size} ok`);
}
console.log('Keego icons generated.');
