// ============================================================================
// theme.ts — Keego design tokens (React Native, bare RN 0.85)
// ============================================================================
import type {RankTier} from './lib/progression/types';

// 색 토큰은 디자인 마무리 핸드오프(keego-rn/theme.js) 값 그대로:
// bg #0A0A0A · card #141414 · card2 #171717. (이전 순흑 #000 + #161618 보다 사진과 정합)
export const BG = '#0A0A0A';
export const CARD = '#141414';           // 기본 카드(상세·기록·마이 등) = 디자인 card
export const CARD_HI = '#232326';        // raised surface (chips / pressed) — card2 보다 약간 위
// 카드 배경(앱 전역 '어두운 카드') = 디자인 card #141414. 한 토큰이 홈·신발·기록·마이·등록 카드를 좌우.
export const CARD_DIM = '#141414';       // recessed card = 디자인 card
export const HERO_BG = '#171717';        // selected/featured card surface = 디자인 card2
export const ACCENT = '#FF6500';
export const ACCENT_2 = '#FF9F4A';       // gradient top stop
export const GRAD_TOP = '#FF7A2E';       // button CTA gradient top stop
export const GRAD_BOT = '#F25E00';       // button CTA gradient bottom stop
// 상태색 — 디자인 마무리 핸드오프(theme.js) 값 그대로: good/warn/danger.
export const WARN = '#E6A23C';
export const DANGER = '#FF5A45';
export const GOOD = '#46C98B';           // healthy condition dot (핸드오프 good)
export const T1 = '#FFFFFF';
export const T2 = '#EBEBF5';
// Tertiary/secondary text. Lifted from iOS systemGray(#8E8E93) to #9C9CA3 so the
// smallest captions clear WCAG AA contrast on the dark surfaces (CARD/BG): ~5.2→
// ~6.3:1 on CARD. Still clearly a muted secondary tone (dark direction intact).
export const T3 = '#9C9CA3';
// Quaternary text — dimmer than T3 for the faintest captions/units (sub-metric
// 단위·라벨, 빈 GPS 바). 다크 표면에서 보조 정보 위계의 가장 약한 톤.
export const T4 = '#54545b';
export const SEP = 'rgba(255,255,255,0.07)';  // 핸드오프 line

// ── 소셜 로그인 브랜드 색 (외부 브랜드 고정값) ────────────────────────────────────
// 카카오/네이버 공식 브랜드 컬러는 바꿀 수 없는 외부 값이라 토큰으로 모아 둔다(화면
// 코드의 raw hex 0 원칙 유지 — 화면은 이 토큰만 참조).
export const KAKAO_YELLOW = '#FEE500';
export const KAKAO_LABEL = '#000000';
export const NAVER_GREEN = '#03C75A';
export const NAVER_LABEL = '#FFFFFF';

// ── 은퇴 키프세이크 카드(Midnight) 팔레트 ──────────────────────────────────────
// 디자인 마무리 핸드오프(keego-rn/components/RetirementCard.js)의 'Midnight + 배웅' 카드
// 전용 색. 일반 다크 표면(BG/CARD)과 다른 보랏빛 무드라 별도 토큰으로 모아 둔다(카드만 참조).
export const RETIRE_MIDNIGHT_BG = '#130B11';     // 카드 배경(미드나잇 자줏빛 블랙)
export const RETIRE_MIDNIGHT_GLOW = '#3A1430';   // 상단 radial 글로우
// 거리/배웅 그라데이션 스톱(웜오렌지→코랄→바이올렛). 카드 GradientText 가 소비.
export const RETIRE_GRAD_STOPS: readonly string[] = ['#FFB060', '#FF6C7E', '#B57BFF'];

// ── rank tier colors (progression Slice A — AUTHORITATIVE) ───────────────────
// 합성 랭크 티어 색. 진척 엔진/칩/링은 이 토큰만 참조한다(화면·lib 하드코딩 금지).
// 값은 spec 권위표: Bronze→Legend. Legend = KEEGO 오렌지(#FF6500, ACCENT 와 동일 의도).
// 키 타입은 lib/progression/types 의 RankTier 를 직접 import(타입 전용)해 컴파일타임
// 완전성(exhaustiveness)을 강제한다 — 티어가 추가되면 여기서 키 누락이 타입 에러로 잡힌다.
// types.ts 는 아무것도 import 하지 않으므로 순환 의존은 발생하지 않는다.
export const TIER_COLORS: Record<RankTier, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#14B8A6',
  diamond: '#3B82F6',
  master: '#9333EA',
  legend: '#FF6500',
};

// 티어 표시명(영문 — 본문/라벨은 한국어, 티어명만 영문. PS Trophies/WHOOP 관용).
// AUTHORITATIVE 단일 정의: 홈·프로필·진척 화면이 각자 복붙하던 것을 여기로 통합한다
// (TIER_COLORS 와 동일 위계 — 색·라벨 모두 theme 권위, 화면 하드코딩 0). 키 타입은
// RankTier 라 티어가 추가되면 누락이 컴파일타임에 잡힌다.
export const TIER_LABEL: Record<RankTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
  master: 'Master',
  legend: 'Legend',
};

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
// 디자인 마무리 핸드오프 정합: 큰 숫자·모델명·워드마크를 본문과 같은 Pretendard 로 통일
// (사진의 숫자가 Barlow 그로테스크가 아니라 Pretendard). 과거 Barlow 디스플레이 대비는
// 사용자 요청('큰 숫자도 사진이랑 통일')으로 철회. 토큰 하나로 앱 전역 디스플레이 폰트를 좌우.
export const DISPLAY = 'PretendardVariable';

// ── spacing scale (dp) ───────────────────────────────────────────────────────
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 } as const;
export type SpaceKey = keyof typeof SPACE;

// ── corner radius scale (dp) ─────────────────────────────────────────────────
// btn 은 단일 CTA(Button 프리미티브) 모서리 — 과거 화면마다 14/16/18/999 로 흩어져
// 있던 버튼 radius 를 이 한 토큰(18)으로 통일한다(시각: 다크+오렌지 동등 유지).
export const RADIUS = { sm: 12, md: 16, btn: 18, lg: 20, xl: 24, pill: 999 } as const;
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
  // per-km 구간 스플릿(레코더가 1km 통과 시각으로 기록). 없으면 RunSplits 자동 숨김.
  splits?: { km: number; paceSec: number; elevM: number }[];
};

// Fallback used only when a screen is rendered without data (kept empty so no
// fake data ever shows in the real app).
export const SHOES: Shoe[] = [];
