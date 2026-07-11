// ============================================================================
// appTypes.ts — 공유 도메인 타입/데이터 (핸드오프 화면들이 쓰는 표현형 shape)
// theme.ts 에서 분리(디자인 토큰과 도메인 타입 분리). 하위호환을 위해 theme.ts 가
// 이 타입/값을 그대로 재수출하므로, 기존 `from './theme'` import 는 계속 동작한다.
// ============================================================================

export type Shoe = {
  id?: string;          // backend id (optional for pure-UI usage)
  brand: string;
  model: string;
  used: number;
  max: number;
  // 컨디션 필드 없음(2026-07-11 4단계 단일화): 라벨/색은 화면이 used/max 사용률로
  // lib/shoe.wearTier(4단계)를 파생한다. 구 3단계 condition('양호'|'주의'|'교체')은
  // 워치 구버전 계약(WatchShoePayload.condition)에만 남아 App 이 직접 파생한다.
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
  shoeName?: string; // 신발명(삭제 신발 포함) — 공유 카드 폴백(인덱스로 못 찾을 때)
  cal: number;
  cadence: number;
  bpm: number;
  elev: number;
  // 편집 폼 프리필용 원본 값(표시 파생값과 별개). 거리는 dist(km)에 이미 있고,
  // 날짜는 'YYYY-MM-DD' 저장 표준, 시간은 초(duration)로 보존한다.
  runDate?: string;  // 'YYYY-MM-DD' (run_date 원본)
  durationS?: number; // 소요 시간(초, duration 원본)
  memo?: string;      // 러닝 한 줄 메모(리캡에서 입력, 레코드 동기 — 2026-07-05)
  // per-km 구간 스플릿(레코더가 1km 통과 시각으로 기록). 없으면 RunSplits 자동 숨김.
  splits?: { km: number; paceSec: number; elevM: number }[];
};

// Fallback used only when a screen is rendered without data (kept empty so no
// fake data ever shows in the real app).
export const SHOES: Shoe[] = [];
