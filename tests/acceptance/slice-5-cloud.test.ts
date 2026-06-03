// ============================================================================
// Acceptance tests — Slice 5(Firebase 부분): 계정 클라우드 동기 순수 로직
// slice: 5   tag: @slice-5
//
// Firebase 인증/Firestore 동기의 순수-로직 계약. 네이티브 통합(@react-native-
// firebase 설치·forceStaticLinking·google-services 플러그인), 로그인 UI, 실연동은
// 네이티브 잡 + 사용자 실기기에서 검증한다. 여기서는 데이터 무손실 병합·이관·인증
// 상태머신을 순수 함수로만 단언한다(google-services.json 불요).
//
// NOTE: 각 describe 는 .skip 으로 시작한다(스텁 단계 — npm test green 유지). lib/
// cloudSync.ts 가 throw 스텁이라 본문이 실행되면 실패하므로, 구현 잡(slice-5-fb-
// synclogic)이 모듈을 구현한 뒤 자기 블록의 `.skip` 을 제거한다. slice-5-fb-e2e 가
// 잔존 `.skip` 0 을 검증한다.
// ============================================================================

import type { BackupPayload } from '../../lib/backup';
import {
  nextAuthState,
  mergeCloudData,
  migrateDeviceToAccount,
} from '../../lib/cloudSync';

const shoe = (id: string, extra: object = {}) => ({ id, brand: 'Nike', model: 'Pegasus', ...extra });
const run = (id: string, extra: object = {}) => ({ id, distanceKm: 5, ...extra });
const payload = (over: Partial<BackupPayload> = {}): BackupPayload => ({
  shoes: [],
  runs: [],
  settings: {},
  ...over,
});

// ── 인증 상태머신 ────────────────────────────────────────────────────────────
describe.skip('@slice-5 인증 상태머신', () => {
  test('정상 로그인 흐름: signedOut→signingIn→signedIn', () => {
    expect(nextAuthState('signedOut', 'signInStart')).toBe('signingIn');
    expect(nextAuthState('signingIn', 'signInSuccess')).toBe('signedIn');
  });

  test('로그인 실패는 error, 로그아웃은 signedOut 으로', () => {
    expect(nextAuthState('signingIn', 'signInError')).toBe('error');
    expect(nextAuthState('signedIn', 'signOut')).toBe('signedOut');
  });

  test('부정 전이(이미 signedIn 인데 signInStart)는 현재 상태를 깨지 않는다', () => {
    expect(nextAuthState('signedIn', 'signInStart')).toBe('signedIn');
  });
});

// ── 클라우드 병합: 데이터 파괴 금지(iron law) ────────────────────────────────
describe.skip('@slice-5 클라우드 병합 무손실', () => {
  test('원격이 null 이면 로컬을 그대로 보존', () => {
    const local = payload({ shoes: [shoe('a')], runs: [run('r1')] });
    expect(mergeCloudData(local, null)).toEqual(local);
  });

  test('서로 다른 id 는 합집합으로 양쪽 모두 보존(어느 레코드도 유실 금지)', () => {
    const local = payload({ shoes: [shoe('a')], runs: [run('r1')] });
    const remote = payload({ shoes: [shoe('b')], runs: [run('r2')] });
    const merged = mergeCloudData(local, remote);
    expect(merged.shoes.map((s: any) => s.id).sort()).toEqual(['a', 'b']);
    expect(merged.runs.map((r: any) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  test('같은 id 충돌은 최신(updatedAt 큰 쪽)을 택한다', () => {
    const local = payload({ shoes: [shoe('a', { updatedAt: 100, model: 'Old' })] });
    const remote = payload({ shoes: [shoe('a', { updatedAt: 200, model: 'New' })] });
    const merged = mergeCloudData(local, remote);
    expect(merged.shoes).toHaveLength(1);
    expect((merged.shoes[0] as any).model).toBe('New');
  });

  test('settings 는 병합되어 양쪽 키를 모두 유지', () => {
    const local = payload({ settings: { units: 'km', weightKg: 70 } });
    const remote = payload({ settings: { units: 'mi', theme: 'dark' } });
    const merged = mergeCloudData(local, remote);
    expect(merged.settings).toHaveProperty('weightKg', 70);
    expect(merged.settings).toHaveProperty('theme', 'dark');
  });
});

// ── 기기→계정 마이그레이션: 무손실 ───────────────────────────────────────────
describe.skip('@slice-5 기기→계정 마이그레이션', () => {
  test('최초 로그인: 기존 계정 데이터가 없으면 기기 데이터를 그대로 이관', () => {
    const local = payload({ shoes: [shoe('a')], runs: [run('r1')] });
    expect(migrateDeviceToAccount(local, null)).toEqual(local);
  });

  test('계정에 데이터가 있어도 기기 데이터를 덮어쓰지 않고 양쪽 보존', () => {
    const local = payload({ shoes: [shoe('a')], runs: [run('r1')] });
    const remote = payload({ shoes: [shoe('b')], runs: [run('r2')] });
    const merged = migrateDeviceToAccount(local, remote);
    expect(merged.shoes.map((s: any) => s.id).sort()).toEqual(['a', 'b']);
    expect(merged.runs.map((r: any) => r.id).sort()).toEqual(['r1', 'r2']);
  });
});
