// ─── services/shoes.ts — 신발 카탈로그 Firestore 저장 유틸 ──────────────────────
//
// 규칙 문서: docs/shoes-spec.md §7
//
// 이 파일의 존재 이유는 **같은 신발이 두 번 생기는 걸 구조적으로 막는 것**이다.
//   · 문서 id = 슬러그 고정. 랜덤 id 를 만들지 않는다.
//   · setDoc(..., {merge:true}) upsert 만 쓴다. **addDoc 금지** — 부르는 순간 중복이 생긴다.
//   · 단종은 삭제가 아니라 플래그다. 지난 기록이 그 id 를 참조하므로 지우면 고아가 된다.
//
// ⚠️ Firestore 규칙: shoes 는 클라이언트 **읽기 전용**이다(races 와 같은 취급 — 큐레이션
// 데이터). 카탈로그 쓰기는 admin SDK 스크립트로만 한다(scripts/seed-races.mjs 와 같은 방식).
// 그래서 upsert 계열은 '관리 도구/스크립트에서 admin 자격으로' 부르는 것을 전제로 한다.
// 앱에서 부르면 규칙이 거부한다 — 그게 의도다.

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
} from '@react-native-firebase/firestore';
import type {ShoeDoc} from '../types/shoe';

/** 카탈로그 컬렉션명. 문서 id 는 항상 ShoeDoc.id(슬러그)다. */
export const SHOES_COLLECTION = 'shoes';
/** 검색 0건 적재 — 무엇이 없는지 데이터로 안다(docs/shoes-spec.md §6). */
export const SEARCH_MISSES_COLLECTION = 'search_misses';
/** 사용자 등록 요청. */
export const SHOE_REQUESTS_COLLECTION = 'shoe_requests';

function db() {
  return getFirestore();
}

/** 슬러그로 문서 참조를 만든다 — id 가 곧 경로다(랜덤 id 없음). */
function shoeRef(id: string) {
  return doc(db(), SHOES_COLLECTION, id);
}

/**
 * 신발 한 켤레 upsert.
 *
 * merge:true 라 **부분 갱신이 안전하다** — 나중에 스펙만 채워 넣어도 나머지 필드가
 * 날아가지 않는다. 카탈로그는 조금씩 채워지는 데이터라 이 성질이 중요하다.
 */
export async function upsertShoe(shoe: ShoeDoc): Promise<void> {
  if (!shoe?.id) throw new Error('upsertShoe: id(슬러그)가 없습니다');
  await setDoc(shoeRef(shoe.id), {...shoe, updatedAt: serverTimestamp()}, {merge: true});
}

/**
 * 여러 켤레 upsert. 실패한 id 목록을 돌려준다(중간에 멈추지 않는다).
 *
 * 한 건이 실패했다고 나머지를 버리면 부분 성공 상태가 어디까지인지 알 수 없어진다.
 * 끝까지 시도하고 실패 목록을 넘겨, 호출부가 다시 시도할 수 있게 한다.
 */
export async function upsertShoes(shoes: readonly ShoeDoc[]): Promise<{failed: string[]}> {
  const failed: string[] = [];
  for (const s of shoes) {
    try {
      await upsertShoe(s);
    } catch {
      failed.push(s?.id ?? '(id 없음)');
    }
  }
  return {failed};
}

/**
 * 단종 표시 — **삭제하지 않는다**(docs/shoes-spec.md §5).
 *
 * 사용자가 지금도 그 신발을 신고 있고 지난 기록이 그 id 를 참조한다. 지우면 기록이
 * 고아가 된다. 되돌릴 수 있게 discontinued 를 인자로 받는다.
 */
export async function setShoeDiscontinued(id: string, discontinued = true): Promise<void> {
  if (!id) throw new Error('setShoeDiscontinued: id 가 없습니다');
  await setDoc(shoeRef(id), {discontinued, updatedAt: serverTimestamp()}, {merge: true});
}

/** 한 켤레 조회(없으면 null). */
export async function getShoe(id: string): Promise<ShoeDoc | null> {
  if (!id) return null;
  const snap = await getDoc(shoeRef(id));
  return snap.exists() ? ({...(snap.data() as ShoeDoc), id}) : null;
}

/** 전체 조회. 카탈로그는 수백 건 규모라 한 번에 읽어도 된다. */
export async function listShoes(): Promise<ShoeDoc[]> {
  const snap = await getDocs(collection(db(), SHOES_COLLECTION));
  return snap.docs.map((d) => ({...(d.data() as ShoeDoc), id: d.id}));
}

// ── 사용자 신호(0건 검색·등록 요청) ────────────────────────────────────────────
// 카탈로그가 낡는 문제에 대한 구조적 답이다 — 사람이 눈치채기를 기다리지 않고,
// "사용자가 찾았는데 없던 것"을 데이터로 남긴다(docs/shoes-spec.md §6).

/**
 * 검색 0건 기록. 실패해도 **절대 throw 하지 않는다** — 관측 목적이지 기능이 아니다.
 * 이것 때문에 검색 화면이 깨지면 본말전도다.
 */
export async function logSearchMiss(query: string, userId: string | null): Promise<void> {
  const q = String(query ?? '').trim();
  if (!q) return;
  try {
    await setDoc(
      doc(collection(db(), SEARCH_MISSES_COLLECTION)),
      {query: q, userId: userId ?? null, createdAt: serverTimestamp()},
    );
  } catch {
    /* 관측 실패는 삼킨다 */
  }
}

/**
 * '내 신발이 없어요' 요청 기록. 성공 여부를 돌려준다 — 이건 사용자가 누른 행동이라
 * 화면이 결과를 알려야 한다(조용히 실패하면 눌러도 아무 일이 없는 버튼이 된다).
 */
export async function requestShoe(
  brand: string,
  model: string,
  userId: string | null,
): Promise<boolean> {
  const b = String(brand ?? '').trim();
  const m = String(model ?? '').trim();
  if (!b && !m) return false;
  try {
    await setDoc(
      doc(collection(db(), SHOE_REQUESTS_COLLECTION)),
      {brand: b, model: m, userId: userId ?? null, createdAt: serverTimestamp()},
    );
    return true;
  } catch {
    return false;
  }
}
