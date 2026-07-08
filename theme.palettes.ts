// ============================================================================
// theme.palettes.ts — 화면 전용(키프세이크) 팔레트
// theme.ts 의 '일상 UI 디자인 토큰'과 분리한, 특정 화면만 쓰는 무드 팔레트.
// (은퇴 카드 · 명예의 전당 · 셀러브레이션 메달 · 온보딩 카드) 하위호환을 위해
// theme.ts 가 이 모듈을 그대로 재수출한다 — 기존 `from './theme'` import 계속 동작.
// 값은 raw 고정색이라 코어 토큰 의존이 없다(반투명 톤은 소비 화면에서 withAlpha 파생).
// ============================================================================

// ── 은퇴 키프세이크 카드(Midnight) 팔레트 ──────────────────────────────────────
// 'Midnight + 배웅' 카드 전용. 일반 다크 표면(BG/CARD)과 다른 보랏빛 무드(카드만 참조).
export const RETIRE_MIDNIGHT_BG = '#130B11';     // 카드 배경(미드나잇 자줏빛 블랙)
export const RETIRE_MIDNIGHT_GLOW = '#3A1430';   // 상단 radial 글로우
// 거리/배웅 그라데이션 스톱(웜오렌지→코랄→바이올렛). 카드 GradientText 가 소비.
export const RETIRE_GRAD_STOPS: readonly string[] = ['#FFB060', '#FF6C7E', '#B57BFF'];

// ── 명예의 전당 '식장' 팔레트(웜골드 온 니어블랙) ──────────────────────────────
// HallOfShoes(은퇴 전당) 전용 무드 — 따뜻한 골드가 근검정 위에 놓인 '식장' 분위기.
// HALL_GOLD(#D8B872) = 인증서 빅넘버·전당 본문 공용 샴페인 골드(단일 골드로 통합
// 2026-07-09: 과거 본문용 HALL_GOLD_2(#D6B478)는 2 hex 차 시각 동일이라 이 값으로 통합).
// muted/faint/soft/line 반투명 톤은 화면에서 withAlpha 로 파생한다(단일 진실원).
export const HALL_GOLD = '#D8B872';      // 전당·인증서 골드(빅넘버 + 본문 공용)
export const HALL_BG = '#0A0908';        // 전당 배경(웜 니어블랙)
export const HALL_SURFACE = '#121110';   // 카드/표면
export const HALL_TXT = '#F3EEE3';       // 본문(웜 화이트) — muted/faint 파생 원
export const HALL_PLAQUE_BG = '#120f0b'; // 그리드 명패(plaque) 배경
export const HALL_CERT_BG = '#08070A';   // 은퇴 인증서 전체화면 배경
// 포일 빅넘버 그라데이션 스톱(밝은 금→딥 골드→밝은 금, 금박 반사). 화면 FOIL 이 소비.
export const HALL_FOIL_STOPS: readonly string[] = ['#F6E2A6', '#D0A557', '#9C7330', '#EFD590'];

// ── 셀러브레이션 메달 셰이딩(3D 모델링 보조색) ─────────────────────────────────
// 메달 하이라이트/그늘은 T1(#FFFFFF)·BLACK(#000000) 알파 스톱(코어 토큰)으로 만든다.
// 아래는 그 외 고정 보조색: 새김 페이스 배경 + 글리프 웜틴트.
export const CELEB_FACE_BG = '#141417';         // 메달 페이스(새김 홈) 딥 차콜
export const CELEB_ICON_LEGENDARY = '#F4E8C8';  // 레전더리 글리프 샴페인 웜화이트
export const CELEB_ICON_DEFAULT = '#F1EFE9';    // 일반 글리프 웜화이트

// ── 온보딩 카드 그라데이션 ─────────────────────────────────────────────────────
// 온보딩 마모곡선 카드 배경 그라데이션(상단 살짝 밝은 표면 → 하단 딥). 화면만 참조.
export const ONBOARD_CARD_GRAD_TOP = '#1A1A1F';
export const ONBOARD_CARD_GRAD_BOT = '#141417';
