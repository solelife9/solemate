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
