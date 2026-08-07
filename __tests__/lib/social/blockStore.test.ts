/**
 * 차단 스토어 — 두 화면을 잇는 얇은 층.
 *
 * 왜 스토어가 필요한가: 차단은 **남의 프로필 화면**에서 누르는데, 사라져야 할 곳은
 * **랭킹 목록**이다. 랭킹은 이미 마운트돼 있어 저장소를 다시 읽지 않는다 —
 * 구독이 없으면 "차단했는데 목록에 그대로"가 되고 사용자는 고장으로 읽는다.
 *
 * 그리고 이 스토어는 **모듈 싱글턴**이라 계정을 바꿔도 메모리에 남는다. 그대로 두면
 * A 가 차단한 사람이 B 화면에서도 안 보인다 — 남의 판단이 내 화면을 바꾸는 것이고,
 * 이 저장소가 S-1·C 로 두 번 겪은 종류의 사고다. 그래서 화면은 마운트마다 force 로
 * 다시 읽고, 이 스위트가 그 계약을 고정한다.
 * @format
 */
import {
  blockedSnapshot, subscribeBlocked, ensureBlockedLoaded, block, unblock, resetBlockedCache,
} from '../../../lib/social/blockStore';
import {BLOCKED_UIDS_KEY} from '../../../lib/social/blockList';

function memStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  let reads = 0;
  return {
    map,
    reads: () => reads,
    async getItem(k: string) { reads++; return map.get(k) ?? null; },
    async setItem(k: string, v: string) { map.set(k, v); },
  };
}

beforeEach(() => resetBlockedCache());

describe('차단 스토어', () => {
  test('처음엔 비어 있고, 읽기 전에도 렌더를 막지 않는다', () => {
    expect(blockedSnapshot()).toEqual([]);
  });

  test('여러 화면이 각자 불러도 저장소는 한 번만 읽는다', async () => {
    const s = memStorage({[BLOCKED_UIDS_KEY]: JSON.stringify(['u1'])});
    await ensureBlockedLoaded(s);
    await ensureBlockedLoaded(s);
    await ensureBlockedLoaded(s);
    expect(s.reads()).toBe(1);
    expect(blockedSnapshot()).toEqual([{uid: 'u1'}]);
  });

  test('force 면 다시 읽는다 — 계정 전환 뒤 내 목록을 봐야 한다', async () => {
    const s = memStorage({[BLOCKED_UIDS_KEY]: JSON.stringify(['a1'])});
    await ensureBlockedLoaded(s);
    expect(blockedSnapshot()).toEqual([{uid: 'a1'}]);

    // 계정이 바뀌어 같은 키의 내용이 B 의 것으로 교체됐다(accountScope 가 하는 일).
    s.map.set(BLOCKED_UIDS_KEY, JSON.stringify(['b7']));
    await ensureBlockedLoaded(s);          // force 없이는 앞사람 것을 그대로 본다
    expect(blockedSnapshot()).toEqual([{uid: 'a1'}]);
    await ensureBlockedLoaded(s, true);    // force 로 다시 읽으면 내 것이 된다
    expect(blockedSnapshot()).toEqual([{uid: 'b7'}]);
  });

  test('차단하면 구독자에게 즉시 전파된다 — 다른 화면이 바로 반응해야 한다', async () => {
    const s = memStorage();
    const seen: any[][] = [];
    const off = subscribeBlocked(list => seen.push(list));
    await block(s, 'u9', '지나');
    expect(seen[seen.length - 1]).toEqual([{uid: 'u9', name: '지나'}]);
    await unblock(s, 'u9');
    expect(seen[seen.length - 1]).toEqual([]);
    off();
    await block(s, 'u10');
    // 해제한 뒤에는 더 이상 받지 않는다(언마운트 후 setState 방지).
    expect(seen[seen.length - 1]).toEqual([]);
  });

  test('구독자 하나가 던져도 나머지에게 전파는 계속된다', async () => {
    const s = memStorage();
    const ok: any[][] = [];
    const offBad = subscribeBlocked(() => { throw new Error('구독자 사고'); });
    const offOk = subscribeBlocked(list => ok.push(list));
    await expect(block(s, 'u1')).resolves.toEqual([{uid: 'u1'}]);
    expect(ok[ok.length - 1]).toEqual([{uid: 'u1'}]);
    offBad(); offOk();
  });

  test('resetBlockedCache 는 메모리만 비운다 — 저장소를 지우면 사용자 데이터 파괴다', async () => {
    const s = memStorage();
    await block(s, 'u1');
    expect(JSON.parse(s.map.get(BLOCKED_UIDS_KEY)!)).toEqual([{uid: 'u1'}]);
    resetBlockedCache();
    expect(blockedSnapshot()).toEqual([]);
    expect(JSON.parse(s.map.get(BLOCKED_UIDS_KEY)!)).toEqual([{uid: 'u1'}]); // 저장소는 그대로
  });

  test('저장이 실패해도 메모리 상태는 갱신된다 — 눌렀는데 안 바뀌면 고장으로 읽힌다', async () => {
    const failing = {
      async getItem() { throw new Error('io'); },
      async setItem() { throw new Error('io'); },
    };
    await expect(block(failing as any, 'u1')).resolves.toEqual([{uid: 'u1'}]);
    expect(blockedSnapshot()).toEqual([{uid: 'u1'}]);
  });
});

describe('배선 확인 — 화면이 실제로 이 스토어를 쓴다', () => {
  // 순수 모듈만 검사하면 "스토어는 옳은데 화면이 안 쓰는" 상태를 못 잡는다.
  // 2026-08-07 고도 버그가 정확히 그것이었다(상한을 만들고 호출부가 인자를 안 넘김).
  const read = (f: string) => require('fs').readFileSync(require('path').join(__dirname, '../../..', f), 'utf8');

  test('랭킹 화면이 구독하고, 마운트마다 force 로 다시 읽는다', () => {
    const src = read('HallOfFameScreen.rn.tsx');
    expect(src).toContain('subscribeBlocked');
    expect(src).toContain('ensureBlockedLoaded(AsyncStorage, true)');
  });

  test('랭킹 목록과 신발 집계가 **같은** 필터를 통과한다', () => {
    const src = read('HallOfFameScreen.rn.tsx');
    // 목록만 거르고 집계를 안 거르면 차단한 사람의 신발이 통계로 되돌아온다.
    expect(src).toContain('visibleEntries.map(e => renderRow');
    expect(src).toContain('shoeTrends(visibleEntries');
  });

  test('프로필 화면에 신고·차단 진입점이 있다', () => {
    const src = read('RunnerProfileScreen.rn.tsx');
    expect(src).toContain('runner-profile-more');
    expect(src).toContain('submitReport');
    expect(src).toContain('blockRunner');
  });

  // 프로필 화면이 "설정에서 언제든 해제할 수 있어요"라고 약속한다.
  // 그 화면이 없으면 **앱이 거짓말하는 것**이다(MISSION.md — Truth only).
  test('약속한 해제 자리가 실제로 있다 — 설정의 「차단한 러너」', () => {
    const profile = read('RunnerProfileScreen.rn.tsx');
    expect(profile).toContain('설정에서 언제든 해제할 수 있어요');
    const settings = read('ProfileScreen.rn.tsx');
    expect(settings).toContain('settings-blocked-runners');
    expect(settings).toContain('unblockRunner');
  });

  // 심사(1.2)는 신고·차단이 **약관에 적혀 있을 것**까지 본다.
  test('약관에 공개 콘텐츠 정책(금지 행위·신고·차단·조치)이 있다', () => {
    const terms = read('docs/terms.html');
    for (const k of ['금지 행위', '신고하기', '차단하기', '24시간 이내에 검토', '차단한 러너']) {
      expect(terms).toContain(k);
    }
  });

  // 신고는 서버로 나가므로 수집 항목이다. 처리방침에 없으면 미고지 수집이다.
  test('처리방침에 신고 수집이 고지돼 있고, 차단은 서버에 저장하지 않는다고 적혀 있다', () => {
    const privacy = read('docs/privacy.html');
    expect(privacy).toContain('신고 내역');
    expect(privacy).toContain('차단 목록은 서버에 저장하지 않습니다');
  });
});
