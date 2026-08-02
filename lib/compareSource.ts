// ─── lib/compareSource.ts — 스펙 표에 세울 신발 만들기 ──────────────────────────
//
// 카탈로그 문서(원자료) + 손검수 표(신뢰 우선) → 비교 표가 쓰는 CompareShoe.
//
// ── 왜 이 층이 따로 있나(2026-08-02 AUDIT 4 Q-1) ────────────────────────────
// 신발 스펙이 두 파일에 쌓여 있다.
//   · data/shoeSpecs.json    71켤레 · 사람이 브랜드 공표값을 확인해 적은 표
//   · data/shoeCatalog.json  618켤레 · 대량 수집분
// lib/shoeSpecModel 은 **"손검수가 이기고 카탈로그가 빈 축을 메운다"** 를 이미 구현해
// 두었고(lookupOfficialSpec), 후보 추천·부상 경고가 그 규칙을 따랐다.
//
// 그런데 **스펙 표만 그 규칙을 건너뛰고 카탈로그를 직접 읽고 있었다.** 그래서 한 화면
// 안에서 후보 줄의 문구("쿠션은 조금 얇아요")와 표의 숫자가 다른 소스에서 나왔다.
// 71켤레 중 28켤레가 실제로 어긋났고, Nike Structure 26 은 무게가 236g/295g 이었다
// — 우리가 "체감된다"고 정한 기준(30g)의 두 배다. 표시만이 아니라 추천이 바뀐다.
//
// 이 모듈이 그 규칙을 표에도 적용한다. shoeSpecModel 이 shoeCatalogLookup 을 이미
// 가져오므로 반대 방향 import 는 순환이라, 두 모듈 **위에** 얇은 층을 하나 둔다.
// (규칙 자체를 여기 다시 적지 않는다 — lookupOfficialSpec 을 부른다. 사본 금지.)
import type {ShoeDoc} from '../types/shoe';
import type {CompareShoe} from './shoeCompareTable';
import {displayName} from './shoeCatalogLookup';
import {lookupOfficialSpec} from './shoeSpecModel';

export {unknownCompareShoe} from './shoeCatalogLookup';

/**
 * 카탈로그 문서를 비교 표가 쓰는 형태로. **손검수 표가 있으면 그 값이 이긴다.**
 *
 * 스택 처리에 한 가지 조심할 게 있다. 손검수 표는 힐만 적고 앞발은 적지 않는다.
 * 그래서 손검수 힐이 카탈로그 힐을 이기면 카탈로그 앞발과 짝이 안 맞는다 — 그대로 두면
 * "힐 46.5 · 앞발 34" 처럼 드롭(8)과 모순되는 세 숫자가 표에 나란히 뜬다.
 * 그런 경우 **앞발을 비운다.** 계산해 채우는 건 우리가 지어내는 것이고, 빈칸은 정직하다.
 */
export function toCompareShoe(
  d: ShoeDoc,
  mine?: {usedKm: number; lifespanKm: number} | null,
): CompareShoe {
  const name = displayName(d);
  const official = lookupOfficialSpec(d.brand, name);

  const weight = official?.weightG ?? d.weight ?? null;
  const weightBasis = official?.weightBasis ?? d.weightBasis ?? null;
  const drop = official?.dropMm ?? d.drop ?? null;

  // 힐이 손검수 값으로 바뀌었으면 카탈로그 앞발은 짝이 아니다.
  const heel = official?.stackHeelMm ?? d.stackHeight?.heel ?? null;
  const forefoot = d.stackHeight?.forefoot ?? null;
  const heelIsCatalog = heel != null && d.stackHeight?.heel === heel;
  const stackHeight = heel == null
    ? null
    : {heel, ...(heelIsCatalog && forefoot != null ? {forefoot} : {})};

  return {
    id: d.id,
    brand: d.brand,
    name,
    category: d.category,
    weight,
    weightBasis,
    drop,
    plate: d.plate,
    stackHeight: stackHeight as CompareShoe['stackHeight'],
    lifespanKm: d.defaultLifespanKm,
    mine: mine ?? null,
  };
}
