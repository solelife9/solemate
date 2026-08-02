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
  max: number;          // 몸무게 반영 유효 권장수명(km) — 링/%/교체판정에 쓰는 표시값.
  maxBase?: number;     // 몸무게 반영 전 기저 권장수명(km). 수명 편집은 이 값 기준(유효값 오염 방지). 결측이면 max.
  // 컨디션 필드 없음(2026-07-11 4단계 단일화): 라벨/색은 화면이 used/max 사용률로
  // lib/shoe.wearTier(4단계)를 파생한다. 구 3단계 condition('양호'|'주의'|'교체')은
  // 워치 구버전 계약(WatchShoePayload.condition)에만 남아 App 이 직접 파생한다.
  retired?: boolean;    // archived: hidden from run pickers, records preserved
  photoUri?: string;    // local image-picker URI (optional; absent = no photo)
  // 마모/교체예측 baseline(2026-07-14 정합): 등록 시 이미 쌓여 있던 주행거리(start_km)와
  // 보유 시점(purchase_date/created_at). used(=shoeHealth) 는 이미 start_km 을 포함하는데,
  // 상세화면·알림이 이 값 없이 예측을 재계산하면 링과 모순되므로(과소평가) 표시형 Shoe 에도
  // 실어 buildWearView/forecast 가 같은 baseline 을 쓰게 한다. 결측이면 0/미보유로 안전.
  start_km?: number;      // 등록 주행거리(km) — effectiveWearKm baseline
  purchase_date?: string; // 구매/보유 시작('YYYY-MM-DD') — 시간 경과 열화 anchor
  // 구매가(원, 선택) — 원/km 계산의 분자. 결측이면 원/km를 표시하지 않는다(추측 금지).
  priceKrw?: number;
  created_at?: string;    // 등록 시각(ISO) — purchase_date 결측 시 age 폴백
};

/**
 * 러닝화 찾기·스펙 비교에 넘기는 '내 신발 한 켤레'. 표시·계산에 필요한 최소만 담는다
 * — 화면끼리 Shoe 전체를 주고받으면 무엇에 의존하는지가 흐려진다.
 */
export type MyShoeRef = {
  brand: string;
  model: string;
  usedKm: number;
  lifespanKm: number;
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
  // GPS 경로 원문(레코드 route — 클라우드 동기). RunDetail 이 route_ 사이드카 결측 시
  // 이 값으로 지도를 그린다(2026-07-24 버그픽스: toUiRun 이 이 필드를 떨어뜨려 폴백이
  // 처음부터 죽어 있었다 — 재설치로 사이드카가 지워지자 지도 전멸).
  route?: string;
  // per-km 구간 스플릿(레코더가 1km 통과 시각으로 기록). 없으면 RunSplits 자동 숨김.
  splits?: { km: number; paceSec: number; elevM: number }[];
};

// Fallback used only when a screen is rendered without data (kept empty so no
// fake data ever shows in the real app).
export const SHOES: Shoe[] = [];
