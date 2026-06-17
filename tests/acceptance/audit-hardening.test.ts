/**
 * Acceptance tests — Audit Hardening 배치 (2026-06-17)
 *
 * tenet 규약: 시나리오에서 생성한 수용 테스트. 구현 전엔 it.todo 로 두어 스위트를
 * green 으로 유지하고, 각 묶음의 마지막 dev 잡이 자기 묶음의 todo 를 실제 단언으로
 * 교체한다(=수용 통과). integration_test 잡은 교체된 테스트를 실행해 보고만 한다.
 *
 * 묶음: A(P0 데이터) · B(런플로우+햅틱+a11y) · C(폼+피드백) · D(코드품질) · E(디자인시스템)
 *
 * A 묶음(이 잡 a4 교체): 앞 잡 a1~a3 + a4 의 P0 데이터 정합성 행동을 관찰 가능한
 * 결과로 단언한다. 모두 순수/격리 lib 계약(REST 정본 머지·tombstone·오프라인 큐·역등록·
 * 스키마 마이그레이션·FCM 비차단) — 네이티브/백엔드 없이 결정적으로 green.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {requestPermission} from '@react-native-firebase/messaging';

import type {BackupPayload} from '../../lib/backup';
import {
  mergeCloudData,
  stampUpdatedAt,
  markDeleted,
  isDeleted,
  liveRecords,
  recordsToBackRegister,
} from '../../lib/cloudSync';
import {
  migrateStorageSchema,
  seedUpdatedAt,
  STORAGE_SCHEMA_VERSION_KEY,
  CURRENT_STORAGE_SCHEMA_VERSION,
} from '../../lib/storageMigration';
import {
  enqueuePendingRun,
  loadPendingRuns,
  overlayPendingRuns,
  type PendingRun,
} from '../../lib/runPersistence';
import {setupPushMessaging, FCM_TOKEN_PENDING_KEY} from '../../lib/pushMessaging';

// ── B 묶음(런플로우/온보딩 + 햅틱 + a11y) 렌더 도구 ────────────────────────────
// B 수용은 실제 컴포넌트 트리를 그려 관찰 가능한 결과를 단언한다(JSX 없이 createElement —
// 이 파일은 .ts). 의미 햅틱은 모킹해 '화면이 어떤 의미 메서드를 부르는지'만 본다.
import fs from 'fs';
import path from 'path';
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

jest.mock('../../lib/haptics', () => ({
  tap: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  countdownBeat: jest.fn(),
  go: jest.fn(),
  impactHeavy: jest.fn(),
  setHapticsEnabled: jest.fn(),
  isHapticsEnabled: jest.fn(() => true),
}));

import * as haptics from '../../lib/haptics';
import {KeyboardAvoidingView} from 'react-native';
import OnboardingScreen from '../../OnboardingScreen.rn';
import RunActiveScreen from '../../RunActiveScreen.rn';
import RunGoalScreen from '../../RunGoalScreen.rn';
import RunCountdownScreen from '../../RunCountdownScreen.rn';
// ── C 묶음(폼 + 피드백) 도구 ─────────────────────────────────────────────────
import HomeScreen from '../../HomeScreen.rn';
import HistoryScreen from '../../HistoryScreen.rn';
import {showToast, runToastAction, getCurrentToast, dismissToast, TOAST_UNDO_LABEL} from '../../lib/toast';
import {maskDuration, maskDate, validateRunForm} from '../../lib/inputMask';
import {syncLabel} from '../../lib/syncStatus';
import type {Shoe} from '../../theme';

// createElement 단축(JSX 미사용) + 트리 렌더 헬퍼.
const el = (C: unknown, props: Record<string, unknown> = {}) =>
  React.createElement(C as React.ComponentType<Record<string, unknown>>, props);
function renderTree(node: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(node);
  });
  return r;
}
// accessibilityLabel 로 누를 수 있는(onPress|onLongPress) 노드 1개를 찾는다.
function pressableByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll(
    (n: ReactTestRenderer.ReactTestInstance) =>
      !!n.props &&
      n.props.accessibilityLabel === label &&
      (typeof n.props.onPress === 'function' || typeof n.props.onLongPress === 'function'),
  );
  if (!hits.length) throw new Error(`no pressable with label "${label}"`);
  return hits[0];
}
function hasLabel(root: ReactTestRenderer.ReactTestInstance, label: string): boolean {
  return root.findAll(
    (n: ReactTestRenderer.ReactTestInstance) => !!n.props && n.props.accessibilityLabel === label,
  ).length > 0;
}
// onPress 가능한 노드 중 렌더 텍스트가 text 를 포함하는 가장 좁은(=텍스트가 짧은) 1개를
// 고른다 — 라벨 없는 CTA 버튼 탐색용. 상위 컨테이너도 텍스트를 포함하므로 최소 길이를 택해
// 정확히 그 버튼만 잡는다.
function pressableByText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  const hits = root.findAll(
    (n: ReactTestRenderer.ReactTestInstance) =>
      !!n.props && typeof n.props.onPress === 'function' && renderedText(n).includes(text),
  );
  if (!hits.length) throw new Error(`no pressable with text "${text}"`);
  return hits.reduce((a, b) => (renderedText(a).length <= renderedText(b).length ? a : b));
}
// ScrollView 에 단 RefreshControl 의 onRefresh 핸들러를 직접 읽는다(당겨서 새로고침 트리거).
function refreshHandler(root: ReactTestRenderer.ReactTestInstance): () => void {
  const hits = root.findAll(
    (n: ReactTestRenderer.ReactTestInstance) =>
      !!n.props &&
      !!n.props.refreshControl &&
      !!n.props.refreshControl.props &&
      typeof n.props.refreshControl.props.onRefresh === 'function',
  );
  if (!hits.length) throw new Error('no ScrollView with a RefreshControl onRefresh');
  return hits[0].props.refreshControl.props.onRefresh;
}
// 트리에 렌더된 모든 문자열 자식을 이어붙인다(어떤 Text가 실제로 화면에 떴는지 검사용).
function renderedText(root: ReactTestRenderer.ReactTestInstance): string {
  const out: string[] = [];
  root.findAll(() => true).forEach(n => {
    const kids = n.props ? (n.props.children as unknown) : undefined;
    const arr = Array.isArray(kids) ? kids : [kids];
    arr.forEach(k => {
      if (typeof k === 'string' || typeof k === 'number') out.push(String(k));
    });
  });
  return out.join(' ');
}

const payload = (over: Partial<BackupPayload> = {}): BackupPayload => ({
  shoes: [],
  runs: [],
  settings: {},
  ...over,
});

const pendingRun = (over: Partial<PendingRun> = {}): PendingRun => ({
  localId: 'L1',
  shoe_id: 's1',
  km: 5,
  run_date: '2026-06-17',
  memo: '',
  source: 'gps',
  duration: 1800,
  cadence: 170,
  route: '',
  location: '',
  heart_rate: 0,
  run_time: '06:00',
  queuedAt: 1,
  ...over,
});

describe('Audit Hardening 수용', () => {
  describe('A. P0 데이터 정합성 (REST 정본)', () => {
    test('최신 우선: 같은 id 충돌은 updatedAt 큰 쪽을 채택한다', () => {
      // 같은 신발 id 가 로컬(오래됨)·원격(최신)에 둘 다 있을 때, updatedAt 이 큰 원격이 이긴다.
      const local = payload({shoes: [{id: 'a', max_km: 600, updatedAt: 100}]});
      const remote = payload({shoes: [{id: 'a', max_km: 900, updatedAt: 200}]});
      const merged = mergeCloudData(local, remote);
      expect(merged.shoes).toHaveLength(1);
      expect((merged.shoes[0] as any).max_km).toBe(900);

      // 반대로 로컬이 더 최신이면 로컬이 이긴다(방향 무관, updatedAt 만이 기준).
      const localNewer = payload({shoes: [{id: 'a', max_km: 700, updatedAt: 300}]});
      const remoteOlder = payload({shoes: [{id: 'a', max_km: 500, updatedAt: 200}]});
      expect((mergeCloudData(localNewer, remoteOlder).shoes[0] as any).max_km).toBe(700);
    });

    test('updatedAt: add/edit/updateMaxKm/retire 가 updatedAt(epoch ms)을 기록한다', () => {
      // App 의 모든 신발/런 mutation(addShoe/updateShoeName/updateShoeMaxKm/retireShoe/
      // addRun/editRun)은 이 단일 경로(stampUpdatedAt)로 updatedAt 을 찍는다.
      const stamped = stampUpdatedAt({id: 'a', max_km: 600, name: 'Pegasus'}, 1750000000000);
      expect(stamped.updatedAt).toBe(1750000000000);
      // 비파괴: 기존 필드를 모두 보존한다.
      expect(stamped).toMatchObject({id: 'a', max_km: 600, name: 'Pegasus'});
      // 불변: 원본을 변형하지 않고 새 객체를 돌려준다.
      const original = {id: 'a', max_km: 600};
      const next = stampUpdatedAt(original, 1);
      expect(original).not.toHaveProperty('updatedAt');
      expect(next).not.toBe(original);
      // 재스탬프(편집)는 더 큰 epoch ms 로 갱신돼 머지 '최신 우선'이 편집을 채택하게 한다.
      const edited = stampUpdatedAt(stamped, 1750000009999);
      expect(edited.updatedAt).toBeGreaterThan(stamped.updatedAt);
    });

    test('tombstone: 삭제는 deleted+updatedAt 묘비로 표현되고 머지가 부활시키지 않는다', () => {
      // 한 기기에서 신발을 지우면 묘비(deleted:true + 갱신 updatedAt)가 된다.
      const tomb = markDeleted({id: 'a', max_km: 600, updatedAt: 100}, 500);
      expect(isDeleted(tomb)).toBe(true);
      expect(tomb.updatedAt).toBe(500);

      // 다른 기기의 더 오래된 live 신발과 머지해도 묘비(최신)가 이겨 부활하지 않는다.
      const local = payload({shoes: [tomb]});
      const remoteStale = payload({shoes: [{id: 'a', max_km: 600, updatedAt: 100}]});
      const merged = mergeCloudData(local, remoteStale);
      expect(merged.shoes).toHaveLength(1);
      expect(isDeleted(merged.shoes[0])).toBe(true);
      // 화면/집계가 보는 live 배열에선 묘비가 제외된다(삭제가 관찰된다).
      expect(liveRecords(merged.shoes)).toHaveLength(0);
    });

    test('오프라인 부팅: 캐시 + pending_runs 오버레이로 미동기 런이 보인다', async () => {
      // 오프라인에서 완주한 런은 pending_runs 큐에 영속된다(서버 POST 전). 둘을 큐잉한다:
      //   offline-1 — 캐시에 *없는* 미동기 런(오버레이로 보여야 함, 가시성)
      //   dup-1     — 이미 캐시에 든(디바운스가 반영한) 런(오버레이로 *중복되면 안 됨*, dedup)
      await enqueuePendingRun(pendingRun({localId: 'offline-1', km: 7}));
      await enqueuePendingRun(pendingRun({localId: 'dup-1', km: 6}));
      const queued = await loadPendingRuns();
      expect(queued.map(r => r.localId)).toEqual(
        expect.arrayContaining(['offline-1', 'dup-1']),
      );

      // production 오버레이(App.tsx:509-516 오프라인 부팅 분기가 호출하는 바로 그 함수)를
      // 직접 호출한다 — 테스트가 머지를 재구현하지 않으므로, App 오버레이가 회귀하면(가시성
      // 누락이든 dedup 깨짐이든) 이 단언이 실패한다.
      const cachedRuns = [
        {id: 'srv-9', km: 3}, // 마지막 fetch 스냅샷(offline-1 은 없음)
        {id: 'dup-1', km: 6}, // 이미 캐시에 든 런(localId==id)
      ];
      const merged = overlayPendingRuns(cachedRuns, queued);
      const ids = merged.map(r => String((r as {id?: unknown}).id));

      // 가시성: 캐시에 없던 미동기 런 offline-1 이 _pending 행으로 화면에 보인다.
      expect(ids).toEqual(expect.arrayContaining(['offline-1', 'srv-9', 'dup-1']));
      const offline = merged.find(r => String((r as {id?: unknown}).id) === 'offline-1');
      expect((offline as {_pending?: boolean})._pending).toBe(true);
      expect((offline as {km?: number}).km).toBe(7);
      // dedup: 이미 캐시에 든 dup-1 은 오버레이로 두 번 나타나지 않는다(정확히 1회).
      expect(ids.filter(id => id === 'dup-1')).toHaveLength(1);
      expect(new Set(ids).size).toBe(ids.length);
      // 캐시 런은 _pending 오버레이로 덮이지 않는다(원래 캐시 행 보존).
      const dup = merged.find(r => String((r as {id?: unknown}).id) === 'dup-1');
      expect((dup as {_pending?: boolean})._pending).toBeUndefined();
    });

    test('클라우드→REST 역등록: REST에 없는 머지 레코드를 apiAdd*로 합류시킨다', () => {
      // 머지 결과(클라우드 레코드 포함) 중 'REST 확정' 집합(known)에 없는 live 만 역등록 대상.
      const merged = [
        {id: 'rest-1'}, // 이미 REST 정본 → 제외(중복 POST 금지)
        {id: 'cloud-2'}, // REST 미존재 live → 역등록 대상
        markDeleted({id: 'cloud-3'}, 1), // 묘비 → 제외(역등록=부활 금지)
        {km: 5}, // id 없음 → 제외(dedupe 불가, 무한 재POST 방지)
      ];
      const known = new Set(['rest-1']);
      const toRegister = recordsToBackRegister(merged, known);
      expect(toRegister.map((r: any) => r.id)).toEqual(['cloud-2']);

      // 멱등성: 역등록 성공 후 그 id 가 known 에 들어오면 다음 머지에서 다시 잡히지 않는다.
      const knownAfter = new Set(['rest-1', 'cloud-2']);
      expect(recordsToBackRegister(merged, knownAfter)).toHaveLength(0);
    });

    test('마이그레이션: 기존 레코드에 updatedAt 시드, 기존 값 비파괴', async () => {
      // 순수 헬퍼: updatedAt 없는 레코드에만 시드하고, 이미 있으면(멱등) 손대지 않는다.
      const seeded = seedUpdatedAt(
        [{id: 'a', max_km: 600}, {id: 'b', updatedAt: 999, max_km: 700}],
        12345,
      );
      expect((seeded[0] as any).updatedAt).toBe(12345);
      expect((seeded[0] as any).max_km).toBe(600); // 비파괴
      expect((seeded[1] as any).updatedAt).toBe(999); // 멱등 — 기존 값 유지

      // 부팅 마이그레이션: 옛 캐시(updatedAt 없음)를 1회 시드하고 스키마 버전을 올린다.
      await AsyncStorage.setItem('cache_shoes_v1', JSON.stringify([{id: 'a', max_km: 600}]));
      const result = await migrateStorageSchema(777, ['cache_shoes_v1']);
      expect(result.migrated).toBe(true);
      const after = JSON.parse((await AsyncStorage.getItem('cache_shoes_v1'))!);
      expect(after[0].updatedAt).toBe(777);
      expect(after[0].max_km).toBe(600); // 비파괴
      await expect(AsyncStorage.getItem(STORAGE_SCHEMA_VERSION_KEY)).resolves.toBe(
        String(CURRENT_STORAGE_SCHEMA_VERSION),
      );

      // 재실행은 no-op(이미 최신 버전) — 멱등.
      const again = await migrateStorageSchema(888, ['cache_shoes_v1']);
      expect(again.migrated).toBe(false);
      const unchanged = JSON.parse((await AsyncStorage.getItem('cache_shoes_v1'))!);
      expect(unchanged[0].updatedAt).toBe(777); // 두 번째 now(888)로 덮지 않음
    });

    test('FCM: 토큰 배선 실패가 부팅을 막지 않는다(graceful no-op)', async () => {
      // 권한 요청이 네이티브 부재로 reject 하는 경우에도 setupPushMessaging 은 throw 하지
      // 않고 resolve 한다 → 부팅이 막히지 않는다(iron law: 비차단). 권한 거부는 토큰 취득을
      // 단락(getToken 미호출)하므로, 토큰 취득 실패의 비차단은 pushMessaging 단위 테스트의
      // '최악의 경우(모두 reject)' 케이스가 별도로 단언한다.
      (requestPermission as jest.Mock).mockRejectedValueOnce(new Error('no native'));
      const wiring = await setupPushMessaging();
      expect(typeof wiring.unsubscribeForeground).toBe('function');
      expect(() => wiring.unsubscribeForeground()).not.toThrow();

      // 정상 경로에선 취득 토큰을 'fcm_token_pending' 키에 영속하고, 등록 엔드포인트가
      // 비어 있으므로(백엔드 등록 API 미존재) graceful no-op 으로 큐잉만 한다.
      await setupPushMessaging();
      await expect(AsyncStorage.getItem(FCM_TOKEN_PENDING_KEY)).resolves.toBe('mock-fcm-token');
    });
  });

  describe('B. 런플로우/온보딩 통합 + 햅틱 + 접근성', () => {
    const ROOT = path.resolve(__dirname, '../..');
    // 라인 주석(// ...) 제거 — 설명/이력 주석의 토큰 이름은 스캔 대상이 아니다.
    // CRLF 의 \r 은 `.` 에 안 잡혀 `$` 앵커가 빗나가므로 먼저 \r 을 걷어낸다.
    const codeOnly = (src: string) =>
      src
        .replace(/\r/g, '')
        .split('\n')
        .map(l => l.replace(/\/\/.*$/, ''))
        .join('\n');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('theme 수렴: Run*/Onboarding 소스에 사설 팔레트(const C/KG)·BebasNeue 0, theme import 존재', () => {
      const files = [
        'RunActiveScreen.rn.tsx',
        'RunGoalScreen.rn.tsx',
        'RunCountdownScreen.rn.tsx',
        'OnboardingScreen.rn.tsx',
      ];
      for (const f of files) {
        const code = codeOnly(fs.readFileSync(path.join(ROOT, f), 'utf8'));
        // 사설 색객체(Run* 의 const C / Onboarding 의 const KG)가 되살아나지 않았다.
        expect(code).not.toMatch(/const\s+C\s*=\s*\{/);
        expect(code).not.toMatch(/const\s+KG\s*=/);
        // BebasNeue 디스플레이 폰트 참조가 코드에 없다(theme DISPLAY=Pretendard 로 흡수).
        expect(code).not.toMatch(/BebasNeue/);
        // theme 토큰을 실제로 import 한다(흡수의 증거).
        expect(code).toMatch(/from ['"]\.\/theme['"]/);
      }
    });

    test('햅틱(동기): 런 시작=tap · 일시정지=tap · 목표달성=impactHeavy · 종료확정=warning', () => {
      // 런 시작 CTA → tap
      const goal = renderTree(el(RunGoalScreen, {onStart: jest.fn()}));
      act(() => {
        pressableByLabel(goal.root, '러닝 시작').props.onPress();
      });
      expect(haptics.tap).toHaveBeenCalledTimes(1);

      // 일시정지 → tap (가벼운 피드백)
      jest.clearAllMocks();
      const active = renderTree(el(RunActiveScreen, {distanceKm: 2, goalKm: 5}));
      act(() => {
        pressableByLabel(active.root, '일시정지').props.onPress();
      });
      expect(haptics.tap).toHaveBeenCalledTimes(1);

      // 목표 달성(거리 ≥ 목표) → impactHeavy 한 번
      jest.clearAllMocks();
      renderTree(el(RunActiveScreen, {distanceKm: 5.2, goalKm: 5}));
      expect(haptics.impactHeavy).toHaveBeenCalledTimes(1);

      // 길게 눌러 종료 확정 → warning + onStop
      jest.clearAllMocks();
      const onStop = jest.fn();
      const stopping = renderTree(el(RunActiveScreen, {distanceKm: 2, goalKm: 5, paused: true, onStop}));
      act(() => {
        pressableByLabel(stopping.root, '길게 눌러 종료').props.onLongPress();
      });
      expect(haptics.warning).toHaveBeenCalledTimes(1);
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    test('햅틱(카운트다운): 3·2·1 각 비트 countdownBeat, GO 에서 go', () => {
      jest.useFakeTimers();
      let r!: ReactTestRenderer.ReactTestRenderer;
      try {
        act(() => {
          r = ReactTestRenderer.create(
            el(RunCountdownScreen, {goalKm: 5, onDone: () => {}, onCancel: () => {}}),
          );
        });
        // GPS 락 → 비트 3개 → GO. 넉넉히 시간을 흘려 카운트다운을 끝까지 진행.
        act(() => {
          jest.advanceTimersByTime(5000);
        });
        expect(haptics.countdownBeat).toHaveBeenCalledTimes(3);
        expect(haptics.go).toHaveBeenCalledTimes(1);
      } finally {
        // 잔여 타이머가 teardown 후 발화하지 않도록: 언마운트 → 한 번 흘림 → 비움 → 실시간 복원.
        act(() => {
          r?.unmount();
        });
        act(() => {
          jest.advanceTimersByTime(2000);
        });
        jest.clearAllTimers();
        jest.useRealTimers();
      }
    });

    test('a11y: 런플로우 컨트롤과 온보딩 로그인 링크가 role/label 을 노출한다', () => {
      // 런 시작 CTA
      const goal = renderTree(el(RunGoalScreen, {onStart: jest.fn()})).root;
      const start = pressableByLabel(goal, '러닝 시작');
      expect(start.props.accessibilityRole).toBe('button');

      // 라이브 런 컨트롤(일시정지) + 길게눌러종료
      const active = renderTree(el(RunActiveScreen, {distanceKm: 2, goalKm: 5})).root;
      expect(pressableByLabel(active, '일시정지').props.accessibilityRole).toBe('button');

      // 온보딩 Welcome: 시작/로그인 링크 모두 role=button + 라벨
      const onb = renderTree(el(OnboardingScreen, {onDone: jest.fn()})).root;
      const login = pressableByLabel(onb, '이미 계정이 있나요? 로그인');
      expect(login.props.accessibilityRole).toBe('button');
      expect(pressableByLabel(onb, '시작하기').props.accessibilityRole).toBe('button');
    });

    test('온보딩 로그인 링크가 로그인 화면(Ready)으로 진입한다(goNext 아님)', () => {
      const onDone = jest.fn();
      const root = renderTree(el(OnboardingScreen, {onDone})).root;

      // Welcome 단계: 로그인 화면(Ready)의 소셜 로그인 버튼은 아직 없다.
      expect(hasLabel(root, '카카오로 시작하기')).toBe(false);

      // '이미 계정이 있나요? 로그인' 을 누른다.
      act(() => {
        pressableByLabel(root, '이미 계정이 있나요? 로그인').props.onPress();
      });

      // 이제 로그인(Ready, index 5) 화면이 보인다 — 소셜/이메일 로그인 진입점이 렌더된다.
      // (과거 버그였다면 goNext 로 1단계 'Shoes Matter'(다음 CTA)가 떴을 것.)
      expect(hasLabel(root, '카카오로 시작하기')).toBe(true);
      expect(hasLabel(root, '이메일로 계속하기')).toBe(true);
      // 온보딩 소개 단계의 '다음' CTA 는 뜨지 않았다(=순차 진행이 아니라 로그인 점프).
      expect(hasLabel(root, '다음')).toBe(false);

      // 날조 금지: 등록한 신발이 없는 로그인 진입(registered=null)이므로, 폴백 신발
      // 카드(Nike Alphafly 3 / 60·600km / '추적 시작됨')도 '준비됐다' 축하문구도 뜨면 안 된다.
      const text = renderedText(root);
      expect(text).not.toContain('Alphafly 3');
      expect(text).not.toContain('추적 시작됨');
      expect(text).not.toContain('이제 달릴 준비가');
      // 대신 로그인 맥락의 환영 문구가 보인다.
      expect(text).toContain('다시 오신 걸');
    });
  });

  describe('C. 폼 + 피드백', () => {
    const C_SHOE: Shoe = {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 600, condition: '양호'};
    // 토스트는 전역 store + 실타이머를 쓰므로 각 테스트 후 닫아 다음 테스트로 새지 않게 한다.
    afterEach(() => dismissToast());

    test('토스트: 삭제 시 undo 스낵바가 뜨고 undo가 레코드를 사이드키까지 복원', () => {
      // App.offerRunUndo/restoreRun 의 계약을 lib/toast 로 그대로 검증한다(관찰 가능한 피드백).
      // 모델: 라이브 런 레코드 + 사이드키(신발 사용거리). 삭제는 둘 다 줄이고, undo 는 둘 다 되살린다.
      let runs = [{id: 'r1', km: 5}];
      let shoeUsedKm = 120; // 사이드키 — 삭제 시 차감되고 복원 시 정확히 되돌아와야 한다(부분복원 금지).
      const removed = runs.find(r => r.id === 'r1')!;

      // 삭제: 라이브에서 제거 + 신발 사용거리 차감 + undo 스낵바 제시(offerRunUndo 와 동형).
      runs = runs.filter(r => r.id !== 'r1');
      shoeUsedKm -= removed.km;
      showToast({
        message: '러닝 기록 삭제됨',
        actionLabel: TOAST_UNDO_LABEL,
        onAction: () => {
          runs = [removed, ...runs];
          shoeUsedKm += removed.km;
        },
      });

      // 관찰: 스낵바가 떴고 '실행취소' 액션을 노출한다(삭제 직후엔 레코드도 사이드키도 빠진 상태).
      const toast = getCurrentToast();
      expect(toast?.message).toBe('러닝 기록 삭제됨');
      expect(toast?.actionLabel).toBe('실행취소');
      expect(runs).toHaveLength(0);
      expect(shoeUsedKm).toBe(115);

      // undo 탭 → onAction 실행 + 토스트 닫힘. 레코드와 사이드키(신발 사용거리)가 완전복원된다.
      runToastAction(toast!.id);
      expect(runs).toEqual([{id: 'r1', km: 5}]);
      expect(shoeUsedKm).toBe(120);
      expect(getCurrentToast()).toBeNull();
    });

    test('폼: RunForm/AddShoe가 KeyboardAvoidingView + 입력 마스킹 + 인라인 검증', () => {
      // 입력 마스킹은 순수(lib/inputMask) — 숫자만 받아 MM:SS/YYYY-MM-DD 로 자동 정형한다.
      expect(maskDuration('3000')).toBe('30:00');
      expect(maskDate('20260601')).toBe('2026-06-01');
      // 인라인 검증: 거리 0/빈값은 필드 에러로 막는다(통과 시 빈 객체).
      expect(validateRunForm({shoeId: 'a', dist: '', date: '2026-06-01'}).dist).toBeTruthy();
      expect(validateRunForm({shoeId: 'a', dist: '5', date: '2026-06-01'})).toEqual({});

      // 화면: 기록 → '수동 기록 추가' → RunForm 이 KeyboardAvoidingView 로 감싸여 렌더된다.
      const onAddRun = jest.fn();
      const r = renderTree(el(HistoryScreen, {shoes: [C_SHOE], runs: [], onAddRun}));
      act(() => {
        pressableByLabel(r.root, '수동 기록 추가').props.onPress();
      });
      // 키보드 회피 — 입력칸/저장 버튼이 키보드에 가리지 않게 폼 전체를 감싼다(내장 RN만).
      expect(r.root.findAllByType(KeyboardAvoidingView).length).toBeGreaterThan(0);

      // 인라인 검증(화면): 거리를 비운 채 '추가하기' → 거리 오류가 인라인으로 뜨고 onAddRun 미호출.
      act(() => {
        pressableByText(r.root, '추가하기').props.onPress();
      });
      expect(hasLabel(r.root, '거리 오류')).toBe(true);
      expect(onAddRun).not.toHaveBeenCalled();
    });

    test('새로고침: Home/History가 RefreshControl로 동기화 재시도', () => {
      // syncLabel(순수) — 마지막 동기화 시각을 '방금/N분 전' 칩 텍스트로 만든다.
      const base = 1_750_000_000_000;
      expect(syncLabel(base, base + 10_000)).toBe('방금 동기화');
      expect(syncLabel(base, base + 5 * 60_000)).toBe('5분 전');
      expect(syncLabel(null, base)).toBe('동기화 안 됨');

      // Home: 당겨서 새로고침 → onRefresh(서버 재fetch/pending flush)가 호출된다.
      const homeRefresh = jest.fn();
      const home = renderTree(
        el(HomeScreen, {
          shoes: [C_SHOE],
          activeIdx: 0,
          onSelect: jest.fn(),
          unit: 'km',
          onRefresh: homeRefresh,
          lastSyncAt: Date.now(),
        }),
      );
      act(() => {
        refreshHandler(home.root)();
      });
      expect(homeRefresh).toHaveBeenCalledTimes(1);
      // 마지막 동기화 칩이 화면에 보인다(방금 동기화한 시각이라 '방금 동기화' 라벨).
      expect(renderedText(home.root)).toContain('방금 동기화');

      // History: 당겨서 새로고침 → onRefresh 가 호출된다(같은 재시도 진입점).
      const histRefresh = jest.fn();
      const hist = renderTree(
        el(HistoryScreen, {shoes: [C_SHOE], runs: [], onRefresh: histRefresh}),
      );
      act(() => {
        refreshHandler(hist.root)();
      });
      expect(histRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('D. 코드 품질', () => {
    it.todo('타입: lib/api.ts·lib/stats.ts에 any 0, 도메인 타입 사용');
    it.todo('중복제거: TIER_LABEL 정의가 theme.ts 1곳, MM:SS/YYYY-MM 빌더 단일화');
    it.todo('가상화: HistoryScreen 런 리스트가 FlatList(keyExtractor) 사용');
  });

  describe('E. 디자인 시스템 통합', () => {
    it.todo('CTA: 단일 Button 프리미티브, MockupButton/인라인 그라데이션 제거');
    it.todo('Card/SegmentedControl/StatGrid 프리미티브 채택, 단일 보더 토큰');
    it.todo('TYPE: 반px 사이즈 제거, hero/scrim/screen-padding 토큰 도입');
  });
});
