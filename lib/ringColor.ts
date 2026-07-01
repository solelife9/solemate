// ─── ringColor.ts ────────────────────────────────────────────────
// 수명 링 게이지의 '연속 색' 단일 출처. 앱의 4단계 컨디션 토큰(GOOD/WARN/DANGER)은
// 배지·경고의 '이산' 상태를 말하고, 링은 소진율을 '연속'으로 물들여 인스타 스토리처럼
// 선명하게 보여준다(디자인 승인값). 파랑→초록→노랑→빨강으로 hue 를 보간한다.
//
// 화면 raw-hex 0 원칙 유지를 위해 링 색 계산은 전부 이 파일에 가둔다. 화면은
// ringColor(percentUsed) 만 부르고, 반환된 {from,to,glow,solid} 를 SVG/뷰에 꽂는다.

export type RingColor = {
  from: string;  // 그라데이션 시작(밝은 쪽)
  to: string;    // 그라데이션 끝(진한 쪽) — 상태 점/글로우 기준색
  glow: string;  // drop-shadow 근접 글로우
  bloom: string; // drop-shadow 확산 블룸
  solid: string; // 단색이 필요할 때(칩 점 등)
};

// 소진율(%) → hue(deg). 0%=시안블루(202) → 33%=그린(145) → 66%=옐로(45) → 100%=레드(356).
function hueAt(pct: number): number {
  const stops: [number, number][] = [[0, 202], [33.33, 145], [66.66, 45], [100, -4]];
  const p = Math.max(0, Math.min(100, pct));
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) {
      const t = (p - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return stops[i - 1][1] + (stops[i][1] - stops[i - 1][1]) * t;
    }
  }
  return -4;
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

/** 소진율(%) → 링 색 세트. 100% 초과는 100 으로 클램프(색은 완전 레드에서 멈춤). */
export function ringColor(percentUsed: number): RingColor {
  const hue = hueAt(percentUsed);
  const solid = hslToHex(hue, 0.95, 0.56);
  return {
    from: hslToHex(hue, 1, 0.66),
    to: hslToHex(hue, 1, 0.47),
    glow: rgba(solid, 0.9),
    bloom: rgba(solid, 0.5),
    solid,
  };
}
