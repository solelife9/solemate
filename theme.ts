// ============================================================================
// theme.ts — Keego design tokens (React Native, bare RN 0.85)
// ============================================================================
import type {RankTier} from './lib/progression/types';
// 반응형 스케일 — 폰트/hero 사이즈를 기기 폭에 비례해 스케일한다(기준 iPhone 15 Pro=원본).
// jest 에선 항등(원본값)이라 크기 단언 테스트 불변. import { rf } from './lib/responsive'.
import {rf} from './lib/responsive';
import {Easing} from 'react-native';

// ── 하위호환 재수출 (분리된 모듈을 theme 통해 계속 접근) ────────────────────────
// 화면 전용 키프세이크 팔레트 → theme.palettes.ts, 도메인 타입/데이터 → appTypes.ts
// 로 분리(디자인 토큰 파일 슬림화, 2026-07-09). 85개 화면의 `from './theme'` import 를
// 깨지 않도록 여기서 그대로 재수출한다(단일 진입점 유지).
export * from './theme.palettes';
export type {Shoe, Run} from './appTypes';
export {SHOES} from './appTypes';

// 색 토큰은 디자인 마무리 핸드오프(keego-rn/theme.js) 값 그대로:
// bg #0A0A0A · card #141414 · card2 #171717. (이전 순흑 #000 + #161618 보다 사진과 정합)
export const BG = '#0A0A0A';
// 카드 표면을 애플 헬스 수준(secondary #1C1C1E)으로 올려 검정 배경과 또렷이 구분되게 한다
// (기존 #141414 는 BG #0A0A0A 와 거의 같아 카드가 안 보였다). 홈·신발·기록·마이·등록 공통.
export const CARD = '#1C1C1E';           // 기본 카드(상세·기록·마이 등) — 애플헬스 secondary
export const CARD_HI = '#2C2C2E';        // raised surface (chips / pressed) — 애플헬스 tertiary
export const CARD_DIM = '#1C1C1E';       // recessed card = CARD 와 통일
export const HERO_BG = '#242426';        // selected/featured card surface (CARD 보다 한 단 위)
// 무채 글래스 베이스, 브랜드 색은 러닝 링(RING_ACCENT*)에만; 그 외 강조는 무채(흰/회).
// 색은 의미에만(2026-07-09 재확정). 브랜드색이 앱 전역에 남발되면 시끄럽다는 피드백 →
// Apple/WHOOP식(흰=강조, 색=의미)으로 회수. ACCENT/ACCENT_2/GRAD_* 는 이제 무채값이라
// 기존 소비부(비-링)는 자동으로 흰/회로 내려앉는다. 브랜드색은 아래 RING_ACCENT* 셋으로만 생존.
// 값 = Keego Ember(밝게 시작 → 진하게 마감 그라데이션 — BRAND.md §4).
export const RING_ACCENT = '#FF8000';        // Keego Ember (러닝 링 유일 브랜드 색)
export const RING_ACCENT_HI = '#FFB458';     // 링 그라데이션 top(밝은 파파야)
export const RING_ACCENT_LO = '#E56600';     // 링 그라데이션 bottom(진한 파파야)

// ── 러닝 링 지오메트리/그라데이션 단일 토큰(2026-07-16 사용자 지적 "링 4개가 색도
// 크기도 제각각") — 카운트다운 → 러닝 중 → 완주 세리머니가 '같은 링 하나'로 읽히게
// 세 화면이 이 토큰만 소비한다. size 는 소비처에서 ri() 적용. 홈 링은 신발 컨디션
// 게이지(색=의미)라 제외 — 파파야로 바꾸면 상태 정보가 죽는다.
export const RUN_RING_SIZE = 280;
export const RUN_RING_STROKE = 16;
export const RUN_RING_STOPS: readonly [string, string, string] = [RING_ACCENT_HI, RING_ACCENT, RING_ACCENT_LO];

// ── 선형 진행바 두께(단일 진실원 — 검수 수렴 2026-07-17) ────────────────────────
// 화면마다 3/4/5/6/8 로 흩어져 있던 바 두께를 세 단으로: thin=보조 미니바(카드 안 작은
// 게이지) · md=표준 진행바(리스트·상세) · gauge=히어로 연료 게이지(FuelGauge 전용).
// 소비처에서 rs() 적용. 슬라이더(입력 컨트롤) 트랙은 진행바가 아니라 제외.
export const BAR = {thin: 4, md: 6, gauge: 14} as const;
// ── 브랜드 액센트 확장(2026-07-09 사용자 확정 — 목업 'B 서명+진행') ─────────────
// 파파야를 링 밖으로: ① 브랜드 서명(keego 워드마크) ② 러닝 에너지·진행 지표(주간
// 목표 게이지 등)에 포인트로 쓴다. "스포츠앱인데 너무 조용하다" 피드백의 절제된 해답.
// 가드레일: 넓은 면(버튼 채움·카드 배경) 금지 · 상태색(GOOD/WARN/DANGER) 대체 금지 ·
// 한 시야에 파파야 포인트는 소수만. 값은 RING_ACCENT 와 동일(브랜드색 단일 진실원).
export const BRAND = RING_ACCENT;
export const ACCENT = '#FFFFFF';         // 무채 강조 = 흰(모노크롬 시스템)
export const ACCENT_2 = '#EBEBF5';       // gradient/보조 강조 top stop (밝은 무채)
export const GRAD_TOP = '#EBEBF5';       // CTA/그라데이션 top (무채)
export const GRAD_BOT = '#C7C7CC';       // CTA/그라데이션 bottom (무채 회색)
// 상태색 — 디자인 마무리 핸드오프(theme.js) 값 그대로: good/warn/danger.
export const WARN = '#E6A23C';
export const DANGER = '#FF5A45';
export const GOOD = '#46C98B';           // healthy condition dot (핸드오프 good)
export const BEST = '#4A9FF0';           // 최상 컨디션 파란색
export const SPORT_VIOLET = '#7C3AED';   // 스포티 일렉트릭 바이올렛(주간목표 '도전' 난이도)
// 다크 14% 틴트 위에서 SPORT_VIOLET 원색은 획이 묻힌다 → 한 톤 밝힌 소프트 변주(온보딩
// 트랙 모드 아이콘 · 목업 확정). 원색과 별개 값이라 별도 토큰으로 둔다(화면은 이것만 참조).
export const SPORT_VIOLET_SOFT = '#9B6DF3';
export const T1 = '#FFFFFF';
export const T2 = '#EBEBF5';
// Tertiary/secondary text. Lifted from iOS systemGray(#8E8E93) to #9C9CA3 so the
// smallest captions clear WCAG AA contrast on the dark surfaces (CARD/BG): ~5.2→
// ~6.3:1 on CARD. Still clearly a muted secondary tone (dark direction intact).
export const T3 = '#9C9CA3';
// Quaternary text — dimmer than T3 for the faintest captions/units (sub-metric
// 단위·라벨, 빈 GPS 바). 다크 표면에서 보조 정보 위계의 가장 약한 톤.
export const T4 = '#54545b';
// 순수 검정 — 셰이딩/그림자 프리미티브(메달 3D 모델링의 그늘 알파 스톱 등) 단일 토큰.
// 표면 배경은 BG(#0A0A0A)를 쓰고, 이 토큰은 오직 셰이딩·그림자 알파 스톱에만 쓴다.
export const BLACK = '#000000';
export const SEP = 'rgba(255,255,255,0.07)';  // 핸드오프 line
// 카드/세그먼트 보더 단일 토큰. 과거 화면마다 SEP · withAlpha(T1,0.07) · borderWidth 1
// vs hairline 으로 흩어져 있던 카드 외곽선을 이 한 토큰으로 통일한다. 값은 SEP 과 동일한
// 흰색 7% 알파라 시각 동등(T1=#FFFFFF → withAlpha(T1,0.07)===SEP). 토큰을 바꾸면 앱 전역
// 카드 외곽선이 함께 따라간다(단일 진실원).
export const CARD_BORDER = withAlpha(T1, 0.07);

// ── 글라스 재질 (2026-07-09 사용자 확정 — 목업 'B 대각 밸런스') ────────────────
// 애플 유리 문법: 반투명 표면 + 전 둘레 헤어라인 + 코너 글린트(좌상 주광·우하 반사).
// 표면 채움은 흰 알파(배경 위에 '유리판이 얹힌' 인상), 활성은 채움/림을 한 단 올린다
// (굵은 활성 보더 폐지 — 상태는 재질로 말한다). 값은 primitives.GlassEdge 가 소비하는
// 단일 진실원: 여기를 바꾸면 앱 전역 유리가 함께 따라간다.
export const GLASS = {
  // 표면 밝기 상향(2026-07-10 기기 피드백): 흰 5%는 순흑 위에서 구 CARD(#1C1C1E)보다
  // 어두워, 화면 밝기가 낮으면 카드가 배경에 묻혔다. 8%(≈#1D1D21, 애플헬스 secondary 급)
  // 로 올리고 활성/CTA 도 같은 간격(+3%p/+4%p)으로 상향 — 위계 유지.
  fill: withAlpha(T1, 0.08),        // 기본 카드 표면
  fillActive: withAlpha(T1, 0.11),  // 활성/히어로 표면(+0.03)
  fillCta: withAlpha(T1, 0.12),     // CTA 버튼 표면(가장 밝음 + 글린트)
  // 배광(2026-07-09): 우상/좌하 글린트 폐지(0) — 주광(좌상)·반사(우하)에서 멀어질수록
  // 변을 따라 길게 자연 감쇠. 베이스 헤어라인 0.2(2026-07-11 확정): 신발탭 '사용중'
  // 카드가 쓰던 시감(구 0.07×intensity 2.85≈0.2)을 전 카드 표준으로 승격 — 카드별
  // intensity 차등 없이 폰 전 화면 카드가 이 한 값의 헤어라인을 공유한다(단일 진실원).
  // 글린트는 그 위에 얹히는 빛. (내부 구분선/세그먼트 보더는 별도 CARD_BORDER 0.07.)
  edgeBase: 0.2,                    // 전 둘레 헤어라인 — 구 '사용중' 카드 시감(흰 20%)
  edgeTL: 0.3,                      // 좌상 코너 주광
  edgeTR: 0,                        // 우상 — 글린트 없음(주광 감쇠의 끝)
  edgeBR: 0.24,                     // 우하 코너 반사(주광과 대각 밸런스)
  edgeBL: 0,                        // 좌하 — 글린트 없음(반사 감쇠의 끝)
  sheen: 0.035,                     // 상단 안쪽 광택(아래로 42% 지점까지 소멸)
  activeIntensity: 1.2,             // 활성 카드 림 배율 — 1.5는 두께처럼 읽힘(기기 피드백 07-11)
} as const;

// ── 소셜 로그인 브랜드 색 (외부 브랜드 고정값) ────────────────────────────────────
// 카카오/네이버 공식 브랜드 컬러는 바꿀 수 없는 외부 값이라 토큰으로 모아 둔다(화면
// 코드의 raw hex 0 원칙 유지 — 화면은 이 토큰만 참조).
export const KAKAO_YELLOW = '#FEE500';
export const KAKAO_LABEL = '#000000';
export const NAVER_GREEN = '#03C75A';
export const NAVER_LABEL = '#FFFFFF';

// ── rank tier colors (progression Slice A — AUTHORITATIVE) ───────────────────
// 합성 랭크 티어 색. 진척 엔진/칩/링은 이 토큰만 참조한다(화면·lib 하드코딩 금지).
// 값은 spec 권위표: Bronze→Legend. Legend = 골드/오렌지(#FF6500) — 성취 도메인 전용(브랜드 액센트 아님).
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

// ── 업적 희귀도 색(common→legendary) ──────────────────────────────────────────
// 셀러브레이션/업적 배지의 희귀도 색. TIER_COLORS 와 같은 위계의 시맨틱 세트 —
// App/화면은 이 토큰만 참조한다(라벨 'ko'는 소비부가 소유). 값은 기존 확정 팔레트 그대로.
export const RARITY_COLORS = {
  common: '#9A9A9A',
  rare: '#4B93F7',
  epic: '#A468F0',
  legendary: '#E7B84B',
} as const;

// 심박 존(Z1–Z5) 색 — 회복(파랑)→유산소(초록)→템포(노랑)→역치(주황)→무산소(빨강).
// 기존 컨디션 토큰 재사용(BEST/GOOD/DANGER) + 중간 2색만 신규. 화면은 이 토큰만 참조한다.
export const HR_ZONE_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: BEST,
  2: GOOD,
  3: '#E6C34C',
  4: '#F0872E',
  5: DANGER,
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

// ── NUM face: 큰 숫자 전용 지오메트릭 디스플레이(Jost — Futura 계열, 2026-07-14 탐색) ──
// 사용자 결정: 타이포 개성을 위해 '큰 숫자만' 별도 지오메트릭 폰트로. 본문·라벨·모델명은
// DISPLAY(Pretendard) 유지. 러닝 링·리캡 히어로 등 초대형 숫자에만 NUM 을 쓴다.
// (상용 Aveny-T 후보의 무료 대체 = Jost. 라이선스 OFL, assets/fonts/Jost.ttf 번들.)
export const NUM = 'Jost';

// ── spacing scale (dp) ───────────────────────────────────────────────────────
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 } as const;
export type SpaceKey = keyof typeof SPACE;

// ── corner radius scale (dp) ─────────────────────────────────────────────────
// btn 은 단일 CTA(Button 프리미티브) 모서리 — 과거 화면마다 14/16/18/999 로 흩어져
// 있던 버튼 radius 를 이 한 토큰(18)으로 통일한다(시각: 다크+오렌지 동등 유지).
// input(14): 입력/소형 컨트롤(스텝퍼 버튼·필드) — 전 화면에서 raw 14 로 반복되던
// 사실상의 표준을 토큰으로 승격(2026-07-04 디자인 시스템 감사).
// hero(34): 홈 히어로 카드 전용 최대 라운드 — 화면 리터럴 34가 스케일 밖에 살던 것을
// 정식 단계로 승격(2026-07-25 민우님 확정). 히어로급 대형 카드 외 사용 금지.
export const RADIUS = { sm: 12, input: 14, md: 16, btn: 18, lg: 20, xl: 24, hero: 34, pill: 999 } as const;
export type RadiusKey = keyof typeof RADIUS;

// ── type scale ───────────────────────────────────────────────────────────────
// Presets bundle size / weight / letterSpacing so a screen can spread one token
// into a Text style: <Text style={[{ fontFamily: FONT }, TYPE.body]} />. Weights
// are RN fontWeight string literals so they stay assignable to TextStyle.
export type TypePreset = {
  fontSize: number;
  // '800' 승격(2026-07-24 정본 결정): DESIGN "800 헤딩"이 토큰으로 표현 불가해 화면
  // 7곳이 리터럴 '800' 유령 위계를 만들던 모순 해소 — 탭 타이틀 급이 정식으로 쓴다.
  fontWeight: '400' | '500' | '600' | '700' | '800';
  letterSpacing: number;
};
// 본문 위계 타입 스케일(≤ display 33). 모든 사이즈는 정수 — 화면들이 흩어 쓰던 반px
// (11.5/12.5/13.5/14.5/16.5 …)은 이 정수 스케일로 수렴한다(반올림 ≤0.5px = 시각 동등).
// 2026-07-08 전역 +1 상향(나이키 대비 작다는 피드백) — 이 스케일이 '살짝 키운' 새 기준.
export const TYPE = {
  display: { fontSize: rf(33), fontWeight: '500', letterSpacing: -0.8 },
  // title1(27) — 화면 인라인 타이틀·히어로 모델명 급(Apple Title1). 2026-07-09 타이포
  // 수렴 스윕에서 추가: 실사용이 25~29 에 밀집하는데 title(23)↔display(33) 사이가
  // 비어 있어 스케일 밖 하드코딩을 유발했다. 이 한 단계로 그 구간 전부를 수렴한다.
  title1:  { fontSize: rf(27), fontWeight: '700', letterSpacing: -0.6 },
  title:   { fontSize: rf(23), fontWeight: '600', letterSpacing: -0.4 },
  heading: { fontSize: rf(18), fontWeight: '600', letterSpacing: -0.2 },
  body:    { fontSize: rf(16), fontWeight: '500', letterSpacing: -0.2 },
  label:   { fontSize: rf(14), fontWeight: '500', letterSpacing: 0.2 },
  caption: { fontSize: rf(13), fontWeight: '500', letterSpacing: 0.2 },
  micro:   { fontSize: rf(11), fontWeight: '600', letterSpacing: 0.8 },
} as const satisfies Record<string, TypePreset>;
export type TypeKey = keyof typeof TYPE;

// ── hero display sizes (대형 숫자/타이머 — TYPE 스케일 위 영역) ─────────────────
// TYPE 프리셋(≤ display 33)보다 큰 '명명된 hero 사이즈'. 런 타이머·카운트다운·대형
// 통계 숫자가 화면마다 raw 로 흩어 쓰던 40/56/76 을 이 단일 스케일로 모은다. TYPE 와
// 분리한 이유: TYPE.display 가 '본문 최대' 위계를 유지해야 하기 때문(theme.test 의
// display=max(TYPE) 계약). 화면은 이 토큰을 참조해 대형 숫자를 단일 소스로 둔다.
export const HERO = { hero: rf(40), heroLg: rf(56), mega: rf(76) } as const;
export type HeroKey = keyof typeof HERO;

// ── 터치 타깃 (HIG 44pt — 협상 불가) ──────────────────────────────────────────
// 인터랙티브 요소의 최소 실효 크기(크기 + 2×hitSlop ≥ 44). 화면들이 각자 26/34/38pt
// 로 미달하던 것을 이 상수 기준으로 보정한다(2026-07-24 접근성 심사 정본 승격).
export const TOUCH_TARGET = 44;

// ── 행간(leading) 램프 ────────────────────────────────────────────────────────
// lineHeight = fontSize × 배수. TYPE 에 행간이 없어 화면 75곳이 각자 발명하던 것의
// 단일 진실원(2026-07-24 정본 승격). display=큰 숫자/타이틀(빽빽하게 — Jost 어센더
// 잘림 하한 1.22 겸용), ui=라벨/버튼, body=본문 문단(다크 위 판독성).
export const LEADING = {display: 1.22, ui: 1.3, body: 1.45} as const;

// ── 그림자 스케일 ─────────────────────────────────────────────────────────────
// "살짝 뜨는 정도까지만"(DESIGN §2)의 세 단. 화면 수제 그림자 3벌(홈 히어로·토스트·
// 탭바 독)을 승인값 그대로 토큰화(2026-07-24) — 신규 그림자는 이 셋 중에서만 고른다.
export const SHADOW = {
  /** 카드 부양(홈 히어로 승인값) — 유리 카드가 배경에서 살짝 뜨는 정도. */
  float: {shadowColor: BLACK, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: {width: 0, height: 6}, elevation: 6},
  /** 오버레이(토스트 등) — 콘텐츠 위에 떠 있음을 알리는 한 단 깊은 그림자. */
  overlay: {shadowColor: BLACK, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: {width: 0, height: 4}, elevation: 6},
  /** 하단 독(탭바 승인값) — 화면 가장 깊은 부양. BG 색 그림자로 유리 톤 유지. */
  dock: {shadowColor: BG, shadowOpacity: 0.7, shadowRadius: 20, shadowOffset: {width: 0, height: 14}, elevation: 14},
} as const;

// ── screen gutter (화면 좌우 거터 단일 토큰) ───────────────────────────────────
// 화면마다 14/18/20/22 로 흩어져 있던 좌우 거터(스크린 가장자리 패딩)를 단일 토큰으로
// 모은다. 값 20 = 기존 최빈 거터라 대표 화면들의 가장자리 패딩이 픽셀 그대로 유지된다
// (시각 동등). 토큰 하나를 바꾸면 채택한 화면 거터가 함께 따라간다(단일 진실원).
export const GUTTER = 20;

// ── scrim (모달/시트 뒤 배경 딤) ───────────────────────────────────────────────
// 모달·바텀시트 뒤를 어둡게 까는 반투명 검정. 화면들이 각자 복제하던 rgba(0,0,0,0.6)
// 리터럴을 이 단일 토큰으로 모은다(값 동일 → 시각 동등).
export const SCRIM = 'rgba(0,0,0,0.6)';

// ── 모션 (단일 진실원 — DESIGN §6) ─────────────────────────────────────────────
// 화면마다 420/300/260/150/650 으로 흩어져 있던 전환 시간·커브·누름 피드백을 한 곳에
// 모은다(#6 모션 전환 통일의 뿌리). 시그니처 = 사용자 확정 '나이키 문법' 일시정지 시트
// (420ms · inOut-cubic). 값은 기존 최빈값이라 채택 화면의 감각이 픽셀·타이밍 그대로 유지된다.
export const MOTION = {
  /** 전환 시간(ms). */
  dur: {fast: 150, base: 300, sheet: 420, sweep: 650, fill: 1400},
  /** 이징 커브. */
  ease: {
    out: Easing.out(Easing.cubic), // 진입·링 — 도착을 부드럽게
    inout: Easing.inOut(Easing.cubic), // 시트·전환 — 양끝 대칭(시그니처)
    quad: Easing.out(Easing.quad), // 페이드·짧은 반응
  },
  /** 화면 진입 Rise — 아래에서 dy 만큼 떠오르며 페이드인. */
  rise: {dy: 14, dur: 420},
  /** 누름 표준(DESIGN §6 — scale 0.97 + 살짝 딤). 글로우/네온 금지. */
  press: {scale: 0.97, opacity: 0.92},
} as const;
