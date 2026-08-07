// ============================================================================
// lib/progression/firestoreRankingStore.ts — RankingStore 의 Firestore 구현 (Phase 3)
// ============================================================================
// firestoreRanking.ts(순수·DI provider)에 실제 Firestore 쿼리를 묶는 합성 모듈.
// 리더보드는 leaderboards/{yearMonth}/entries/{uid} 문서로 산다: 각 사용자가 자기 월간
// 엔트리(점수 5종 + 표시정보)를 자기 uid 문서에 쓰고, 클라이언트가 카테고리별 정렬
// 쿼리로 상위 100명을 읽는다(서버 집계 함수 불필요 → Render 백엔드 대체).
//
// 이 모듈만 @react-native-firebase/firestore 에 의존한다(비순수). 순수 provider·엔진은
// 이 파일을 import 하지 않는다 — 화면(HallOfFameScreen)/앱 부트(App.tsx)에서만 쓴다.
// jest 는 jest.setup.js 의 인메모리 firestore 목으로 쿼리/카운트를 검증한다.
// ============================================================================
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getCountFromServer,
} from '@react-native-firebase/firestore';

import {getFirebaseUid, getFirebaseIdToken} from '../firebaseCloudPort';
import {SOCIAL_BACKEND} from '../socialConfig';
import {
  RankingStore,
  StoredRankingEntry,
  createFirestoreRankingProvider,
  type EntryShoe,
  computeRankingStats,
  sanitizeEntryShoes,
  RankingStatsInput,
} from './firestoreRanking';
import {RankingProvider, RankTier} from './types';
import {withRankingCache} from './rankingCache';

/** 월간 엔트리 컬렉션 경로: leaderboards/{yearMonth}/entries. 문서 id = uid. */
function entriesPath(yearMonth: string): string {
  return `leaderboards/${yearMonth}/entries`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** firestore 문서 데이터를 StoredRankingEntry 로 방어적 정규화(누락/이상치 → 안전값). */
function toStored(data: Record<string, unknown> | undefined, uid: string): StoredRankingEntry {
  const d = data ?? {};
  return {
    uid: typeof d.uid === 'string' && d.uid ? d.uid : uid,
    nickname: typeof d.nickname === 'string' && d.nickname ? d.nickname : '러너',
    rankTier: (typeof d.rankTier === 'string' ? d.rankTier : 'bronze') as RankTier,
    rankColor: typeof d.rankColor === 'string' && d.rankColor ? d.rankColor : '#CD7F32',
    equippedTitle: typeof d.equippedTitle === 'string' ? d.equippedTitle : null,
    distance: num(d.distance),
    consistency: num(d.consistency),
    shoeHealth: num(d.shoeHealth),
    collection: num(d.collection),
    progressPoints: num(d.progressPoints),
    updatedAt: num(d.updatedAt),
    // 그달 주력 신발(2026-08-07). 예전엔 이 정규화가 shoes 를 **복사하지 않아서**,
    // 발행할 땐 실어 보내고 읽을 땐 통째로 버렸다. 그래서 「1,2,3위는 뭘 신나」가
    // 화면에 한 번도 뜬 적이 없다 — 추가 읽기 0으로 만들려고 엔트리에 넣어 둔 값을
    // 읽는 쪽에서 잃고 있었다. 형태 검증은 sanitizeEntryShoes 가 한다(옛 엔트리엔 없다).
    ...(() => {
      const shoes = sanitizeEntryShoes((d as {shoes?: EntryShoe[]}).shoes);
      return shoes.length ? {shoes} : {};
    })(),
  };
}

/**
 * Firestore 백엔드 RankingStore. 모든 메서드는 throw 가능 — provider 가 try/catch 로
 * 감싸 available:false 로 떨어뜨린다(가짜 경쟁자 발명 금지 계약은 provider 가 보장).
 */
export const firestoreRankingStore: RankingStore = {
  async topByCategory(category, yearMonth, limit) {
    const db = getFirestore();
    const col = collection(db, entriesPath(yearMonth));
    const q = query(col, orderBy(category, 'desc'), fbLimit(limit));
    const snap = await getDocs(q);
    return snap.docs.map(docSnap => toStored(docSnap.data() as any, docSnap.id));
  },

  async getEntry(uid, yearMonth) {
    const db = getFirestore();
    const ref = doc(db, entriesPath(yearMonth), uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return toStored(snap.data() as any, uid);
  },

  async countAbove(category, yearMonth, score) {
    const db = getFirestore();
    const col = collection(db, entriesPath(yearMonth));
    const q = query(col, where(category, '>', score));
    const snap = await getCountFromServer(q);
    return num(snap.data().count);
  },

  async total(yearMonth) {
    const db = getFirestore();
    const col = collection(db, entriesPath(yearMonth));
    const snap = await getCountFromServer(col);
    return num(snap.data().count);
  },

  // ⚠️ 2026-08-07 부터 **운영에서는 항상 실패한다.** firestore.rules 가 리더보드 엔트리의
  // 클라이언트 쓰기를 막았고(점수 위조 차단), 발행은 Cloud Functions 만 한다
  // (publishMyRanking → POST /api/ranking/publish). 이 메서드는 RankingStore 인터페이스
  // 계약과 로컬/스텁 구현을 위해 남는다 — **앱 코드에서 새로 부르지 말 것.**
  async publish(yearMonth, entry) {
    const db = getFirestore();
    const ref = doc(db, entriesPath(yearMonth), entry.uid);
    await setDoc(ref, entry as any);
  },

  async unpublish(yearMonth, uid) {
    const db = getFirestore();
    // 규칙상 본인 엔트리만 지울 수 있다(firestore.rules leaderboards allow delete).
    // 없는 문서 삭제는 no-op 이다.
    await deleteDoc(doc(db, entriesPath(yearMonth), uid));
  },
};

/**
 * Firestore 에 연결된 라이브 RankingProvider. HallOfFameScreen 의 기본 provider.
 * (인터페이스=RankingProvider — 로컬 stub·REST provider 와 호환.)
 *
 * **읽기 캐시로 감싼다(2026-08-07).** 이 화면은 진입 1회에 약 103 읽기이고, 화면의 로드
 * effect 가 `category` 에 의존해 **칩을 누를 때마다 다시 읽는다**(탭 3개 = 309).
 * 재진입이면 또 309. 앱 전체가 하루 6 읽기인데 이 화면 하나가 그 50일치를 쓴다 —
 * 무료 한도가 **세 자릿수 사용자에서 깨지고**, 그 구간이 베타 모집 2단계다.
 * 캐시 계약과 안전선(실패 미캐시 · uid 별 격리)은 `rankingCache.ts` 머리말 참조.
 */
export const keegoFirestoreRankingProvider: RankingProvider = withRankingCache(
  createFirestoreRankingProvider(firestoreRankingStore, getFirebaseUid),
  {getUid: getFirebaseUid},
) as RankingProvider;

/** 현재 활동 월(YYYY-MM)을 호출부 주입 시각으로부터 계산한다(결정성 — Date.now 비의존). */
export function yearMonthOf(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * 소급해서 내릴 개월 수. 랭킹 발행 배선 시점이 2026-06 이라 실제 엔트리는 그 이후에만
 * 있고, 규칙이 leaderboards 읽기를 막아 "어느 달에 내 엔트리가 있나"를 조회할 수 없다.
 * 그래서 목록을 읽는 대신 최근 N개월 경로를 만들어 지운다(없는 문서 delete 는 no-op).
 * lib/firebaseCloudPort 의 탈퇴 파기와 같은 규약·같은 개월 수다.
 */
export const RANKING_RETRACT_MONTHS = 24;

/**
 * **공개 동의를 철회했을 때 내 엔트리를 실제로 내린다.**
 *
 * 왜 필요한가(2026-08-07 감사): 철회하면 App 의 발행 가드가 일찍 return 해서 **발행만
 * 멈췄고, 이미 올라간 엔트리는 그대로 남았다.** unpublish 함수는 있었지만 유일한 호출부가
 * publishMyRanking 안(그 가드 뒤)이라 **도달할 수 없는 코드**였다. 결과적으로 닉네임·이번
 * 달 거리·신발·랭크가 로그인한 전원에게 계속 보였고 **앱에서 내릴 방법이 없었다.**
 * 공개 프로필은 null 을 넘겨 제대로 내려간다 — 리더보드만 짝이 빠져 있었다.
 * 처리방침 "공개용 프로필·순위 정보 — 공개 중단 시 또는 회원 탈퇴 시까지"와 어긋났다.
 *
 * 개별 월 실패는 삼킨다(나머지 달을 막지 않는다). 전부 실패해도 throw 하지 않는다 —
 * 호출부는 동기 흐름이고, 여기서 던지면 러닝 데이터 동기가 멎는다.
 */
export async function unpublishMyRanking(
  uid: string,
  nowMs: number,
  months: number = RANKING_RETRACT_MONTHS,
): Promise<void> {
  if (!uid) return;
  const d = new Date(nowMs);
  for (let i = 0; i < months; i += 1) {
    const ym = yearMonthOf(new Date(d.getFullYear(), d.getMonth() - i, 1).getTime());
    try {
      await firestoreRankingStore.unpublish(ym, uid);
    } catch {
      /* 개별 월 실패 무시 */
    }
  }
}

export interface PublishRankingArgs {
  /** 그달 주력 신발 요약 — 「1,2,3위는 뭘 신나」. 없으면 엔트리에 필드가 안 생긴다. */
  shoes_summary?: readonly EntryShoe[];
  nickname: string;
  rankTier: RankTier;
  rankColor: string;
  equippedTitle?: string | null;
  runs: RankingStatsInput['runs'];
  shoes: RankingStatsInput['shoes'];
  progressPoints: number;
  /** 결정성: 호출부가 현재 시각(ms)을 주입. 활동 월·updatedAt 으로 쓰인다. */
  nowMs: number;
}

/**
 * 내 월간 랭킹 엔트리를 발행한다. 클라우드 동기(App.runCloudSync) 뒤에 best-effort 로
 * 호출 — 미로그인/실패는 false(throw 없음 — 동기 흐름을 막지 않는다).
 *
 * ── 점수는 이제 **서버가 계산한다** (2026-08-07) ─────────────────────────────
 * 예전엔 여기서 computeRankingStats 로 계산해 Firestore 에 직접 썼다. 규칙이 형태와
 * 상한을 봤지만 **사람이 낼 수 있는 범위 안이면 아무 숫자나 통과했다** — 300km 를
 * 달렸다고 쓰는 데 300km 가 필요 없었다.
 *
 * 그래서 규칙이 클라이언트 쓰기를 막고(`allow create, update: if false`), Cloud
 * Functions 가 **그 사용자의 러닝 기록을 직접 읽어** 거리·활동일수를 다시 계산한다.
 * 스트라바·나이키가 쓰는 구조다: 활동은 업로드되고 순위는 업로드된 활동에서 서버가 만든다.
 *
 * 여기서 보내는 것은 **서버가 알 수 없는 표시정보**뿐이다 — 닉네임·랭크 색·장착 타이틀,
 * 그리고 진척 포인트(랭크 XP). 진척 포인트는 업적·타이틀·은퇴·챌린지가 얽힌 약 1,900줄
 * 엔진의 산출물이라 서버에 옮겨 적으면 두 벌이 되어 반드시 갈라진다. 상한(10,000)으로
 * 조이고 남은 구멍은 정직하게 적어 뒀다(`functions/ranking.js` 헤더 · 감사 L-7).
 *
 * '이번 달에 달리지 않았으면 명단에서 내린다'(2026-08-04)는 판단도 서버로 갔다 —
 * 이제 거리·활동일수를 아는 쪽이 서버뿐이다.
 */
export async function publishMyRanking(args: PublishRankingArgs): Promise<boolean> {
  try {
    const token = await getFirebaseIdToken();
    if (!token) return false;
    const r = await fetch(`${SOCIAL_BACKEND}/api/ranking/publish`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
      body: JSON.stringify({
        yearMonth: yearMonthOf(args.nowMs),
        nickname: args.nickname,
        rankTier: args.rankTier,
        rankColor: args.rankColor,
        equippedTitle: args.equippedTitle ?? null,
        progressPoints: args.progressPoints,
        // 화면에 없는 축이지만 규칙이 필드를 요구한다(HallOfFameScreen 이 2026-08-04 에
        // 내렸다). 서버가 전 기간 러닝을 읽지 않아도 되게 여기서 보낸다 — 순위에 쓰이지
        // 않으므로 조작할 이유가 없고, 상한 0~100 으로 조인다.
        shoeHealth: computeRankingStats({
          runs: args.runs,
          shoes: args.shoes,
          yearMonth: yearMonthOf(args.nowMs),
          progressPoints: args.progressPoints,
        }).shoeHealth,
        shoes_summary: args.shoes_summary ?? [],
      }),
    });
    if (!r.ok) return false;
    const body = (await r.json()) as {published?: boolean};
    return body?.published === true;
  } catch {
    return false;
  }
}

// re-export 카테고리 상수/타입(화면이 점수 키를 순회할 때 단일 출처에서 가져가게).
export {RANKING_CATEGORIES} from './firestoreRanking';
export type {RankingCategory} from './firestoreRanking';
