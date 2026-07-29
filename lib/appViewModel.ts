// ============================================================================
// lib/appViewModel.ts — 백엔드 레코드 → 화면이 쓰는 형태(순수)
// ----------------------------------------------------------------------------
// 저장소의 신발/런 레코드와 화면이 그리는 Shoe/Run 은 형태가 다르다. 그 변환은 App 의
// 상태가 아니라 **입력의 함수**다(같은 입력이면 항상 같은 결과). 그래서 컴포넌트 밖에
// 두고 테스트한다 — 안에 있으면 앱을 통째로 마운트해야만 검증할 수 있었다.
//
// 규칙: 입력 불변 · throw 금지 · 저장소/네트워크 접근 0.
// ============================================================================

import {Shoe, Run} from '../theme';
import {
  parseShoeName, shoeHealth, isRetired, DEFAULT_MAX_KM, effectiveMaxKm,
} from './shoe';
import {lastWornDate} from './shoeRecommend';
import {fmtPace, fmtTime, fmtKDate} from './format';

/** 신발 레코드 → 화면용 Shoe. */
export function toUiShoe(s: any, runs: any[], weightKg: number): Shoe {
  // 단일 소스(shoeHealth)에서 used/남은수명을 도출 — 하드코딩 100km 임계·중복 used
  // 계산 제거(audit#7). 컨디션 라벨/색은 화면이 used/max 로 wearTier(4단계)를 파생
  // 한다(2026-07-11 단일화 — 3단계 condition 필드 폐지).
  const h = shoeHealth(s, runs);
  const {brand, model} = parseShoeName(s.name);
  return {
    id: s.id,
    brand: brand || s.name,
    model: model || (brand ? '' : s.name),
    used: Math.round(h.usedKm),
    // max = 몸무게 반영 유효 권장수명(링·%·교체판정 표시값). maxBase = 편집용 기저(오염 방지).
    // 몸무게 미설정이면 계수 1 → 유효=기저(기존과 동일). start_km 은 유효 수명에 무관(주행거리).
    max: effectiveMaxKm(s.max_km || DEFAULT_MAX_KM, weightKg),
    maxBase: s.max_km || DEFAULT_MAX_KM,
    retired: isRetired(s),
    // 마모/교체예측 baseline 을 표시형 Shoe 에도 싣는다(2026-07-14). 상세화면이
    // buildWearView 로 예측을 재계산할 때 start_km/age 가 빠지면 링(used, start_km 포함)과
    // 모순돼 '교체 임박'이 안 뜬다(과소평가). raw 신발에 있는 값을 그대로 전달.
    start_km: Number(s.start_km) || 0,
    purchase_date: s.purchase_date,
    // 구매가 — 원/km 표시용. 양수일 때만 싣는다(결측/0 은 '모름'으로 다룬다).
    ...(Number(s.price_krw) > 0 ? {priceKrw: Number(s.price_krw)} : {}),
  };
}

/** 신발 id → 배열 인덱스. 런이 어느 신발 것인지 화면이 되짚는 데 쓴다. */
export function buildIdxById(shoes: readonly any[]): Record<string, number> {
  const out: Record<string, number> = {};
  shoes.forEach((s, i) => {out[s.id] = i;});
  return out;
}

/**
 * 신발 id → 이름. **삭제(tombstone)된 신발까지 포함**한다 — 그 신발로 달린 런의 공유
 * 카드에도 이름이 떠야 하기 때문이다(삭제는 소프트삭제라 이름이 묘비에 남아 있다).
 * 라이브 신발이 이긴다(같은 id 면 묘비 이름으로 덮지 않는다).
 */
export function buildNameById(
  shoes: readonly any[],
  tombstoneShoes: readonly {id?: string; name?: string}[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  shoes.forEach(s => {if (s.name) out[s.id] = s.name;});
  tombstoneShoes.forEach(s => {if (s.id && s.name && !out[s.id]) out[s.id] = s.name;});
  return out;
}

/**
 * 홈/러닝 picker 용 목록 — 보관된 신발은 숨기고 '가장 최근에 신은 순'으로 정렬한다
 * (미착용은 뒤, 동률은 등록순 유지).
 *
 * 홈 히어로 기준(mostRecentShoeId)과 picker 카드 순서를 같은 기준으로 맞춰, 손이 가는
 * 신발이 맨 앞에 오게 한다. 정렬 후 인덱스는 homeActiveIdx·selectHomeShoe·startFromIdx 가
 * 모두 이 배열을 되짚으므로 선택/시작 매핑이 어긋나지 않는다.
 */
export function homeShoePairs(
  shoes: readonly any[],
  uiShoes: readonly Shoe[],
  runs: readonly any[],
): {raw: any; ui: Shoe}[] {
  return shoes
    .map((s, i) => ({raw: s, ui: uiShoes[i]}))
    .filter(x => !isRetired(x.raw))
    .map((x, i) => ({x, i, worn: lastWornDate(x.raw.id, runs as any[])}))
    .sort((a, b) => {
      if (a.worn === b.worn) return a.i - b.i;   // 동률(같은 날짜·둘 다 미착용) → 등록순 유지
      if (a.worn === null) return 1;             // a 미착용 → 뒤로
      if (b.worn === null) return -1;            // b 미착용 → 앞으로
      return a.worn > b.worn ? -1 : 1;           // 더 늦은(최근) 날짜가 앞
    })
    .map(o => o.x);
}

/** 최근 날짜가 앞(내림차순). 원본 배열은 건드리지 않는다. */
export function sortRunsByDateDesc<T extends {run_date?: unknown}>(runs: readonly T[]): T[] {
  return [...runs].sort((a, b) => String(b.run_date).localeCompare(String(a.run_date)));
}

/** 런 레코드 → 화면용 Run. */
export function toUiRun(
  run: any,
  idxById: Record<string, number>,
  nameById: Record<string, string>,
): Run {
  const km = parseFloat(run.km) || 0;
  const dur = run.duration || 0;
  const {date, day, dateNum} = fmtKDate(run.run_date);
  return {
    id: run.id, date, day, dateNum,
    dist: Math.round(km * 100) / 100,
    pace: dur > 0 && km > 0.1 ? fmtPace(km, dur) : '--',
    time: dur > 0 ? fmtTime(dur) : '--',
    shoe: idxById[run.shoe_id] ?? -1,
    shoeName: nameById[run.shoe_id] ?? '', // 삭제 신발 포함 — 공유 카드 폴백용
    cal: run.calories || 0, cadence: run.cadence || 0, bpm: run.heart_rate || 0, elev: run.elevation_m || 0,
    // 편집 폼 프리필용 원본값(날짜·시간 초). 거리/신발은 위 dist/shoe로 충분.
    runDate: String(run.run_date ?? ''), durationS: dur,
    memo: typeof run.memo === 'string' && run.memo.trim() ? run.memo : undefined,
    // 레코드 route 통과(2026-07-24 버그픽스) — RunDetail 지도 폴백('레코드 안의 route 로
    // 어느 기기에서든 코스가 보인다', 2026-07-04 설계)이 이 매핑에서 끊겨 있었다.
    route: typeof run.route === 'string' && run.route ? run.route : undefined,
  };
}
