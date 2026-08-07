// ============================================================================
// firestore.rules 계약 테스트 (실제 에뮬레이터에 규칙 파일을 로드해 검증)
// ----------------------------------------------------------------------------
// `npm run test:rules` 로만 돌린다(기본 npm test 는 firestore 를 목으로 대체하므로
// 규칙을 검증하지 못한다 — jest.config.js 의 testPathIgnorePatterns 로 제외).
//
// 검증 축 = (본인 · 타인 · 비로그인) × (앱이 실제로 쓰는 모든 경로).
// 실제 경로는 코드에서 가져왔다:
//   userBackups/{uid}                      — lib/firebaseCloudPort.ts backupRef
//   userBackups/{uid}/runDetails/{runId}   — 같은 파일 runDetailRef / 탈퇴 순회 삭제
//   leaderboards/{ym}/entries/{uid}        — lib/progression/firestoreRankingStore.ts
//   races/{raceId}                         — lib/raceStore.ts
// ============================================================================
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, deleteDoc, collection, getDocs} from 'firebase/firestore';

const ME = 'uid_me';
const OTHER = 'uid_other';
const YM = '2026-07';

/** 규칙이 요구하는 형태를 만족하는 랭킹 엔트리(validRankingEntry). */
const validEntry = (uid: string) => ({
  uid,
  nickname: '민우',
  rankTier: 'gold',
  rankColor: '#FF8000',
  equippedTitle: null,
  distance: 120.5,
  consistency: 0.8,
  shoeHealth: 0.6,
  collection: 3,
  progressPoints: 4200,
  updatedAt: 1750000000000,
});

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'keego-rules-test',
    firestore: {rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8')},
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

/** 규칙을 우회해 사전 데이터를 심는다(읽기 테스트의 준비 단계). */
async function seed(path: string[], data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore() as any, ...(path as [string, ...string[]])), data);
  });
}

const asMe = () => testEnv.authenticatedContext(ME).firestore() as any;
const asOther = () => testEnv.authenticatedContext(OTHER).firestore() as any;
const asGuest = () => testEnv.unauthenticatedContext().firestore() as any;

// ── userBackups/{uid} — 백업 본체 ────────────────────────────────────────────
describe('userBackups/{uid} (백업 본체)', () => {
  it('본인은 읽고 쓴다', async () => {
    await assertSucceeds(setDoc(doc(asMe(), 'userBackups', ME), {runs: []}));
    await assertSucceeds(getDoc(doc(asMe(), 'userBackups', ME)));
  });

  it('타인 문서는 읽기·쓰기 모두 거부', async () => {
    await seed(['userBackups', ME], {runs: []});
    await assertFails(getDoc(doc(asOther(), 'userBackups', ME)));
    await assertFails(setDoc(doc(asOther(), 'userBackups', ME), {runs: ['악성']}));
  });

  it('비로그인은 거부', async () => {
    await seed(['userBackups', ME], {runs: []});
    await assertFails(getDoc(doc(asGuest(), 'userBackups', ME)));
    await assertFails(setDoc(doc(asGuest(), 'userBackups', ME), {runs: []}));
  });
});

// ── userBackups/{uid}/runDetails/{runId} — B-01 회귀 가드 ────────────────────
// 이 블록이 이 파일의 존재 이유다. 규칙이 하위 컬렉션에 상속되지 않아
// 런 상세 백업(스플릿·페이스·심박 시계열)이 프로덕션에서 전량 거부됐다.
describe('userBackups/{uid}/runDetails/{runId} (런 상세 사이드카 — B-01)', () => {
  it('본인은 상세를 쓰고 읽는다 (pushRunDetail / pullRunDetail)', async () => {
    await assertSucceeds(
      setDoc(doc(asMe(), 'userBackups', ME, 'runDetails', 'run_1'), {
        splits: [1, 2, 3],
        hrTrack: [140, 150],
      }),
    );
    await assertSucceeds(getDoc(doc(asMe(), 'userBackups', ME, 'runDetails', 'run_1')));
  });

  it('본인은 상세 목록을 조회하고 삭제한다 (탈퇴 시 순회 삭제 경로)', async () => {
    await seed(['userBackups', ME, 'runDetails', 'run_1'], {splits: [1]});
    await seed(['userBackups', ME, 'runDetails', 'run_2'], {splits: [2]});

    const listed = await assertSucceeds(
      getDocs(collection(asMe(), 'userBackups', ME, 'runDetails')),
    );
    expect((listed as any).size).toBe(2);

    await assertSucceeds(deleteDoc(doc(asMe(), 'userBackups', ME, 'runDetails', 'run_1')));
  });

  it('타인의 상세는 읽기·쓰기·목록·삭제 전부 거부', async () => {
    await seed(['userBackups', ME, 'runDetails', 'run_1'], {splits: [1]});
    await assertFails(getDoc(doc(asOther(), 'userBackups', ME, 'runDetails', 'run_1')));
    await assertFails(setDoc(doc(asOther(), 'userBackups', ME, 'runDetails', 'run_1'), {splits: []}));
    await assertFails(getDocs(collection(asOther(), 'userBackups', ME, 'runDetails')));
    await assertFails(deleteDoc(doc(asOther(), 'userBackups', ME, 'runDetails', 'run_1')));
  });

  it('비로그인은 거부', async () => {
    await seed(['userBackups', ME, 'runDetails', 'run_1'], {splits: [1]});
    await assertFails(getDoc(doc(asGuest(), 'userBackups', ME, 'runDetails', 'run_1')));
    await assertFails(setDoc(doc(asGuest(), 'userBackups', ME, 'runDetails', 'run_1'), {splits: []}));
  });

  it('더 깊은 하위 경로도 본인만 허용된다(향후 사이드카 확장 대비)', async () => {
    await assertSucceeds(
      setDoc(doc(asMe(), 'userBackups', ME, 'runDetails', 'run_1', 'photos', 'p1'), {uri: 'x'}),
    );
    await assertFails(
      setDoc(doc(asOther(), 'userBackups', ME, 'runDetails', 'run_1', 'photos', 'p1'), {uri: 'x'}),
    );
  });
});

// ── leaderboards — 로그인 읽기, 쓰기는 자기 엔트리 + 형태 검증 ──────────────
// 이력: 2026-07-29 감사에서 **읽기를 전면 차단**했다(진입점 없는 리더보드가 닉네임·
// 월간 운동량을 동의 없이 전원에게 공개하고 있었다).
// 2026-08-01 재개봉: 옵트인 동의·화면 진입점을 갖추고 읽기를 다시 열었다. 앱은
// socialVisibility==='public' 일 때만 발행하므로, 원치 않는 사람은 애초에 여기 없다.
describe('leaderboards/{ym}/entries/{uid}', () => {
  it('로그인 사용자는 순위표를 읽는다(재개봉 — 그게 기능이다)', async () => {
    await seed(['leaderboards', YM, 'entries', OTHER], validEntry(OTHER));
    await assertSucceeds(getDoc(doc(asMe(), 'leaderboards', YM, 'entries', OTHER)));
    await assertSucceeds(getDocs(collection(asMe(), 'leaderboards', YM, 'entries')));
  });

  it('본인 엔트리도 읽는다(내 순위 표시)', async () => {
    await seed(['leaderboards', YM, 'entries', ME], validEntry(ME));
    await assertSucceeds(getDoc(doc(asMe(), 'leaderboards', YM, 'entries', ME)));
  });

  it('비로그인은 읽지 못한다', async () => {
    await seed(['leaderboards', YM, 'entries', OTHER], validEntry(OTHER));
    await assertFails(getDoc(doc(asGuest(), 'leaderboards', YM, 'entries', OTHER)));
  });

  // ── 쓰기는 서버만 (2026-08-07) ─────────────────────────────────────────────
  // 예전엔 '본인 엔트리를 유효한 형태로' 쓸 수 있었다. 그런데 형태와 상한만 보므로
  // **사람이 낼 수 있는 범위 안이면 아무 숫자나 통과했다** — 300km 를 달렸다고 쓰는 데
  // 300km 가 필요 없었다. 이제 발행은 Cloud Functions 만 한다(admin SDK 는 규칙 우회).
  it('본인 엔트리라도 **직접 쓸 수 없다** — 발행은 서버만 한다', async () => {
    await assertFails(
      setDoc(doc(asMe(), 'leaderboards', YM, 'entries', ME), validEntry(ME)),
    );
  });

  it('이미 있는 내 엔트리를 고쳐 쓸 수도 없다(점수 덮어쓰기 차단)', async () => {
    await seed(['leaderboards', YM, 'entries', ME], validEntry(ME));
    await assertFails(
      setDoc(doc(asMe(), 'leaderboards', YM, 'entries', ME), {...validEntry(ME), distance: 1499}),
    );
  });

  it('타인 uid 엔트리는 당연히 쓸 수 없다(사칭 차단)', async () => {
    await assertFails(
      setDoc(doc(asMe(), 'leaderboards', YM, 'entries', OTHER), validEntry(OTHER)),
    );
  });

  it('본인 엔트리는 삭제할 수 있다(탈퇴 시 파기 경로)', async () => {
    await seed(['leaderboards', YM, 'entries', ME], validEntry(ME));
    await assertSucceeds(deleteDoc(doc(asMe(), 'leaderboards', YM, 'entries', ME)));
  });

  it('타인 엔트리는 삭제하지 못한다', async () => {
    await seed(['leaderboards', YM, 'entries', OTHER], validEntry(OTHER));
    await assertFails(deleteDoc(doc(asMe(), 'leaderboards', YM, 'entries', OTHER)));
  });

  it('비로그인은 삭제하지 못한다', async () => {
    await seed(['leaderboards', YM, 'entries', ME], validEntry(ME));
    await assertFails(deleteDoc(doc(asGuest(), 'leaderboards', YM, 'entries', ME)));
  });
});

// ── races — 읽기 전용 카탈로그 ───────────────────────────────────────────────
describe('races/{raceId}', () => {
  it('로그인 사용자는 읽는다', async () => {
    await seed(['races', 'seoul-marathon'], {name: '서울마라톤'});
    await assertSucceeds(getDoc(doc(asMe(), 'races', 'seoul-marathon')));
    await assertSucceeds(getDocs(collection(asMe(), 'races')));
  });

  it('비로그인은 읽지 못한다', async () => {
    await seed(['races', 'seoul-marathon'], {name: '서울마라톤'});
    await assertFails(getDoc(doc(asGuest(), 'races', 'seoul-marathon')));
  });

  it('클라이언트는 쓸 수 없다(admin SDK 전용)', async () => {
    await assertFails(setDoc(doc(asMe(), 'races', 'fake'), {name: '날조 대회'}));
  });
});

// ── 사용자 신호(검색 0건·등록 요청) ──────────────────────────────────────────
// 적재 전용 컬렉션이다. 쓰기만 열고 읽기를 닫는 게 핵심 — 남이 무엇을 검색했는지
// 열람할 수 있으면 관측 데이터가 곧 사생활 유출이 된다(docs/shoes-spec.md §6).
//
// **계정 식별자는 아예 받지 않는다(2026-08-03).** 앱이 읽지도 지우지도 못하는 곳이라
// 한 번 들어가면 탈퇴해도 지울 방법이 없고, 그건 처리방침("탈퇴 시까지")과 어긋난다.
// 규칙으로 막는 이유: 코드에서 빼는 것만으로는 다음 사람이 다시 넣는다.
describe('search_misses/{docId}', () => {
  const miss = {query: 'Nike Pegasus 99', createdAt: 1750000000000};

  it('로그인 사용자는 적재할 수 있다', async () => {
    await assertSucceeds(setDoc(doc(asMe(), 'search_misses', 'm1'), miss));
  });

  it('비로그인은 적재하지 못한다', async () => {
    await assertFails(setDoc(doc(asGuest(), 'search_misses', 'm1'), miss));
  });

  it('아무도 읽지 못한다(남의 검색어 열람 차단)', async () => {
    await seed(['search_misses', 'm1'], miss);
    await assertFails(getDoc(doc(asMe(), 'search_misses', 'm1')));
    await assertFails(getDocs(collection(asMe(), 'search_misses')));
  });

  it('수정·삭제는 불가(적재 전용)', async () => {
    await seed(['search_misses', 'm1'], miss);
    await assertFails(setDoc(doc(asMe(), 'search_misses', 'm1'), {...miss, query: '조작'}));
    await assertFails(deleteDoc(doc(asMe(), 'search_misses', 'm1')));
  });

  it('빈 질의·과대 질의·모르는 필드는 거부(잡음 차단)', async () => {
    await assertFails(setDoc(doc(asMe(), 'search_misses', 'm2'), {...miss, query: ''}));
    await assertFails(setDoc(doc(asMe(), 'search_misses', 'm3'), {...miss, query: 'x'.repeat(101)}));
    await assertFails(setDoc(doc(asMe(), 'search_misses', 'm4'), {...miss, junk: 1}));
  });

  it('계정 식별자는 거부한다 — 지울 수 없는 곳에 개인정보를 남기지 않는다', async () => {
    await assertFails(setDoc(doc(asMe(), 'search_misses', 'm5'), {...miss, userId: ME}));
  });
});

describe('shoe_requests/{docId}', () => {
  const req = {brand: 'Nike', model: 'Pegasus 99', createdAt: 1750000000000};

  it('버튼 요청(not_found)을 적재한다', async () => {
    await assertSucceeds(setDoc(doc(asMe(), 'shoe_requests', 'r1'), {...req, source: 'not_found'}));
  });

  it('직접 추가(manual_add)를 적재한다 — 구멍의 진짜 크기가 여기 있다', async () => {
    await assertSucceeds(setDoc(doc(asMe(), 'shoe_requests', 'r2'), {...req, source: 'manual_add'}));
  });

  it('source 가 없어도 받는다(구버전 앱 호환 — 필드를 나중에 넣었다)', async () => {
    await assertSucceeds(setDoc(doc(asMe(), 'shoe_requests', 'r3'), req));
  });

  it('계정 식별자는 거부한다 — 지울 수 없는 곳에 개인정보를 남기지 않는다', async () => {
    await assertFails(setDoc(doc(asMe(), 'shoe_requests', 'r5'), {...req, userId: ME}));
  });

  it('모르는 source 는 거부(자유 문자열이면 집계가 무의미해진다)', async () => {
    await assertFails(setDoc(doc(asMe(), 'shoe_requests', 'r4'), {...req, source: 'whatever'}));
    await assertFails(setDoc(doc(asMe(), 'shoe_requests', 'r5'), {...req, source: 7}));
  });

  it('비로그인은 적재하지 못한다', async () => {
    await assertFails(setDoc(doc(asGuest(), 'shoe_requests', 'r6'), {...req, source: 'not_found'}));
  });

  it('아무도 읽지 못하고, 수정·삭제도 불가', async () => {
    await seed(['shoe_requests', 'r7'], {...req, source: 'not_found'});
    await assertFails(getDoc(doc(asMe(), 'shoe_requests', 'r7')));
    await assertFails(getDocs(collection(asMe(), 'shoe_requests')));
    await assertFails(setDoc(doc(asMe(), 'shoe_requests', 'r7'), {...req, source: 'manual_add'}));
    await assertFails(deleteDoc(doc(asMe(), 'shoe_requests', 'r7')));
  });

  it('과대 문자열·모르는 필드는 거부', async () => {
    await assertFails(setDoc(doc(asMe(), 'shoe_requests', 'r8'), {...req, model: 'x'.repeat(61)}));
    await assertFails(setDoc(doc(asMe(), 'shoe_requests', 'r9'), {...req, junk: 1}));
  });
});

// ── 그 외 전부 거부 ─────────────────────────────────────────────────────────
describe('미정의 경로', () => {
  it('임의 컬렉션은 로그인해도 거부', async () => {
    await assertFails(setDoc(doc(asMe(), 'anything', 'x'), {a: 1}));
    await assertFails(getDoc(doc(asMe(), 'anything', 'x')));
  });

  it('userBackups 컬렉션 전체 조회는 거부(남의 백업 열람 차단)', async () => {
    await seed(['userBackups', OTHER], {runs: []});
    await assertFails(getDocs(collection(asMe(), 'userBackups')));
  });
});

// ============================================================================
// 랭킹 쓰기 차단 (2026-08-04 상한 → 2026-08-07 서버 전용)
// ============================================================================
describe('leaderboards — 클라이언트 쓰기는 어떤 형태로도 막힌다', () => {
  const write = (over: Record<string, unknown>) =>
    setDoc(doc(asMe(), 'leaderboards', YM, 'entries', ME), {...validEntry(ME), ...over});

  // 2026-08-04 에는 여기서 **상한**을 지켰다(distance ≤ 1500 등). 형태만 맞으면 통과하는
  // 구조라 '사람이 낼 수 없는 값'만 막을 수 있었기 때문이다.
  // 2026-08-07 에 그 전제가 사라졌다 — 발행이 Cloud Functions 전용이 되면서 **어떤 값도
  // 클라이언트는 못 쓴다.** 상한은 이제 서버가 건다(functions/ranking.js CAPS, 회귀는
  // __tests__/functions/ranking.test.ts + rankingParity).
  //
  // 그래서 이 describe 가 지키는 것은 상한이 아니라 **문이 닫혀 있다는 사실**이다.
  test('정상 범위여도 못 쓴다 — 그게 예전에 뚫려 있던 구멍이다', async () => {
    await assertFails(write({distance: 300, consistency: 20, progressPoints: 5000}));
  });

  test('과장된 값은 당연히 못 쓴다', async () => {
    await assertFails(write({distance: 999999}));
    await assertFails(write({consistency: 32}));
    await assertFails(write({progressPoints: 10001}));
    await assertFails(write({shoeHealth: 101}));
  });

  test('음수·긴 닉네임도 마찬가지', async () => {
    await assertFails(write({distance: -1}));
    await assertFails(write({nickname: 'x'.repeat(41)}));
  });
});
