// ─── lib/shoeCatalogStore.ts — 원격 카탈로그 런타임 저장소 ────────────────────
//
// 번들 목록(data/shoeModels.ts SHOE_MODELS)은 모듈 로드 시점에 고정된 상수라 원격에서
// 받은 모델을 끼워 넣을 수 없다. 그래서 '추가분'만 여기 담고, 화면은 훅으로 합쳐 본다.
//
// 상태를 컨텍스트가 아니라 모듈에 두는 이유: 신발 목록은 앱 전역에서 같은 값이어야 하고
// (여러 화면이 각자 받아오면 화면마다 목록이 다를 수 있다), 동기화를 시작하는 쪽과
// 그리는 쪽이 서로를 몰라야 한다.

import {useSyncExternalStore} from 'react';
import {
  SHOE_MODELS,
  brandsFrom,
  mergeShoeModels,
  shoeDocToModel,
  type ShoeModel,
  type ShoeDocLike,
} from '../data/shoeModels';

let extras: ShoeModel[] = [];
/** 합친 결과를 캐시한다 — 매 렌더마다 새 배열을 만들면 useSyncExternalStore 가 무한 루프. */
let merged: ShoeModel[] = SHOE_MODELS;
let brands: string[] = brandsFrom(SHOE_MODELS);
const listeners = new Set<() => void>();

function recompute(): void {
  // **번들이 먼저다** — 원격은 없는 모델만 채운다(data/shoeModels.ts mergeShoeModels).
  merged = extras.length ? mergeShoeModels(SHOE_MODELS, extras) : SHOE_MODELS;
  brands = brandsFrom(merged);
}

/**
 * 원격 문서를 반영한다. 깨진 문서는 조용히 버린다(shoeDocToModel 이 null 을 준다).
 * 결과가 이전과 같으면 알리지 않는다 — 빈 동기화가 화면을 다시 그리게 하지 않는다.
 */
export function setRemoteShoeDocs(docs: readonly ShoeDocLike[]): void {
  const next = docs.map(shoeDocToModel).filter((m): m is ShoeModel => m !== null);
  const same =
    next.length === extras.length &&
    next.every((m, i) => m.brand === extras[i].brand && m.model === extras[i].model);
  if (same) return;
  extras = next;
  recompute();
  listeners.forEach((l) => l());
}

/** 테스트용 초기화 — 스위트끼리 상태가 새지 않게 한다. */
export function resetRemoteShoeDocs(): void {
  if (!extras.length) return;
  extras = [];
  recompute();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const getModels = () => merged;
const getBrands = () => brands;

/** 화면이 쓰는 신발 목록(번들 + 원격). 원격이 늦게 도착해도 알아서 다시 그린다. */
export function useShoeModels(): ShoeModel[] {
  return useSyncExternalStore(subscribe, getModels, getModels);
}

/** 화면이 쓰는 브랜드 목록. 원격에만 있는 브랜드도 여기 포함된다. */
export function useShoeBrands(): string[] {
  return useSyncExternalStore(subscribe, getBrands, getBrands);
}
