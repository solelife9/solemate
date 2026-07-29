// ============================================================================
// lib/watchPayload.ts — 워치·위젯으로 보낼 페이로드 만들기(순수)
// ----------------------------------------------------------------------------
// 폰이 워치(신발 목록·최근 기록)와 홈/잠금 위젯(활성 신발 링)에 보내는 데이터의 형태를
// 여기서 정한다. 전송 자체는 App 의 effect 가 한다 — 이 파일은 '무엇을 보낼지'만 정하고
// 네이티브를 부르지 않는다.
//
// 왜 밖으로 뺐나: 워치로 넘어가는 값은 폰 화면에서 눈으로 확인되지 않는다. 실기기에
// 올려 손목을 봐야 알 수 있어서, 계약이 조용히 어긋나도 한참 뒤에나 발견된다
// (실제로 워치 거리·심박 관련 회귀가 반복됐다). 순수 함수로 두고 테스트로 고정한다.
// ============================================================================

import {Shoe} from '../theme';
import {conditionForPercent} from './shoe';
import {estimateMaxHR} from './analytics/hrZones';
import {findShoeClass, typeLabel} from '../data/shoeClass';

/** 홈 목록의 한 칸 — 저장소 레코드(raw)와 화면용(ui) 한 쌍. */
export interface HomeShoeEntry {
  raw: any;
  ui: Shoe;
}

export interface WatchShoePayload {
  id: string;
  brand: string;
  model: string;
  lifePct: number;
  condition: string;
  usedKm: number;
  maxKm: number;
}

export interface WatchHrPayload {
  max: number;
  rest: number;
}

/**
 * 워치 신발 카드 목록 + 심박 기준.
 *
 * lifePct 는 **남은 수명 비율**(0~100 클램프) — 워치 링이 이 값을 그대로 그린다.
 * condition 은 워치 구버전 계약(도트 의미색)용 3단계 문자열이다. 폰 UI 는 4단계
 * wearTier 로 이행했지만(2026-07-11) 값은 계속 보낸다(호환).
 */
export function buildWatchShoes(
  homeShoes: readonly HomeShoeEntry[],
  age: number,
  restHR: number,
): {shoes: WatchShoePayload[]; hr: WatchHrPayload} {
  return {
    shoes: homeShoes.map(x => ({
      id: String(x.raw.id),
      brand: x.ui.brand,
      model: x.ui.model,
      lifePct: Math.max(0, Math.min(100, Math.round((1 - x.ui.used / Math.max(1, x.ui.max)) * 100))),
      condition: conditionForPercent(x.ui.max > 0 ? (x.ui.used / x.ui.max) * 100 : 0),
      // 워치 시작 카드 '사용/남음' 줄(폰 히어로 kmRow 미러) — 반올림 정수 km.
      usedKm: Math.max(0, Math.round(x.ui.used)),
      maxKm: Math.max(0, Math.round(x.ui.max)),
    })),
    hr: {max: estimateMaxHR(age), rest: restHR || 0},
  };
}

export interface WatchRunPayload {
  id: string;
  endMs: number;
  km: number;
  durationS: number;
  avgPaceSecPerKm: number;
  avgBpm: number;
  cadence: number;
  kcal: number;
  elevGainM: number;
  shoeName: string;
}

/**
 * 폰 최근 러닝 → 워치 기록(HistoryView).
 *
 * 워치가 폰 런 + 워치 런을 합쳐 최신순으로 보여준다(runId 중복 제거는 워치 쪽 RecentRuns).
 * 최근 10개만 보낸다. 정렬 기준은 updated_at 이 있으면 그것, 없으면 날짜 파싱값이다.
 * id 가 없거나 거리가 0 인 레코드는 보내지 않는다(워치에서 빈 줄로 보인다).
 */
export function buildWatchRecentRuns(
  runs: readonly any[],
  shoes: readonly any[],
): WatchRunPayload[] {
  const nameOf = (sid: any) => shoes.find(s => String(s.id) === String(sid))?.name || '';
  const ts = (r: any) => {
    const u = Number(r.updated_at);
    return Number.isFinite(u) && u > 0 ? u : (Date.parse(String(r.run_date || '')) || 0);
  };
  return [...runs]
    .sort((a, b) => ts(b) - ts(a))
    .slice(0, 10)
    .map(r => {
      const km = Number(r.km) || 0;
      const durationS = Number(r.duration) || 0;
      return {
        id: String(r.id || ''),
        endMs: ts(r),
        km,
        durationS,
        // 0.2km 이하는 페이스가 튀어 의미가 없다 — 0 으로 두고 워치가 비운다.
        avgPaceSecPerKm: km > 0.2 ? durationS / km : 0,
        avgBpm: Number(r.heart_rate) || 0,
        cadence: Number(r.cadence) || 0,
        kcal: Number(r.calories) || 0,
        elevGainM: Number(r.elevation_m) || 0,
        shoeName: nameOf(r.shoe_id),
      };
    })
    .filter(r => r.id && r.km > 0);
}

export interface WidgetShoePayload {
  name: string;
  brand: string;
  category: string;
  usedKm: number;
  maxKm: number;
}

/**
 * 홈/잠금화면 위젯(신발 수명 링) — 활성 신발 한 켤레.
 * 활성 신발이 없으면 null(호출부가 전송을 건너뛴다).
 */
export function buildWidgetShoe(entry: HomeShoeEntry | undefined | null): WidgetShoePayload | null {
  if (!entry) return null;
  return {
    name: entry.ui.model || entry.ui.brand,
    brand: entry.ui.brand,
    category: typeLabel(findShoeClass(entry.ui.brand, entry.ui.model)?.type) || '',
    usedKm: entry.ui.used,
    maxKm: entry.ui.max,
  };
}
