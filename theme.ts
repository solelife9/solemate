// ============================================================================
// theme.ts — SoleMate design tokens (React Native, bare RN 0.85)
// ============================================================================
export const BG = '#000000';
export const CARD = '#1C1C1E';
export const CARD_HI = '#2C2C2E';        // raised surface (chips / pressed)
export const CARD_DIM = '#0D0D0D';       // recessed card (idle picker etc.)
export const HERO_BG = '#161618';        // selected/featured card surface
export const ACCENT = '#FF6500';
export const ACCENT_2 = '#FF9F4A';       // gradient top stop
export const WARN = '#FF9F0A';
export const DANGER = '#FF453A';
export const GOOD = '#30D158';           // healthy condition dot
export const T1 = '#FFFFFF';
export const T2 = '#EBEBF5';
// Tertiary/secondary text. Lifted from iOS systemGray(#8E8E93) to #9C9CA3 so the
// smallest captions clear WCAG AA contrast on the dark surfaces (CARD/BG): ~5.2→
// ~6.3:1 on CARD. Still clearly a muted secondary tone (dark direction intact).
export const T3 = '#9C9CA3';
export const SEP = 'rgba(255,255,255,0.08)';

// ── 소셜 로그인 브랜드 색 (외부 브랜드 고정값) ────────────────────────────────────
// 카카오/네이버 공식 브랜드 컬러는 바꿀 수 없는 외부 값이라 토큰으로 모아 둔다(화면
// 코드의 raw hex 0 원칙 유지 — 화면은 이 토큰만 참조).
export const KAKAO_YELLOW = '#FEE500';
export const KAKAO_LABEL = '#000000';
export const NAVER_GREEN = '#03C75A';
export const NAVER_LABEL = '#FFFFFF';

// ── alpha helper ─────────────────────────────────────────────────────────────
// Derive a translucent fill from an existing #RRGGBB token so semi-transparent
// surfaces (e.g. badge backgrounds) stay a single source of truth: change the
// hex token and every withAlpha() consumer follows. Avoids hand-copied rgba()
// literals that silently desync from the colour they were cloned from.
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) {
    throw new Error(`withAlpha: expected #RRGGBB, got "${hex}"`);
  }
  const rgb = m[1];
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Font family names as actually loaded in this project (assets/fonts + Info.plist).
export const FONT = 'PretendardVariable';  // body

// ── DISPLAY face: 본문(Pretendard)과 대비를 주는 디스플레이 폰트 ─────────────────
// 큰 숫자(km·%·페이스)와 Keego 워드마크엔 스포티 그로테스크 Barlow를 쓴다. 한글/본문은
// FONT(Pretendard)가 담당하므로 Barlow는 라틴·숫자 전용으로 안전하다.
// 히스토리: 초기 BebasNeue → Slice3에서 Pretendard로 통일 → 통일이 밋밋해 Barlow
// 디스플레이로 타이포 대비를 복원(2026-06-02). 두 폰트 모두 assets/fonts에 번들됨.
export const DISPLAY = 'Barlow-Medium';

// ── spacing scale (dp) ───────────────────────────────────────────────────────
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 } as const;
export type SpaceKey = keyof typeof SPACE;

// ── corner radius scale (dp) ─────────────────────────────────────────────────
export const RADIUS = { sm: 12, md: 16, lg: 20, xl: 24, pill: 999 } as const;
export type RadiusKey = keyof typeof RADIUS;

// ── type scale ───────────────────────────────────────────────────────────────
// Presets bundle size / weight / letterSpacing so a screen can spread one token
// into a Text style: <Text style={[{ fontFamily: FONT }, TYPE.body]} />. Weights
// are RN fontWeight string literals so they stay assignable to TextStyle.
export type TypePreset = {
  fontSize: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing: number;
};
export const TYPE = {
  display: { fontSize: 32, fontWeight: '500', letterSpacing: -0.8 },
  title:   { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  heading: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  body:    { fontSize: 15, fontWeight: '500', letterSpacing: -0.2 },
  label:   { fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },
  caption: { fontSize: 12, fontWeight: '500', letterSpacing: 0.2 },
  micro:   { fontSize: 10, fontWeight: '600', letterSpacing: 0.8 },
} as const satisfies Record<string, TypePreset>;
export type TypeKey = keyof typeof TYPE;

// ── shared UI types (presentational shapes used by the handoff screens) ───────
export type Shoe = {
  id?: string;          // backend id (optional for pure-UI usage)
  brand: string;
  model: string;
  used: number;
  max: number;
  // Proportional wear tier — see lib/shoe.ts shoeHealth (audit#7).
  condition: '양호' | '주의' | '교체';
  retired?: boolean;    // archived: hidden from run pickers, records preserved
  photoUri?: string;    // local image-picker URI (optional; absent = no photo)
};

export type Run = {
  id?: string;
  date: string;   // "5월 28일"
  day: string;    // "수"
  dateNum: string; // "28"
  dist: number;
  pace: string;   // "5'02\""
  time: string;   // "40:41"
  shoe: number;   // index into shoes[]
  cal: number;
  cadence: number;
  bpm: number;
  elev: number;
  // 편집 폼 프리필용 원본 값(표시 파생값과 별개). 거리는 dist(km)에 이미 있고,
  // 날짜는 'YYYY-MM-DD' 저장 표준, 시간은 초(duration)로 보존한다.
  runDate?: string;  // 'YYYY-MM-DD' (run_date 원본)
  durationS?: number; // 소요 시간(초, duration 원본)
};

// Fallback used only when a screen is rendered without data (kept empty so no
// fake data ever shows in the real app).
export const SHOES: Shoe[] = [];
