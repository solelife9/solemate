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
    // 'config' 는 2026-07-31 필수 업데이트 게이트(AUDIT 2 I-3)로 **정의된** 컬렉션이 됐다.
    // 읽기만 열렸고 쓰기는 여전히 막혀 있다 — 아래 별도 케이스에서 그걸 검사한다.
    for (const c of ['users', 'admin', 'shoeCatalog', 'medals', 'progression']) {
      await assertFails(setDoc(doc(attacker(), c, 'x'), {a: 1}));
      await assertFails(getDoc(doc(attacker(), c, 'x')));
    }
  });

  // ── 원격 설정(config/app) — 읽기 전용 (AUDIT 2 I-3) ─────────────────────────
  // 여기가 열리면 **누구나 전 사용자의 앱을 잠글 수 있다**(minSupportedVersion 을
  // 999 로 올리면 끝). 그래서 쓰기 차단을 공격자 자격으로 직접 확인한다.
  it('config 는 로그인 사용자가 읽을 수 있다(업데이트 게이트가 동작해야 한다)', async () => {
    await seed(['config', 'app'], {minSupportedVersion: '1.0.0'});
    await assertSucceeds(getDoc(doc(attacker(), 'config', 'app')));
  });
  it('config 는 아무도 쓸 수 없다 — 앱을 잠그는 킬 스위치를 남에게 주지 않는다', async () => {
    await seed(['config', 'app'], {minSupportedVersion: '1.0.0'});
    await assertFails(setDoc(doc(attacker(), 'config', 'app'), {minSupportedVersion: '999.0.0'}));
    await assertFails(updateDoc(doc(attacker(), 'config', 'app'), {minSupportedVersion: '999.0.0'}));
    await assertFails(deleteDoc(doc(attacker(), 'config', 'app')));
    // 다른 문서 id 로 우회해 만드는 것도 막힌다.
    await assertFails(setDoc(doc(attacker(), 'config', 'other'), {a: 1}));
  });
  it('config 는 미로그인이면 읽을 수 없다(공개 컬렉션이 아니다)', async () => {
    await seed(['config', 'app'], {minSupportedVersion: '1.0.0'});
    await assertFails(getDoc(doc(guest(), 'config', 'app')));
  });
});

// ── 공개 프로필(소셜) — 개인 저장소와의 분리가 지켜지는가 ─────────────────────
// keego 는 동의 없이 개인정보가 공개 컬렉션에 쌓이던 사고를 이미 냈다(767032e).
// 그래서 '남의 프로필을 만들거나 고칠 수 있는가'를 공격자 자격으로 직접 확인한다.
describe('공개 프로필', () => {
  const validProfile = (over: Record<string, unknown> = {}) => ({
    nickname: '민우', visibility: 'public',
    activeShoes: [], hallOfFame: [], stats: {totalKm: 0, runCount: 0, monthKm: 0},
    ...over,
  });

  it('로그인 사용자는 남의 프로필을 읽을 수 있다(그게 기능이다)', async () => {
    await seed(['profiles', VICTIM], validProfile());
    await assertSucceeds(getDoc(doc(attacker(), 'profiles', VICTIM)));
  });

  it('미로그인은 못 읽는다 — 인터넷 전체에 여는 게 아니다', async () => {
    await seed(['profiles', VICTIM], validProfile());
    await assertFails(getDoc(doc(guest(), 'profiles', VICTIM)));
  });

  it('남의 프로필을 만들 수 없다(사칭 차단)', async () => {
    await assertFails(setDoc(doc(attacker(), 'profiles', VICTIM), validProfile()));
  });

  it('남의 프로필을 고칠 수 없다', async () => {
    await seed(['profiles', VICTIM], validProfile());
    await assertFails(updateDoc(doc(attacker(), 'profiles', VICTIM), {nickname: '조작됨'}));
  });

  it('남의 프로필을 지울 수 없다', async () => {
    await seed(['profiles', VICTIM], validProfile());
    await assertFails(deleteDoc(doc(attacker(), 'profiles', VICTIM)));
  });

  it('본인 프로필은 만들고 지울 수 있다(공개·공개 중단)', async () => {
    await assertSucceeds(setDoc(doc(attacker(), 'profiles', ATTACKER), validProfile()));
    await assertSucceeds(deleteDoc(doc(attacker(), 'profiles', ATTACKER)));
  });

  it('visibility 가 public 이 아니면 쓸 수 없다 — 비공개는 문서를 안 만드는 것으로 표현한다', async () => {
    await assertFails(setDoc(doc(attacker(), 'profiles', ATTACKER), validProfile({visibility: 'private'})));
  });

  it('말도 안 되게 긴 닉네임은 거부한다', async () => {
    await assertFails(setDoc(doc(attacker(), 'profiles', ATTACKER), validProfile({nickname: 'x'.repeat(41)})));
  });
});

// ── 랭킹 재개봉(2026-08-01) — 읽기를 열었다. 쓰기 방어가 그대로인가 ─────────────
describe('랭킹 재개봉 후 방어', () => {
  const withShoes = (uid: string, shoes: unknown) => validEntry(uid, {shoes});

  it('로그인 사용자는 순위표를 읽을 수 있다(그게 기능이다)', async () => {
    await seed(['leaderboards', YM, 'entries', VICTIM], validEntry(VICTIM));
    await assertSucceeds(getDoc(doc(attacker(), 'leaderboards', YM, 'entries', VICTIM)));
  });

  it('미로그인은 여전히 못 읽는다', async () => {
    await seed(['leaderboards', YM, 'entries', VICTIM], validEntry(VICTIM));
    await assertFails(getDoc(doc(guest(), 'leaderboards', YM, 'entries', VICTIM)));
  });

  it('읽기를 열어도 남의 엔트리는 못 고친다', async () => {
    await seed(['leaderboards', YM, 'entries', VICTIM], validEntry(VICTIM));
    await assertFails(updateDoc(doc(attacker(), 'leaderboards', YM, 'entries', VICTIM), {distance: 99999}));
    await assertFails(deleteDoc(doc(attacker(), 'leaderboards', YM, 'entries', VICTIM)));
  });

  it('신발 요약은 배열이어야 한다 — 깨진 문서가 순위표를 오염시키지 못하게', async () => {
    await assertFails(setDoc(doc(attacker(), 'leaderboards', YM, 'entries', ATTACKER), withShoes(ATTACKER, '신발')));
    await assertFails(setDoc(doc(attacker(), 'leaderboards', YM, 'entries', ATTACKER), withShoes(ATTACKER, 42)));
  });

  it('신발을 3켤레 넘게 심을 수 없다 — 남의 화면까지 느려진다', async () => {
    const many = Array.from({length: 4}, (_, i) => ({brand: 'B', model: `M${i}`, usedKm: 1}));
    await assertFails(setDoc(doc(attacker(), 'leaderboards', YM, 'entries', ATTACKER), withShoes(ATTACKER, many)));
  });

  it('정상 신발 요약은 통과한다(대조군)', async () => {
    const ok = [{brand: 'Nike', model: 'Pegasus 41', usedKm: 412}];
    await assertSucceeds(setDoc(doc(attacker(), 'leaderboards', YM, 'entries', ATTACKER), withShoes(ATTACKER, ok)));
  });

  it('신발 필드가 없어도 통과한다(옛 엔트리 호환)', async () => {
    await assertSucceeds(setDoc(doc(attacker(), 'leaderboards', YM, 'entries', ATTACKER), validEntry(ATTACKER)));
  });
});
