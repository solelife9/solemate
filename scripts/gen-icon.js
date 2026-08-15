#!/usr/bin/env node
// ============================================================================
// scripts/gen-icon.js — Keego 안드로이드 런처 아이콘 + Play 스토어 아이콘 생성
// ============================================================================
// 실행: node scripts/gen-icon.js   (프로젝트 루트에서)
//
// 이 스크립트가 만드는 것:
//   android/app/src/main/res/mipmap-*/ic_launcher.png, ic_launcher_round.png
//   docs/launch/assets/play-icon-512.png            (Play 등록용 · 32비트 RGBA)
//
// **디자인 정본은 iOS 마스터다** —
//   ios/SoleMate/Images.xcassets/AppIcon.appiconset/icon-1024.png
// 아래 상수는 그 PNG 를 픽셀 단위로 **실측해서** 뽑았다(2026-08-15). 눈대중이 아니다.
//   배경 #0A0A0A (81.8%) · 마크 #FF8000 (16.6%)
//   바깥 반지름 368.0 / 512  = 캔버스 폭의 71.9%
//   획폭 114.4               = 바깥 반지름의 31.09%
//   빈 구간 292°~348°        = 아크 84.2% (12시=0°, 시계방향)
//
// ⚠️ 과거 이 스크립트는 **오렌지 배경 + 흰 K** 를 만들었고, 그것은 2026-07-18 에
//    폐기된 디자인이다(`78a8db6` "앱 아이콘 확정 — 파파야 단색 수명 링 아크").
//    그때 안드로이드가 스윕에서 빠져 폐기된 K 마크 + 폐기된 색 #FF6500 이
//    2026-08-15 까지 남아 있었다. 아이콘을 또 바꾸면 **여기와 iOS 를 같이** 바꾼다.
'use strict';
/* eslint-env node */
/* eslint-disable no-bitwise -- CRC32/PNG 인코딩에 비트연산 필수 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── 실측 상수 (iOS 마스터에서) ────────────────────────────────────────────────
const BG = [0x0a, 0x0a, 0x0a];
const FG = [0xff, 0x80, 0x00];       // Keego Ember
const FILL_RATIO   = 368.0 / 512.0;  // 링 바깥지름 ÷ 캔버스 폭
const STROKE_RATIO = 114.4 / 368.0;  // 획폭 ÷ 바깥반지름
const GAP = [292.0, 348.0];          // 비어 있는 각도 구간 (12시=0°, 시계방향)

const SS = 4;                        // 슈퍼샘플링 배수(안티에일리어싱)

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

// ── PNG 인코더 ────────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(data.length, 0);
  const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([lb, tb, data, cb]);
}

/** @param alpha true 면 32비트 RGBA(Play 요구), false 면 24비트 RGB. */
function encodePNG(w, h, px, alpha) {
  const nch = alpha ? 4 : 3;
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = 1 + w * nch;
  const raw = Buffer.allocUnsafe(h * stride);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;                      // filter: None
    raw.set(px.subarray(y * w * nch, (y + 1) * w * nch), y * stride + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 링 렌더 ───────────────────────────────────────────────────────────────────
// 정사각 캔버스 한가운데에 아크를 그린다. 끝은 둥근 캡(iOS 마스터와 동일).
function ringCoverage(size) {
  const n = size * SS;
  const c = n / 2;
  const rOut = (FILL_RATIO * size / 2) * SS;
  const st   = rOut * STROKE_RATIO;
  const rc   = rOut - st / 2;               // 중심선 반지름
  const half = st / 2;
  const [g0, g1] = GAP;

  // 캡 중심 두 점
  const caps = [g0, g1].map((a) => {
    const t = a * Math.PI / 180;
    return [c + rc * Math.sin(t), c - rc * Math.cos(t)];
  });

  const cov = new Float32Array(size * size);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = x + 0.5, py = y + 0.5;
      const dx = px - c, dy = py - c;
      let hit = false;

      // 링 몸통: 중심선에서의 거리가 반획폭 이내 + 빈 구간 밖
      if (Math.abs(Math.hypot(dx, dy) - rc) <= half) {
        let a = Math.atan2(dx, -dy) * 180 / Math.PI;
        if (a < 0) a += 360;
        const inGap = g0 <= g1 ? (a >= g0 && a <= g1) : (a >= g0 || a <= g1);
        if (!inGap) hit = true;
      }
      // 둥근 캡
      if (!hit) {
        for (const [ex, ey] of caps) {
          if (Math.hypot(px - ex, py - ey) <= half) { hit = true; break; }
        }
      }
      if (hit) cov[((y / SS) | 0) * size + ((x / SS) | 0)] += 1;
    }
  }
  const denom = SS * SS;
  for (let i = 0; i < cov.length; i++) cov[i] /= denom;
  return cov;
}

function render(size, alpha) {
  const cov = ringCoverage(size);
  const nch = alpha ? 4 : 3;
  const out = new Uint8Array(size * size * nch);
  for (let i = 0; i < size * size; i++) {
    const m = cov[i];
    const o = i * nch;
    for (let k = 0; k < 3; k++) out[o + k] = Math.round(BG[k] + (FG[k] - BG[k]) * m);
    if (alpha) out[o + 3] = 255;             // 전면 불투명(Play 는 32비트를 요구할 뿐)
  }
  return out;
}

// ── 실행 ──────────────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const RES  = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

const DENSITIES = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

console.log('Keego 아이콘 생성 — iOS 마스터 실측 기하(링 아크)');
for (const { dir, size } of DENSITIES) {
  const png = encodePNG(size, size, render(size, false), false);
  const d = path.join(RES, dir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'ic_launcher.png'), png);
  fs.writeFileSync(path.join(d, 'ic_launcher_round.png'), png);
  console.log(`  ${dir.padEnd(16)} ${size}×${size}`);
}

// Play 스토어 등록 아이콘 — 512×512, 32비트 PNG(알파 채널 필요), 1MB 이하
const storeDir = path.join(ROOT, 'docs', 'launch', 'assets');
fs.mkdirSync(storeDir, { recursive: true });
const store = encodePNG(512, 512, render(512, true), true);
fs.writeFileSync(path.join(storeDir, 'play-icon-512.png'), store);
console.log(`  docs/launch/assets  512×512 RGBA  (${(store.length / 1024).toFixed(0)}KB / 1024KB 한도)`);
console.log('완료.');
