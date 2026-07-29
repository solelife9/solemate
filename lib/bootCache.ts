// ============================================================================
// lib/bootCache.ts — 부팅 폴백 캐시 + GPS 경로 사이드키(저장소 접근부)
// ----------------------------------------------------------------------------
// 로컬-퍼스트: 마지막으로 성공한 신발/런을 보관해, 콜드/다운 백엔드에서도 재시도 카드
// 대신 '오프라인 부팅'으로 마지막 데이터를 보여준다(랭킹·동기화는 복구 시).
//
// ── GPS 경로의 집은 사이드키 하나다(2026-07-26 감사 F-08) ────────────────────
// 이전엔 같은 경로가 두 벌 있었다: 사이드키 route_<id> 와, 부팅 캐시 배열 안의 레코드.
// 경로는 런당 수 KB 라 캐시 배열이 '런 수 × 경로 크기'로 커졌고, 런을 한 건 저장하거나
// 지울 때마다 그 배열 **전체**를 파싱·재직렬화했다(런이 쌓일수록 악화 — 3년 주4회면 600건).
// 지금은 캐시엔 경로를 빼고(경량 미러), 부팅 때 사이드키에서 되채운다.
// 왜 '캐시에서 빼기만' 하면 안 되나: 메모리 레코드의 route 는 **클라우드 동기의 정본**이다
// (재설치·기기변경에도 지도가 남는 이유). 되채우지 않으면 재부팅 후 빈 route 가 push 되어
// 클라우드의 경로를 지운다 — 데이터 유실. 그래서 '빼기'와 '되채우기'는 한 쌍이어야 한다.
// 순비용: O(n) 읽기가 '저장할 때마다' → '부팅 1회'로 옮겨간다.
//
// 이 파일은 그 규칙의 **저장소 접근부**다. 순수한 결정 부분(어떤 형태로 캐시에 넣을지)은
// lib/runCache.ts 가 갖는다 — 둘은 한 쌍이고, 판단과 I/O 를 섞지 않으려고 나눠 둔다.
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import {recordError, reportIssue} from './crashlytics';
import {reportStorageResult} from './storageAlert';
import {cacheableRun, cacheEntryForSave} from './runCache';

export const CACHE_SHOES_KEY = 'cache_shoes_v1';
export const CACHE_RUNS_KEY = 'cache_runs_v1';

/** 레코드가 route 를 들고 있는데 사이드키가 없으면 채운다(클라우드 pull 유래 대비). */
export async function ensureRouteSidecars(list: any[]): Promise<void> {
  const withRoute = list.filter(r => r && r.id && r.route);
  if (withRoute.length === 0) return;
  const keys = withRoute.map(r => 'route_' + String(r.id));
  const existing = await AsyncStorage.getMany(keys);
  const missing: Record<string, string> = {};
  for (const r of withRoute) {
    const k = 'route_' + String(r.id);
    if (!existing[k]) missing[k] = String(r.route);
  }
  if (Object.keys(missing).length) await AsyncStorage.setMany(missing);
}

/** 캐시에서 읽은 런에 사이드키의 경로를 되채운다(메모리 레코드는 항상 완전해야 한다). */
export async function hydrateRoutes(runs: any[]): Promise<any[]> {
  const need = runs.filter(r => r && r.id && !r.route);
  if (need.length === 0) return runs;
  const got = await AsyncStorage.getMany(need.map(r => 'route_' + String(r.id)));
  return runs.map(r => {
    if (!r || !r.id || r.route) return r;
    const side = got['route_' + String(r.id)];
    return side ? {...r, route: side} : r;
  });
}

/** 부팅 폴백 캐시 로드 — 신발 배열이 있으면 {shoes,runs}, 없으면(미존재/손상) null. */
export async function loadBootCache(): Promise<{shoes: any[]; runs: any[]} | null> {
  try {
    const [s, r] = await Promise.all([
      AsyncStorage.getItem(CACHE_SHOES_KEY),
      AsyncStorage.getItem(CACHE_RUNS_KEY),
    ]);
    const shoes = JSON.parse(s || 'null');
    if (!Array.isArray(shoes)) return null;
    const runs = JSON.parse(r || 'null');
    const list = Array.isArray(runs) ? runs : [];
    // 경로 되채우기 — 실패해도 부팅은 계속한다(지도만 비고 거리·시간은 온전).
    let hydrated = list;
    try {
      hydrated = await hydrateRoutes(list);
    } catch (e) {
      reportIssue('storage: route hydrate on boot', e);
    }
    return {shoes, runs: hydrated};
  } catch {
    return null;
  }
}

/**
 * 전체 상태를 부팅 캐시에 쓴다(디바운스 경로).
 *
 * 경로는 사이드키가 소유하므로(F-08), 먼저 사이드키를 채운 뒤 캐시엔 경로를 뺀 경량
 * 레코드만 쓴다. 실패는 **삼키지 않고 던진다** — 호출부가 계측한다(무음 실패 금지:
 * 저장 공간이 부족하면 캐시가 조용히 낡아, 오프라인으로 열었을 때 며칠 전 상태가
 * '현재'로 보인다).
 */
export async function writeBootCache(shoes: any[], runs: any[]): Promise<void> {
  await ensureRouteSidecars(runs);
  await AsyncStorage.setMany({
    [CACHE_SHOES_KEY]: JSON.stringify(shoes),
    [CACHE_RUNS_KEY]: JSON.stringify(runs.map(cacheableRun)),
  });
}

/**
 * 런 한 건을 부팅 캐시에 즉시 durable 하게 prepend 한다(크래시-세이프티).
 *
 * 같은 id 가 이미 있으면 교체(멱등). 800ms 디바운스 캐시 쓰기가 전체 상태로 덮어쓰기
 * 전에 크래시가 나도 이 기록 덕에 런이 살아남는다. 비차단(throw 하지 않는다).
 *
 * keepRoute: 사이드키 쓰기가 실패했을 때만 true — 그 경우엔 경로를 캐시에 남기는 것이
 * 로컬의 유일한 사본이다(2026-07-27 F-08 후속: 사이드키 실패를 삼키던 구멍).
 */
export async function persistRunToCache(
  run: {id: string | number} & Record<string, any>,
  opts?: {keepRoute?: boolean},
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_RUNS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(arr) ? arr : [];
    // 경로는 호출 직전 addRun 이 사이드키(route_<id>)에 이미 durable 하게 썼다(F-08).
    const entry = cacheEntryForSave(run, !opts?.keepRoute);
    const next = [entry, ...list.filter((r: any) => String(r?.id) !== String(run.id))];
    await AsyncStorage.setItem(CACHE_RUNS_KEY, JSON.stringify(next));
    reportStorageResult(true);
  } catch (e) {
    recordError(e, 'storage: run cache write');
    reportStorageResult(false);
  }
}

/**
 * 런 한 건을 부팅 캐시에서 즉시 durable 하게 제거한다(삭제 크래시-세이프티).
 * 800ms 디바운스 캐시가 갱신되기 전 종료/크래시돼도 삭제가 캐시에 반영돼 부팅에서
 * 부활하지 않는다(#4/#5). 비차단.
 */
export async function persistRunCacheRemove(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_RUNS_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    await AsyncStorage.setItem(
      CACHE_RUNS_KEY,
      JSON.stringify(arr.filter((r: any) => String(r?.id) !== String(id))),
    );
  } catch (e) {
    recordError(e, 'storage: run cache remove');
  }
}
