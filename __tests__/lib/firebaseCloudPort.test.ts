// ============================================================================
// firebaseCloudPort — CloudPort 의 firebase 구현 행동 테스트 (Slice 5)
//
// firebase 모듈은 jest.setup.js 에서 메모리 가짜로 목 처리된다(실 네이티브 0).
// 여기서는 관찰 가능한 결과만 단언한다: 로그인이 사용자/인증상태를 바꾼다, push 한
// 페이로드를 pull 로 그대로 되읽는다(라운드트립), 미로그인 동기는 거부된다.
// ============================================================================

import * as authMock from '@react-native-firebase/auth';
import * as firestoreMock from '@react-native-firebase/firestore';

import {createFirebaseCloudPort, recentYearMonths} from '../../lib/firebaseCloudPort';
import {firestoreRankingStore, yearMonthOf} from '../../lib/progression/firestoreRankingStore';
import {buildStoredEntry} from '../../lib/progression/firestoreRanking';
import type {BackupPayload} from '../../lib/backup';

const resetFirebase = () => {
  (authMock as unknown as {__reset: () => void}).__reset();
  (firestoreMock as unknown as {__reset: () => void}).__reset();
};

const currentUid = (): string | undefined =>
  (authMock.getAuth() as unknown as {currentUser: {uid: string} | null}).currentUser?.uid;

describe('firebaseCloudPort (Firebase 클라우드 포트)', () => {
  beforeEach(resetFirebase);

  test('anonymous 로그인은 uid 를 가진 사용자를 돌려주고 currentUser 를 세팅한다', async () => {
    const port = createFirebaseCloudPort();
    const user = await port.signIn('anonymous');
    expect(user.uid).toBe('anon-test-uid');
    expect(currentUid()).toBe('anon-test-uid');
  });

  test('push 한 BackupPayload 를 pull 로 그대로 되읽는다 (firestore 라운드트립)', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');

    const payload: BackupPayload = {
      shoes: [{id: 's1', brand: 'Nike', model: 'Pegasus'}],
      runs: [{id: 'r1', distanceKm: 5}],
      settings: {units: 'km', weightKg: 70},
    };
    await port.push(payload);

    const pulled = await port.pull();
    expect(pulled).toEqual(payload);
  });

  test('progression(은퇴 신발 등)이 push→pull 라운드트립에서 보존된다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');

    const payload: BackupPayload = {
      shoes: [],
      runs: [],
      settings: {},
      progression: {
        earnedTitles: [],
        equippedTitleKey: null,
        seenUnlocks: ['rank_silver'],
        retiredShoes: [{shoeId: 'x', name: '은퇴화', km: 600, retiredAt: '2026-01-01', retireYear: 2026, grade: 'gold'} as any],
        points: 120,
      },
    };
    await port.push(payload);

    const pulled = await port.pull();
    expect(pulled?.progression?.retiredShoes).toHaveLength(1);
    expect(pulled?.progression?.retiredShoes[0].shoeId).toBe('x');
    expect(pulled?.progression?.points).toBe(120);
    expect(pulled?.progression?.seenUnlocks).toEqual(['rank_silver']);
  });

  test('한 번도 push 하지 않은 계정의 pull 은 null', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    expect(await port.pull()).toBeNull();
  });

  test('각 사용자는 자신의 문서만 본다 (uid 별 데이터 격리)', async () => {
    const port = createFirebaseCloudPort();

    await port.signIn('anonymous'); // uid: anon-test-uid
    await port.push({shoes: [{id: 'a'}], runs: [], settings: {}});

    // 다른 사용자로 전환 — 이전 사용자의 백업이 보이면 안 된다.
    (authMock as unknown as {__setCurrentUser: (u: {uid: string}) => void}).__setCurrentUser({
      uid: 'other-user',
    });
    expect(await port.pull()).toBeNull();

    // 원래 사용자로 복귀하면 자신의 데이터가 그대로 보인다.
    (authMock as unknown as {__setCurrentUser: (u: {uid: string}) => void}).__setCurrentUser({
      uid: 'anon-test-uid',
    });
    const pulled = await port.pull();
    expect(pulled?.shoes).toEqual([{id: 'a'}]);
  });

  test('로그인 전 pull/push 는 "로그인 필요" 로 거부된다 (데이터 보호)', async () => {
    const port = createFirebaseCloudPort();
    await expect(port.pull()).rejects.toThrow(/로그인/);
    await expect(
      port.push({shoes: [], runs: [], settings: {}}),
    ).rejects.toThrow(/로그인/);
  });

  test('signOut 후에는 currentUser 가 비워진다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    expect(currentUid()).toBe('anon-test-uid');
    await port.signOut();
    expect(currentUid()).toBeUndefined();
  });

  test('google 로그인은 주입된 자격증명 리졸버로 로그인한다', async () => {
    const resolveGoogleCredential = jest.fn(() =>
      Promise.resolve({uid: 'google-xyz'} as never),
    );
    const port = createFirebaseCloudPort({resolveGoogleCredential});
    const user = await port.signIn('google');
    expect(resolveGoogleCredential).toHaveBeenCalledTimes(1);
    expect(user.uid).toBe('google-xyz');
    expect(currentUid()).toBe('google-xyz');
  });

  test('리졸버 없이 google 로그인은 명확한 에러로 거부된다', async () => {
    const port = createFirebaseCloudPort();
    await expect(port.signIn('google')).rejects.toThrow(/google/i);
  });

  test('kakao 로그인은 주입된 커스텀 토큰 리졸버로 signInWithCustomToken 한다', async () => {
    const resolveKakaoToken = jest.fn(() => Promise.resolve('kakao-custom-token'));
    const port = createFirebaseCloudPort({resolveKakaoToken});
    const user = await port.signIn('kakao');
    expect(resolveKakaoToken).toHaveBeenCalledTimes(1);
    expect(user.uid).toBe('custom:kakao-custom-token');
    expect(currentUid()).toBe('custom:kakao-custom-token');
  });

  test('naver 로그인도 커스텀 토큰 리졸버로 로그인한다', async () => {
    const resolveNaverToken = jest.fn(() => Promise.resolve('naver-custom-token'));
    const port = createFirebaseCloudPort({resolveNaverToken});
    const user = await port.signIn('naver');
    expect(resolveNaverToken).toHaveBeenCalledTimes(1);
    expect(user.uid).toBe('custom:naver-custom-token');
  });

  test('리졸버 없이 kakao/naver 로그인은 명확한 에러로 거부된다', async () => {
    const port = createFirebaseCloudPort();
    await expect(port.signIn('kakao')).rejects.toThrow(/kakao/i);
    await expect(port.signIn('naver')).rejects.toThrow(/naver/i);
  });

  test('apple 로그인은 주입된 자격증명 리졸버로 로그인한다', async () => {
    const resolveAppleCredential = jest.fn(() =>
      Promise.resolve({uid: 'apple-xyz'} as never),
    );
    const port = createFirebaseCloudPort({resolveAppleCredential});
    const user = await port.signIn('apple');
    expect(resolveAppleCredential).toHaveBeenCalledTimes(1);
    expect(user.uid).toBe('apple-xyz');
    expect(currentUid()).toBe('apple-xyz');
  });

  test('리졸버 없이 apple 로그인은 명확한 에러로 거부된다', async () => {
    const port = createFirebaseCloudPort();
    await expect(port.signIn('apple')).rejects.toThrow(/apple/i);
  });

  // ── 회원 탈퇴(deleteAccount) ────────────────────────────────────────────────
  test('deleteAccount 는 백업 문서를 지우고 인증 계정을 삭제한다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    await port.push({shoes: [{id: 'a'}], runs: [], settings: {}});
    expect(currentUid()).toBe('anon-test-uid');

    await port.deleteAccount();

    // 계정이 비워진다(로그아웃과 동일 효과의 목).
    expect(currentUid()).toBeUndefined();

    // 백업 문서도 삭제됨: 같은 uid 로 되돌려도 pull 은 null.
    (authMock as unknown as {__setCurrentUser: (u: {uid: string}) => void}).__setCurrentUser({
      uid: 'anon-test-uid',
    });
    expect(await port.pull()).toBeNull();
  });

  test('로그인하지 않은 상태의 deleteAccount 는 명확한 에러로 거부된다', async () => {
    const port = createFirebaseCloudPort();
    await expect(port.deleteAccount()).rejects.toThrow(/계정/);
  });

  // 레코드 미러 API 는 CloudPort 에서 선택(optional)이다. 옵셔널 호출(`?.()`)로 쓰면
  // 메서드가 사라진 날 테스트가 조용히 통과해 버리므로, 있는지 먼저 못 박고 꺼내 쓴다.
  const recordApi = (port: ReturnType<typeof createFirebaseCloudPort>) => {
    const {pushRecords, pushRunDetail} = port;
    if (!pushRecords || !pushRunDetail) {
      throw new Error('firebaseCloudPort 에 pushRecords/pushRunDetail 이 없다');
    }
    return {pushRecords, pushRunDetail};
  };

  // ── 탈퇴가 하위 컬렉션을 전부 지운다 (2026-08-07 감사) ──────────────────────
  // 2026-08-01 에 recordSync 가 runs·shoes·medals 미러를 만들었는데 탈퇴 경로가 따라가지
  // 않았다. Firestore 는 부모 문서를 지워도 하위 컬렉션을 지우지 않으므로, 탈퇴한 사용자의
  // 러닝 기록 전량이 남고 **계정이 사라져 본인조차 지울 수 없는** 상태가 됐다.
  // 인앱 고지("모든 데이터가 영구 삭제")·처리방침 양쪽과 어긋났고 되돌릴 수 없다.
  test('deleteAccount 는 runDetails·runs·shoes·medals 하위 문서를 남기지 않는다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    const uid = 'anon-test-uid';

    const {pushRecords, pushRunDetail} = recordApi(port);
    await pushRunDetail('run-1', {route: [[37, 127]]});
    await pushRecords('runs', [{id: 'run-1', data: {km: 5.4, memo: '한강'}}]);
    await pushRecords('shoes', [{id: 'shoe-1', data: {name: 'Pegasus 41'}}]);
    await pushRecords('medals', [{id: 'medal-1', data: {raceName: '서울마라톤', bib: '12345'}}]);

    const under = (sub: string) =>
      (firestoreMock as unknown as {__keys: () => string[]})
        .__keys()
        .filter(k => k.startsWith(`userBackups/${uid}/${sub}/`));

    // 전제: 넷 다 실제로 올라가 있어야 이 테스트가 의미를 갖는다.
    for (const sub of ['runDetails', 'runs', 'shoes', 'medals']) {
      expect(under(sub).length).toBeGreaterThan(0);
    }

    await port.deleteAccount();

    for (const sub of ['runDetails', 'runs', 'shoes', 'medals']) {
      expect(under(sub)).toEqual([]);
    }
  });

  // ── 묘비는 본문을 남기지 않는다 — I/O 계층 계약 (2026-08-07 감사) ───────────
  // recordSync.toRecordDoc 이 묘비를 껍데기로 만드는 로직에는 전용 테스트가 있었고
  // **통과하고 있었다.** 그런데 pushRecords 가 {merge:true} 로 써서 없는 필드를 지우지
  // 않았고, 지운 러닝의 문서가 km·메모·심박을 그대로 간직한 채 deleted:true 만 얹혔다.
  // 순수 함수 테스트로는 절대 잡히지 않는 자리라 계약을 여기에 못 박는다.
  test('묘비 쓰기는 기존 본문을 덮어쓴다 — km·메모가 남지 않는다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    const {pushRecords} = recordApi(port);
    const key = 'userBackups/anon-test-uid/runs/run-1';
    const read = () => (firestoreMock as unknown as {__get: (k: string) => any}).__get(key);

    await pushRecords('runs', [
      {id: 'run-1', data: {km: 5.4, memo: '한강 야간', location: '여의도', heart_rate: 152}},
    ]);
    expect(read()).toMatchObject({km: 5.4, memo: '한강 야간'});

    // recordSync.toRecordDoc 이 만드는 묘비의 실제 모양.
    await pushRecords('runs', [{id: 'run-1', data: {deleted: true, editedAt: 123}}]);

    const doc = read();
    expect(doc.deleted).toBe(true);
    for (const gone of ['km', 'memo', 'location', 'heart_rate']) {
      expect(doc[gone]).toBeUndefined();
    }
  });

  // 반대 방향도 지킨다 — 살아있는 레코드까지 통째로 덮어쓰면 부분 갱신이 깨진다.
  test('살아있는 레코드는 병합으로 upsert 된다 — 부분 갱신이 필드를 지우지 않는다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    const {pushRecords} = recordApi(port);
    const read = () =>
      (firestoreMock as unknown as {__get: (k: string) => any}).__get('userBackups/anon-test-uid/runs/run-2');

    await pushRecords('runs', [{id: 'run-2', data: {km: 10, memo: '롱런'}}]);
    await pushRecords('runs', [{id: 'run-2', data: {km: 10.2}}]);

    expect(read()).toMatchObject({km: 10.2, memo: '롱런'});
  });

  // ── 탈퇴 시 월간 랭킹 엔트리 파기 (2026-07-29 감사) ─────────────────────────
  // 이전에는 leaderboards 엔트리가 탈퇴 대상에서 빠져 있었고, 규칙(`allow delete: if false`)
  // 이 삭제 자체를 막아 닉네임·월간 운동량이 탈퇴 후에도 영구히 남았다.
  test('deleteAccount 는 월간 랭킹 엔트리도 지운다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    const uid = 'anon-test-uid';
    const ym = yearMonthOf(Date.now());

    await firestoreRankingStore.publish(
      ym,
      buildStoredEntry({
        uid,
        nickname: '민우',
        rankTier: 'gold',
        rankColor: '#FF8000',
        stats: {distance: 120, consistency: 1, shoeHealth: 50, collection: 2, progressPoints: 900},
        updatedAt: Date.now(),
      }),
    );
    expect(await firestoreRankingStore.getEntry(uid, ym)).not.toBeNull();

    await port.deleteAccount();

    expect(await firestoreRankingStore.getEntry(uid, ym)).toBeNull();
  });

  test('recentYearMonths 는 이번 달부터 과거로 YYYY-MM 을 만든다(연도 경계 포함)', () => {
    // 2026-01-15 → 2026-01, 2025-12, 2025-11 (연도가 넘어간다)
    expect(recentYearMonths(new Date(2026, 0, 15).getTime(), 3)).toEqual([
      '2026-01',
      '2025-12',
      '2025-11',
    ]);
    // 기본 범위는 24개월이고 중복이 없다(같은 달을 두 번 지우려 하지 않는다).
    const many = recentYearMonths(new Date(2026, 6, 29).getTime());
    expect(many).toHaveLength(24);
    expect(new Set(many).size).toBe(24);
    expect(many[0]).toBe('2026-07');
  });

  // ── 원자 동기(syncMerge) — P1-4 동시-기기 클로버 방지 ───────────────────────
  const unionMerge = (
    local: BackupPayload,
    remote: BackupPayload | null,
  ): BackupPayload =>
    remote == null
      ? local
      : {
          shoes: [
            ...local.shoes,
            ...remote.shoes.filter(
              (r: any) => !local.shoes.some((l: any) => l.id === r.id),
            ),
          ],
          runs: [...local.runs, ...remote.runs],
          settings: {...remote.settings, ...local.settings},
        };

  test('syncMerge 는 트랜잭션 안에서 원격을 다시 읽어 로컬과 병합해 기록한다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    // 다른 기기가 이미 올려둔 원격 상태(신발 B).
    await port.push({shoes: [{id: 'B'}], runs: [], settings: {}});

    // 내 로컬은 신발 A. 원자 동기 → 원격(B)을 다시 읽어 A 와 union 으로 합친다.
    const merged = await port.syncMerge!({shoes: [{id: 'A'}], runs: [], settings: {}}, unionMerge);

    const ids = (merged.shoes as any[]).map(s => s.id).sort();
    expect(ids).toEqual(['A', 'B']); // 어느 쪽도 잃지 않는다
    // 기록된 문서도 둘 다 담는다(다음 pull 이 본다).
    const pulled = await port.pull();
    expect((pulled!.shoes as any[]).map(s => s.id).sort()).toEqual(['A', 'B']);
  });

  // ── 무변경 쓰기 생략 (AUDIT 2 I-4) ─────────────────────────────────────────
  // 동기는 앱 전환·복귀마다 돌지만 그중 대부분은 바뀐 게 없다. 그때마다 사용자의 신발·런
  // 전체가 든 문서를 통째로 다시 올리고 있었다. 결과 문서만 봐서는 판별이 안 되므로
  // (써도 안 써도 내용이 같다) **실제 쓰기 횟수**를 센다(jest.setup 의 __writeCount).
  const writeCount = (): number =>
    (firestoreMock as unknown as {__writeCount: () => number}).__writeCount();

  test('syncMerge 는 병합 결과가 원격과 같으면 쓰지 않는다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    const payload: BackupPayload = {shoes: [{id: 'A'}], runs: [], settings: {u: 'km'}};

    await port.syncMerge!(payload, unionMerge); // 첫 동기 — 원격이 없으니 쓴다
    const afterFirst = writeCount();
    expect(afterFirst).toBeGreaterThan(0);

    // 같은 로컬로 두 번 더. 병합 결과가 원격과 동일하므로 쓰기가 늘지 않아야 한다.
    await port.syncMerge!(payload, unionMerge);
    await port.syncMerge!(payload, unionMerge);
    expect(writeCount()).toBe(afterFirst);
  });

  test('바뀐 게 있으면 쓴다 — 생략이 변경을 삼키지 않는다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');

    await port.syncMerge!({shoes: [{id: 'A'}], runs: [], settings: {}}, unionMerge);
    const afterFirst = writeCount();

    // 런이 하나 추가됐다 → 반드시 올라가야 한다.
    await port.syncMerge!({shoes: [{id: 'A'}], runs: [{id: 'r1'}], settings: {}}, unionMerge);
    expect(writeCount()).toBeGreaterThan(afterFirst);

    const pulled = await port.pull();
    expect((pulled!.runs as any[]).map(r => r.id)).toContain('r1');
  });

  test('첫 백업(원격 없음)은 결과가 로컬과 같아도 반드시 쓴다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    const before = writeCount();
    await port.syncMerge!({shoes: [], runs: [], settings: {}}, unionMerge);
    expect(writeCount()).toBeGreaterThan(before);
    expect(await port.pull()).not.toBeNull();
  });

  test('syncMerge 는 경합 창을 닫는다: pull 직후 들어온 원격 쓰기를 덮어쓰지 않는다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');

    // 시나리오: 비원자 pull→push 라면 A 가 stale(빈) 원격을 읽는 사이 B 가 쓴 값을
    // 잃었을 것이다. syncMerge 는 트랜잭션 안에서 원격을 다시 읽으므로(이 목에선
    // get 시점의 store) B 의 쓰기가 보존된다.
    await port.push({shoes: [{id: 'B-fromOtherDevice'}], runs: [], settings: {}});
    const merged = await port.syncMerge!(
      {shoes: [{id: 'A-mine'}], runs: [], settings: {}},
      unionMerge,
    );
    const ids = (merged.shoes as any[]).map(s => s.id).sort();
    expect(ids).toContain('A-mine');
    expect(ids).toContain('B-fromOtherDevice'); // 동시-기기 쓰기 미유실
  });
});
