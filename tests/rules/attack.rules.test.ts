// ============================================================================
// AUDIT 1 — 공격 시나리오 실증 (firestore.rules)
// ----------------------------------------------------------------------------
// 규칙을 읽고 "될 것 같다/안 될 것 같다"로 판정하지 않는다. **실제로 공격해 본다.**
// 에뮬레이터에 진짜 규칙 파일을 로드하고, 공격자 자격으로 요청을 날려 결과를 기록한다.
//
// 각 테스트 이름 = 감사 문서의 시나리오 번호. 통과(= 공격 실패)가 '안전'이다.
// `npm run test:rules` 로만 돈다(기본 npm test 는 firestore 를 목으로 대체).
// ============================================================================
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc,
} from 'firebase/firestore';

const VICTIM = 'uid_victim';
const ATTACKER = 'uid_attacker';
const YM = '2026-07';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'keego-attack-test',
    firestore: {rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8')},
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

/** 규칙을 우회해 피해자 데이터를 심는다(공격 전 사전 조건). */
async function seed(path: string[], data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore() as any, ...(path as [string, ...string[]])), data);
  });
}
const attacker = () => env.authenticatedContext(ATTACKER).firestore() as any;
const guest = () => env.unauthenticatedContext().firestore() as any;

const validEntry = (uid: string, over: Record<string, unknown> = {}) => ({
  uid, nickname: '민우', rankTier: 'gold', rankColor: '#FF8000', equippedTitle: null,
  distance: 120, consistency: 0.8, shoeHealth: 0.6, collection: 3,
  progressPoints: 4200, updatedAt: 1750000000000, ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
describe('시나리오 1 — 다른 유저의 러닝 기록을 읽을 수 있는가', () => {
  it('백업 본체 읽기 시도', async () => {
    await seed(['userBackups', VICTIM], {runs: [{id: 'r1', km: 10}]});
    await assertFails(getDoc(doc(attacker(), 'userBackups', VICTIM)));
  });
  it('런 상세 사이드카 읽기 시도', async () => {
    await seed(['userBackups', VICTIM, 'runDetails', 'r1'], {route: JSON.stringify([{lat: 37.5, lon: 127.0}]), splits: [1, 2]});
    await assertFails(getDoc(doc(attacker(), 'userBackups', VICTIM, 'runDetails', 'r1')));
  });
  it('컬렉션 전체 조회로 우회 시도', async () => {
    await seed(['userBackups', VICTIM], {runs: []});
    await assertFails(getDocs(collection(attacker(), 'userBackups')));
  });
  it('하위 컬렉션 목록 조회로 우회 시도', async () => {
    await seed(['userBackups', VICTIM, 'runDetails', 'r1'], {route: '', splits: []});
    await assertFails(getDocs(collection(attacker(), 'userBackups', VICTIM, 'runDetails')));
  });
});

describe('시나리오 2 — 다른 유저의 신발/기록을 수정·삭제할 수 있는가', () => {
  it('덮어쓰기 시도', async () => {
    await seed(['userBackups', VICTIM], {shoes: [{id: 's1'}]});
    await assertFails(setDoc(doc(attacker(), 'userBackups', VICTIM), {shoes: []}));
  });
  it('부분 수정 시도', async () => {
    await seed(['userBackups', VICTIM], {shoes: [{id: 's1'}]});
    await assertFails(updateDoc(doc(attacker(), 'userBackups', VICTIM), {shoes: []}));
  });
  it('삭제 시도', async () => {
    await seed(['userBackups', VICTIM], {shoes: []});
    await assertFails(deleteDoc(doc(attacker(), 'userBackups', VICTIM)));
  });
  it('사이드카 삭제 시도', async () => {
    await seed(['userBackups', VICTIM, 'runDetails', 'r1'], {route: '', splits: []});
    await assertFails(deleteDoc(doc(attacker(), 'userBackups', VICTIM, 'runDetails', 'r1')));
  });
});

describe('시나리오 3 — 일반 유저가 신발 카탈로그(shoes)를 수정할 수 있는가', () => {
  it('카탈로그 문서 생성 시도', async () => {
    await assertFails(setDoc(doc(attacker(), 'shoes', 'fake-shoe'), {brand: '가짜', model: 'X'}));
  });
  it('기존 카탈로그 변조 시도', async () => {
    await seed(['shoes', 'nike-pegasus-42'], {brand: 'Nike', model: 'Pegasus 42', weight: 292});
    await assertFails(updateDoc(doc(attacker(), 'shoes', 'nike-pegasus-42'), {weight: 1}));
  });
  it('카탈로그 삭제 시도', async () => {
    await seed(['shoes', 'nike-pegasus-42'], {brand: 'Nike'});
    await assertFails(deleteDoc(doc(attacker(), 'shoes', 'nike-pegasus-42')));
  });
  it('races 도 동일하게 막히는가', async () => {
    await assertFails(setDoc(doc(attacker(), 'races', 'fake'), {name: '날조 대회'}));
  });
});

describe('시나리오 4 — 인증 없이 읽히는 컬렉션이 있는가', () => {
  it('비로그인: 신발 카탈로그', async () => {
    await seed(['shoes', 's1'], {brand: 'Nike'});
    await assertFails(getDoc(doc(guest(), 'shoes', 's1')));
  });
  it('비로그인: 대회 카탈로그', async () => {
    await seed(['races', 'r1'], {name: '서울마라톤'});
    await assertFails(getDoc(doc(guest(), 'races', 'r1')));
  });
  it('비로그인: 백업', async () => {
    await seed(['userBackups', VICTIM], {runs: []});
    await assertFails(getDoc(doc(guest(), 'userBackups', VICTIM)));
  });
  it('비로그인: 리더보드', async () => {
    await seed(['leaderboards', YM, 'entries', VICTIM], validEntry(VICTIM));
    await assertFails(getDoc(doc(guest(), 'leaderboards', YM, 'entries', VICTIM)));
  });
  it('비로그인: 신호 컬렉션 생성', async () => {
    await assertFails(
      setDoc(doc(guest(), 'search_misses', 'm1'), {query: 'x', userId: null, createdAt: 1}),
    );
  });
});

describe('시나리오 5 — 남의 uid 로 문서를 생성할 수 있는가', () => {
  it('피해자 uid 로 백업 생성 시도', async () => {
    await assertFails(setDoc(doc(attacker(), 'userBackups', VICTIM), {runs: []}));
  });
  it('피해자 uid 문서 경로에 랭킹 엔트리 생성 시도', async () => {
    await assertFails(
      setDoc(doc(attacker(), 'leaderboards', YM, 'entries', VICTIM), validEntry(VICTIM)),
    );
  });
  it('내 문서에 남의 uid 필드를 심는 사칭 시도', async () => {
    await assertFails(
      setDoc(doc(attacker(), 'leaderboards', YM, 'entries', ATTACKER), validEntry(VICTIM)),
    );
  });
  it('본인 uid 로는 정상 생성된다(대조군)', async () => {
    await assertSucceeds(
      setDoc(doc(attacker(), 'leaderboards', YM, 'entries', ATTACKER), validEntry(ATTACKER)),
    );
  });
});

describe('시나리오 6 — 임의 필드 추가·타입 변조가 되는가', () => {
  it('랭킹: 점수를 문자열로', async () => {
    await assertFails(
      setDoc(doc(attacker(), 'leaderboards', YM, 'entries', ATTACKER), validEntry(ATTACKER, {distance: '9999'})),
    );
  });
  it('랭킹: 모르는 필드 추가 — **규칙이 막는가?**', async () => {
    await assertSucceeds(
      setDoc(doc(attacker(), 'leaderboards', YM, 'entries', ATTACKER), validEntry(ATTACKER, {payload: 'x'.repeat(1000)})),
    );
  });
  it('search_misses: 모르는 필드 추가', async () => {
    await assertFails(
      setDoc(doc(attacker(), 'search_misses', 'm1'), {query: 'x', userId: ATTACKER, createdAt: 1, junk: 1}),
    );
  });
  it('shoe_requests: 모르는 source 값', async () => {
    await assertFails(
      setDoc(doc(attacker(), 'shoe_requests', 'r1'), {brand: 'N', model: 'M', userId: ATTACKER, createdAt: 1, source: 'x'}),
    );
  });
  it('userBackups: 내 문서엔 아무 형태나 쓸 수 있는가(형태 검증 없음)', async () => {
    await assertSucceeds(
      setDoc(doc(attacker(), 'userBackups', ATTACKER), {junk: 'x'.repeat(5000), notARun: true}),
    );
  });
});

describe('시나리오 7 — 문서 크기·개수 제한이 없어 한 유저가 무한정 쓸 수 있는가', () => {
  it('search_misses 를 반복 생성할 수 있는가(적재 폭주)', async () => {
    const db = attacker();
    for (let i = 0; i < 25; i++) {
      await assertSucceeds(
        addDoc(collection(db, 'search_misses'), {query: `q${i}`, userId: ATTACKER, createdAt: i}),
      );
    }
  });
  it('shoe_requests 도 반복 생성할 수 있는가', async () => {
    const db = attacker();
    for (let i = 0; i < 25; i++) {
      await assertSucceeds(
        addDoc(collection(db, 'shoe_requests'), {brand: 'B', model: `M${i}`, userId: ATTACKER, createdAt: i, source: 'manual_add'}),
      );
    }
  });
  it('내 백업 문서에 거대 페이로드를 쓸 수 있는가', async () => {
    await assertSucceeds(
      setDoc(doc(attacker(), 'userBackups', ATTACKER), {blob: 'x'.repeat(200000)}),
    );
  });
  it('리더보드 엔트리를 여러 달에 생성할 수 있는가', async () => {
    for (const m of ['2026-01', '2026-02', '2026-03', '2099-12']) {
      await assertSucceeds(
        setDoc(doc(attacker(), 'leaderboards', m, 'entries', ATTACKER), validEntry(ATTACKER)),
      );
    }
  });
});

describe('시나리오 8 — 최근 추가 컬렉션이 규칙에 안 걸려 열려 있는가', () => {
  it('shoeCatalog(문서상 이름) 경로는 기본 deny 에 걸리는가', async () => {
    await assertFails(setDoc(doc(attacker(), 'shoeCatalog', 'x'), {a: 1}));
    await assertFails(getDoc(doc(attacker(), 'shoeCatalog', 'x')));
  });
  it('search_misses 읽기는 아무도 못 한다', async () => {
    await seed(['search_misses', 'm1'], {query: '남의 검색어', userId: VICTIM, createdAt: 1});
    await assertFails(getDoc(doc(attacker(), 'search_misses', 'm1')));
    await assertFails(getDocs(collection(attacker(), 'search_misses')));
  });
  it('shoe_requests 읽기는 아무도 못 한다', async () => {
    await seed(['shoe_requests', 'r1'], {brand: 'B', model: 'M', userId: VICTIM, createdAt: 1});
    await assertFails(getDoc(doc(attacker(), 'shoe_requests', 'r1')));
    await assertFails(getDocs(collection(attacker(), 'shoe_requests')));
  });
  it('신호 컬렉션 수정·삭제 불가', async () => {
    await seed(['search_misses', 'm1'], {query: 'q', userId: VICTIM, createdAt: 1});
    await assertFails(updateDoc(doc(attacker(), 'search_misses', 'm1'), {query: '조작'}));
    await assertFails(deleteDoc(doc(attacker(), 'search_misses', 'm1')));
  });
  it('미정의 임의 컬렉션은 전부 deny', async () => {
    for (const c of ['users', 'admin', 'config', 'shoeCatalog', 'medals', 'progression']) {
      await assertFails(setDoc(doc(attacker(), c, 'x'), {a: 1}));
      await assertFails(getDoc(doc(attacker(), c, 'x')));
    }
  });
});
