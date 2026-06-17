/**
 * lib/cloudSync 단위 테스트 — 클라우드 동기 순수 로직(엣지 포함).
 *
 * 관찰 가능한 계약을 검증한다:
 *   1) nextAuthState 상태머신 — 정상 전이 + 부정 전이 시 현재 상태 유지.
 *   2) mergeCloudData — id 합집합 무손실, 충돌 시 최신(updatedAt) 우선, settings 양키 보존.
 *   3) migrateDeviceToAccount — 기기 우선 무손실 이관.
 *   4) iron law — 어느 쪽 레코드도 버리지 않는다(빈 payload·다수 id·충돌 엣지).
 *
 * @format
 */
import type { BackupPayload } from '../../lib/backup';
import {
  nextAuthState,
  mergeCloudData,
  migrateDeviceToAccount,
  stampUpdatedAt,
  type AuthState,
} from '../../lib/cloudSync';

const payload = (over: Partial<BackupPayload> = {}): BackupPayload => ({
  shoes: [],
  runs: [],
  settings: {},
  ...over,
});

describe('nextAuthState', () => {
  test('정상 로그인 흐름과 실패/로그아웃 전이', () => {
    expect(nextAuthState('signedOut', 'signInStart')).toBe('signingIn');
    expect(nextAuthState('signingIn', 'signInSuccess')).toBe('signedIn');
    expect(nextAuthState('signingIn', 'signInError')).toBe('error');
  });

  test('signOut 은 어떤 상태에서도 signedOut 으로 떨어진다', () => {
    const states: AuthState[] = ['signedOut', 'signingIn', 'signedIn', 'error'];
    for (const s of states) {
      expect(nextAuthState(s, 'signOut')).toBe('signedOut');
    }
  });

  test('부정 전이는 현재 상태를 그대로 유지해 상태를 깨지 않는다', () => {
    expect(nextAuthState('signedIn', 'signInStart')).toBe('signedIn');
    expect(nextAuthState('signedOut', 'signInSuccess')).toBe('signedOut');
    expect(nextAuthState('error', 'signInError')).toBe('error');
    expect(nextAuthState('signedOut', 'signInError')).toBe('signedOut');
  });

  test('error 에서도 다시 로그인 시작이 가능하려면 signedOut 경유(error+signInStart 는 유지)', () => {
    // 부정 전이 보존 — 호출부는 error→signedOut(예: 재시도 버튼)→signInStart 로 흐른다.
    expect(nextAuthState('error', 'signInStart')).toBe('error');
  });
});

describe('mergeCloudData', () => {
  test('빈 local 과 빈 remote 는 빈 payload(레코드 0)로 안전', () => {
    const merged = mergeCloudData(payload(), payload());
    expect(merged.shoes).toEqual([]);
    expect(merged.runs).toEqual([]);
    expect(merged.settings).toEqual({});
  });

  test('remote 가 null 이면 local 을 그대로 반환', () => {
    const local = payload({ shoes: [{ id: 'a' }], runs: [{ id: 'r1' }] });
    expect(mergeCloudData(local, null)).toBe(local);
  });

  test('같은 id 다수 + 일부 충돌을 한 번에: 합집합 + 최신 우선 + 유실 0', () => {
    const local = payload({
      shoes: [
        { id: 'a', updatedAt: 100, v: 'localA' },
        { id: 'b', v: 'localB' },
        { id: 'c', updatedAt: 500, v: 'localC' },
      ],
    });
    const remote = payload({
      shoes: [
        { id: 'a', updatedAt: 200, v: 'remoteA' }, // 더 최신 → remote 채택
        { id: 'c', updatedAt: 300, v: 'remoteC' }, // 더 오래됨 → local 유지
        { id: 'd', v: 'remoteD' }, // remote 신규
      ],
    });
    const merged = mergeCloudData(local, remote);
    const byId = Object.fromEntries(merged.shoes.map((s: any) => [s.id, s.v]));
    expect(merged.shoes).toHaveLength(4); // a,b,c,d — 어느 것도 유실 없음
    expect(byId.a).toBe('remoteA');
    expect(byId.b).toBe('localB');
    expect(byId.c).toBe('localC');
    expect(byId.d).toBe('remoteD');
  });

  test('updatedAt 없는 충돌은 local 우선', () => {
    const local = payload({ runs: [{ id: 'r1', v: 'local' }] });
    const remote = payload({ runs: [{ id: 'r1', v: 'remote' }] });
    const merged = mergeCloudData(local, remote);
    expect(merged.runs).toHaveLength(1);
    expect((merged.runs[0] as any).v).toBe('local');
  });

  test('settings 충돌 키는 양쪽 보존하되 local 우선', () => {
    const local = payload({ settings: { units: 'km', weightKg: 70 } });
    const remote = payload({ settings: { units: 'mi', theme: 'dark' } });
    const merged = mergeCloudData(local, remote);
    expect(merged.settings.weightKg).toBe(70);
    expect(merged.settings.theme).toBe('dark');
    expect(merged.settings.units).toBe('km'); // 충돌 키는 local
  });

  test('id 없는 레코드도 버리지 않고 전부 보존', () => {
    const local = payload({ shoes: [{ noId: 1 }] });
    const remote = payload({ shoes: [{ noId: 2 }, { id: 'x' }] });
    const merged = mergeCloudData(local, remote);
    expect(merged.shoes).toHaveLength(3);
  });
});

describe('stampUpdatedAt', () => {
  test('주어진 now 로 updatedAt 을 스탬프하고 기존 필드를 모두 보존한다', () => {
    const out = stampUpdatedAt({id: 'a', name: 'Nike', max_km: 600}, 12345);
    expect(out).toEqual({id: 'a', name: 'Nike', max_km: 600, updatedAt: 12345});
  });

  test('원본을 변형하지 않고 새 객체를 돌려준다(불변)', () => {
    const src = {id: 'a'};
    const out = stampUpdatedAt(src, 1);
    expect(out).not.toBe(src);
    expect((src as any).updatedAt).toBeUndefined(); // 원본 불변
  });

  test('기존 updatedAt 도 새 값으로 갱신한다(mutation = 최신 시각)', () => {
    const out = stampUpdatedAt({id: 'a', updatedAt: 1}, 999);
    expect(out.updatedAt).toBe(999);
  });

  test('now 생략 시 현재 시각(epoch ms 양수)을 스탬프한다', () => {
    const before = Date.now();
    const out = stampUpdatedAt({id: 'a'});
    expect(typeof out.updatedAt).toBe('number');
    expect(out.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('mergeCloudData — 같은 id 충돌은 updatedAt 큰(최신) 쪽을 채택', () => {
  test('remote 가 더 최신이면 remote 를, local 이 더 최신이면 local 을 채택', () => {
    const local = payload({
      runs: [
        {id: 'r1', v: 'localR1', updatedAt: 100}, // remote 가 더 최신 → 교체됨
        {id: 'r2', v: 'localR2', updatedAt: 900}, // local 이 더 최신 → 유지됨
      ],
    });
    const remote = payload({
      runs: [
        {id: 'r1', v: 'remoteR1', updatedAt: 200},
        {id: 'r2', v: 'remoteR2', updatedAt: 300},
      ],
    });
    const byId = Object.fromEntries(
      mergeCloudData(local, remote).runs.map((r: any) => [r.id, r.v]),
    );
    expect(byId.r1).toBe('remoteR1'); // 최신 우선
    expect(byId.r2).toBe('localR2'); // 최신 우선
  });

  test('stampUpdatedAt 로 찍은 실데이터 형태에서도 최신 우선이 성립한다', () => {
    const older = stampUpdatedAt({id: 'r1', v: 'old'}, 1000);
    const newer = stampUpdatedAt({id: 'r1', v: 'new'}, 2000);
    const merged = mergeCloudData(payload({runs: [older]}), payload({runs: [newer]}));
    expect(merged.runs).toHaveLength(1);
    expect((merged.runs[0] as any).v).toBe('new');
  });
});

describe('migrateDeviceToAccount', () => {
  test('계정(remote)이 없으면 기기 데이터를 그대로 이관', () => {
    const local = payload({ shoes: [{ id: 'a' }] });
    expect(migrateDeviceToAccount(local, null)).toBe(local);
  });

  test('계정에 데이터가 있어도 기기 데이터를 덮어쓰지 않고 양쪽 보존', () => {
    const local = payload({ shoes: [{ id: 'a' }], runs: [{ id: 'r1' }] });
    const remote = payload({ shoes: [{ id: 'b' }], runs: [{ id: 'r2' }] });
    const merged = migrateDeviceToAccount(local, remote);
    expect(merged.shoes.map((s: any) => s.id).sort()).toEqual(['a', 'b']);
    expect(merged.runs.map((r: any) => r.id).sort()).toEqual(['r1', 'r2']);
  });
});
