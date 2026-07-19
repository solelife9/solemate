// ─── ringColor.ts ────────────────────────────────────────────────
// 수명 링 게이지 색 단일 출처. 앱 전역 4단계 컨디션색(최상=파랑·양호=초록·교체고려=노랑·
// 교체권장=빨강)과 **동일한 이산색**을 쓴다(2026-07-19 통일 — 링 옆 '최상/양호' 라벨·
// 신발 탭 바·상태 점과 색이 어긋나 혼란스러웠던 것을 근본 해소). 그라데이션의 선명함은
// 같은 등급색의 밝기 차이(from 밝게 → to 등급색)로 유지한다.
//
// 화면 raw-hex 0 원칙: 색 계산은 전부 이 파일에 가둔다. 등급→색 매핑은 신발 탭과 동일한
// wearTier(pct).tone 규약을 쓴다(good→최상 파랑 … danger→빨강).

import { BEST, GOOD, WARN, DANGER } from '../theme';
import { wearTier } from './shoe';

export type RingColor = {
  from: string;  // 그라데이션 시작(밝은 쪽)
  to: string;    // 그라데이션 끝 = 등급색 — 상태 점/글로우 기준색(배지와 동일)
  glow: string;  // drop-shadow 근접 글로우
  bloom: string; // drop-shadow 확산 블룸
  solid: string; // 단색이 필요할 때(칩 점 등) = 등급색
};

// wearTier tone → 4단계 컨디션색(신발 탭 TONE_COLOR 와 동일 매핑).
const TIER_COLOR: Record<string, string> = { good: BEST, mid: GOOD, warn: WARN, danger: DANGER };

/** hex → [h(deg), s(0..1), l(0..1)]. 등급색의 밝은 변주(from) 산출용. */
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v: number) => ('0' + Math.round((v + m) * 255).toString(16)).slice(-2);
  return '#' + to(r) + to(g) + to(b);
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 소진율(%) → 링 색 세트. 색은 4단계 등급색(최상 파랑 … 교체 빨강)에 고정한다. to·solid 는
 *  배지·상태 점과 동일한 등급색이고, from 만 같은 색의 밝은 변주(그라데이션 깊이용). */
export function ringColor(percentUsed: number): RingColor {
  const base = TIER_COLOR[wearTier(percentUsed).tone] ?? BEST;
  const [h, s, l] = hexToHsl(base);
  const from = hslToHex(h, s, Math.min(1, l + 0.12)); // 등급색을 밝게 — 아크 상단 하이라이트
  return {
    from,
    to: base,     // 등급색 그대로 — 상태 점(.to)이 배지와 정확히 일치
    glow: rgba(base, 0.9),
    bloom: rgba(base, 0.5),
    solid: base,
  };
}
