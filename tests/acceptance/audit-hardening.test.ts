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
  sanitizePendingRun,
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
import {KeyboardAvoidingView, Alert, FlatList, StyleSheet, Text} from 'react-native';
import App from '../../App';
import {Button, Card, SegmentedControl, StatGrid, Stat} from '../../primitives';
// E 묶음(디자인 시스템) — CTA '단일 Button 프리미티브 경유'를 화면째 렌더해 단언하기 위한 컴포넌트.
import ChallengesSection from '../../ChallengesSection';
import RetirementFlow from '../../RetirementFlow.rn';
import ShoesScreen from '../../ShoesScreen.rn';
import ProfileScreen from '../../ProfileScreen.rn';
import {buildContext} from '../../lib/progression/context';
import OnboardingScreen from '../../OnboardingScreen.rn';
import RunActiveScreen from '../../RunActiveScreen.rn';
import RunGoalScreen from '../../RunGoalScreen.rn';
import RunCountdownScreen from '../../RunCountdownScreen.rn';
// ── C 묶음(폼 + 피드백) 도구 ─────────────────────────────────────────────────
import HomeScreen from '../../HomeScreen.rn';
import HistoryScreen from '../../HistoryScreen.rn';
import {runToastAction, getCurrentToast, dismissToast, TOAST_UNDO_LABEL} from '../../lib/toast';
import {maskDuration, maskDate, validateRunForm} from '../../lib/inputMask';
import {syncLabel} from '../../lib/syncStatus';
import type {Shoe, Run} from '../../theme';
import {
  TIER_LABEL, GRAD_TOP, GRAD_BOT, ACCENT, RADIUS,
  TYPE, HERO, GUTTER, SCRIM, CARD, CARD_BORDER, DISPLAY,
} from '../../theme';
import {ymLocal, ymdLocal} from '../../lib/format';

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
// 콜백 prop(onTab/onDeleteRun/onSetMaxKm…)을 가진 첫 노드를 찾는다(실제 <App/> 트리 탐색용).
function findByProp(root: ReactTestRenderer.ReactTestInstance, prop: string) {
  const hits = root.findAll(n => !!n.props && typeof n.props[prop] === 'function');
  if (!hits.length) throw new Error(`no component with prop: ${prop}`);
  return hits[0];
}
// ShoesScreen(tab 1)의 uiShoes 에서 한 신발의 사이드키(used=사용거리)를 읽는다.
function usedKmOf(root: ReactTestRenderer.ReactTestInstance, shoeId: string): number {
  const uiShoes = findByProp(root, 'onSetMaxKm').props.shoes as Array<{id: unknown; used: number}>;
  const s = uiShoes.find(x => String(x.id) === shoeId);
  if (!s) throw new Error(`no ui shoe: ${shoeId}`);
  return s.used;
}
// ShoesScreen 의 rawRuns(=live runs 그대로)에서 런 1건(deleted 플래그 확인용).
function rawRunOf(root: ReactTestRenderer.ReactTestInstance, id: string): {deleted?: boolean} | undefined {
  const rawRuns = findByProp(root, 'onSetMaxKm').props.rawRuns as Array<{id: unknown; deleted?: boolean}>;
  return rawRuns.find(r => String(r.id) === id);
}
// 마운트 직후/액션 사이의 pending microtask(부팅 fetch·setState)를 여러 번 흘려보낸다.
async function tickAsync(n = 6) {
  for (let i = 0; i < n; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}
// ToastHost 의 입/퇴장 Animated 콜백(~220ms)을 teardown 전에 흘려 누수/teardown 에러를 막는다.
async function flushAnim() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 260));
  });
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

    test('토스트: 삭제 시 undo 스낵바가 뜨고 undo가 production restoreRun 으로 사이드키까지 완전복원', async () => {
      // tautology 금지(이전 버전 결함): 로컬 클로저를 직접 변형하는 게 아니라 실제 <App/> 를
      // 마운트해 production 의 onDeleteRun → offerRunUndo(토스트) → runToastAction → restoreRun
      // 경로를 그대로 태운다. 관측 가능한 결과만 단언한다 — ShoesScreen 의 shoes.used(사이드키=
      // 신발 사용거리), rawRuns 의 deleted 플래그, route_/time_ 로컬키 원복. 복원이 깨지면(런만
      // 살고 사이드키 유실, 또는 집계 미회복) 이 단언들이 실패한다. (참고: __tests__/App.deleteUndo)
      // 백엔드: 신발 s1(600km) + s1 로 달린 동기 런 r1(50km).
      (global.fetch as jest.Mock).mockImplementation((url: unknown, init?: {method?: string}) => {
        const u = String(url);
        const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
        let body: unknown = {};
        if (u.includes('/api/auth')) body = {user_id: 'u1'};
        else if (u.includes('/api/shoes') && method === 'GET')
          body = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
        else if (u.includes('/api/runs') && method === 'GET')
          body = [{id: 'r1', shoe_id: 's1', km: 50, run_date: '2026-06-01', duration: 1800}];
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(body),
          text: () => Promise.resolve(JSON.stringify(body)),
        });
      });
      // 격리: 전역 beforeEach 의 clearAllMockStorages 는 누수가 있어(메모리: asyncstorage-mock-clear-quirk)
      // 앞 잡(A/B)이 큐잉한 pending_runs·캐시가 남아 부팅 집계를 오염시킨다. 명시적 clear 후 부팅 키만 재설정.
      await AsyncStorage.clear();
      await AsyncStorage.setItem('onboarded', '1');
      await AsyncStorage.setItem('loc_perm_primed', '1');
      // r1 의 사이드키 원본(완주 저장이 남긴 것과 동형) — 삭제 시 지워지고 undo 시 바이트 그대로 원복돼야 한다.
      await AsyncStorage.setItem('route_r1', 'RT');
      await AsyncStorage.setItem('time_r1', '08:30');
      jest.spyOn(Alert, 'alert').mockImplementation((() => {}) as never);

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(el(App));
      });
      await tickAsync();

      // (전) ShoesScreen(tab 1)의 s1 used = 50.
      await act(async () => {
        findByProp(renderer.root, 'onTab').props.onTab(1);
      });
      await tickAsync(3);
      expect(usedKmOf(renderer.root, 's1')).toBe(50);

      // ── 삭제: History(tab 2)의 onDeleteRun(production deleteRun) ──
      await act(async () => {
        findByProp(renderer.root, 'onTab').props.onTab(2);
      });
      await tickAsync(3);
      await act(async () => {
        findByProp(renderer.root, 'onDeleteRun').props.onDeleteRun('r1');
      });
      await tickAsync(5);

      // 토스트: '삭제됨' 메시지 + '실행취소' 액션(offerRunUndo 가 띄운 것).
      const toast = getCurrentToast();
      expect(toast).toBeTruthy();
      expect(toast!.message).toContain('삭제됨');
      expect(toast!.actionLabel).toBe(TOAST_UNDO_LABEL);

      // 삭제 후: 사이드키 제거 + live 집계 제외(used 0).
      expect(await AsyncStorage.getItem('route_r1')).toBeNull();
      expect(await AsyncStorage.getItem('time_r1')).toBeNull();
      await act(async () => {
        findByProp(renderer.root, 'onTab').props.onTab(1);
      });
      await tickAsync(3);
      expect(usedKmOf(renderer.root, 's1')).toBe(0);

      // ── 실행취소: 토스트의 onAction(runToastAction) = production restoreRun ──
      await act(async () => {
        runToastAction(toast!.id);
      });
      await tickAsync(6);

      // 완전복원(부분복원 거부): 사이드키 2종 바이트 원복 + used 50 회복 + 레코드 deleted 아님 + 토스트 닫힘.
      expect(await AsyncStorage.getItem('route_r1')).toBe('RT');
      expect(await AsyncStorage.getItem('time_r1')).toBe('08:30');
      await act(async () => {
        findByProp(renderer.root, 'onTab').props.onTab(1);
      });
      await tickAsync(3);
      expect(usedKmOf(renderer.root, 's1')).toBe(50);
      const restored = rawRunOf(renderer.root, 'r1');
      expect(restored).toBeTruthy();
      expect(restored!.deleted).toBeFalsy();
      expect(getCurrentToast()).toBeNull();

      await flushAnim();
      act(() => renderer.unmount());
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
    // 코드(주석 제외)만 남긴다 — 설명/이력 주석의 'any' 단어는 스캔 대상이 아니다.
    // 블록(/* */·/** */) + 라인(//) 주석을 걷어내고, CRLF 의 \r 도 먼저 제거한다.
    const stripComments = (src: string) =>
      src
        .replace(/\r/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(l => l.replace(/\/\/.*$/, ''))
        .join('\n');

    test('타입: lib/api.ts·lib/stats.ts·lib/runPersistence.ts 에 명시적 any 0(도메인/unknown 타입)', () => {
      const read = (rel: string) => fs.readFileSync(path.join(__dirname, '../../', rel), 'utf8');
      // 세 모듈 모두 명시적 any 토큰(`: any` · `any[]` · `as any` · `<any>` 등)이 한 번도
      // 나오지 않는다 — api/stats 는 도메인 타입, runPersistence sanitizer 는 unknown+런타임
      // 가드로 좁힌다. 주석을 제거한 코드에서 단어 'any' 가 0이면 명시적 any 도 0이다.
      for (const rel of ['lib/api.ts', 'lib/stats.ts', 'lib/runPersistence.ts']) {
        const code = stripComments(read(rel));
        expect(code).not.toMatch(/\bany\b/);
      }
      // runPersistence 의 unknown 전환은 타입만 바꾼다 — 런타임 가드는 그대로다(비정상 입력
      // → 음수/유실 0 으로 좁혀짐). 관찰 가능한 결과로 확인한다.
      expect(sanitizePendingRun({localId: 'L', shoe_id: 's', km: -5, duration: NaN})).toMatchObject({
        localId: 'L', shoe_id: 's', km: 0, duration: 0,
      });
      expect(sanitizePendingRun(null)).toBeNull();
      expect(sanitizePendingRun({km: 5})).toBeNull(); // localId/shoe_id 없으면 버린다
    });

    test('중복제거: TIER_LABEL 정의가 theme.ts 1곳, MM:SS/YYYY-MM 빌더 단일화', () => {
      const read = (rel: string) => fs.readFileSync(path.join(__dirname, '../../', rel), 'utf8');

      // (1) TIER_LABEL — theme.ts 1곳 정의, 홈·프로필·진척은 import 만(로컬 재정의 0).
      expect(/export const TIER_LABEL\s*:/.test(read('theme.ts'))).toBe(true);
      for (const screen of ['HomeScreen.rn.tsx', 'ProfileScreen.rn.tsx', 'ProgressionScreen.rn.tsx']) {
        const src = read(screen);
        expect(/(?:const|let|var)\s+TIER_LABEL\b/.test(src)).toBe(false); // 복붙 정의 없음
        expect(/\bTIER_LABEL\b/.test(src)).toBe(true);                    // theme 에서 가져와 사용
      }
      expect(TIER_LABEL.diamond).toBe('Diamond'); // 단일 정의가 canonical 매핑을 노출

      // (2) MM:SS — HistoryScreen 의 시간 프리필 포맷터는 입력 마스크(maskDuration, MM:SS)와
      // 호환되는 MM:SS-total 을 낸다. fmtTime(H:MM:SS)으로 단일화하면 1시간↑ 런 편집 첫 타건에
      // 마스크가 collapse 시켜 duration 을 손상시키므로(회귀), fmtDurationInput 은 fmtTime 을
      // 호출하면 안 된다(왕복 안정성은 durationRoundtrip 행동 테스트가 보장).
      const hist = read('HistoryScreen.rn.tsx');
      expect(/from '\.\/lib\/format'/.test(hist)).toBe(true);
      const durFn = hist.match(/function fmtDurationInput[\s\S]*?\n}/);
      expect(durFn).not.toBeNull();
      expect(/fmtTime\(/.test(durFn![0])).toBe(false);                   // H:MM:SS 위임 금지
      expect(/padStart\(2, '0'\)/.test(durFn![0])).toBe(true);           // MM:SS-total 직접 조립

      // (3) YYYY-MM(-DD) — 인라인 Date 빌더(getFullYear()+padStart) 제거, lib/format 재사용.
      const ymBuilder = /getFullYear\(\)[\s\S]{0,80}?padStart\(2, '0'\)/;
      for (const rel of ['HallOfFameScreen.rn.tsx', 'ProgressionScreen.rn.tsx', 'lib/notifications.ts', 'lib/progression/challengesExt.ts']) {
        const src = read(rel);
        expect(ymBuilder.test(src)).toBe(false);                      // 인라인 날짜 빌더 없음
        expect(/from '(?:\.\.?\/)+(?:lib\/)?format'/.test(src)).toBe(true); // lib/format 재사용
      }
      // 신규 ymLocal 이 ymdLocal 의 YYYY-MM 접두와 byte-동등(단일 소스).
      expect(ymLocal(new Date(2026, 5, 18, 1, 30))).toBe(ymdLocal(new Date(2026, 5, 18, 1, 30)).slice(0, 7));
    });

    test('가상화: HistoryScreen 런 리스트가 FlatList(안정 keyExtractor)로 렌더된다', () => {
      // 런 행은 ScrollView+runs.map(전부 마운트) 가 아니라 FlatList(보이는 행만 마운트)로
      // 가상화된다. 관찰 가능한 결과: 트리에 FlatList 가 정확히 1개 있고, 전체 런 배열을
      // data 로 받으며, keyExtractor 가 안정 키(run.id)를 만든다(리렌더 시 행 재사용).
      const mkRun = (over: Partial<Run> = {}): Run => ({
        id: 'r1', date: '5월 28일', day: '수', dateNum: '28', dist: 5,
        pace: "5'02\"", time: '40:41', shoe: 0, cal: 0, cadence: 0, bpm: 0, elev: 0, ...over,
      });
      const runs = [mkRun({id: 'r1'}), mkRun({id: 'r2', date: '5월 29일'})];
      const shoe: Shoe = {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 600, condition: '양호'};
      const r = renderTree(el(HistoryScreen, {shoes: [shoe], runs}));

      const lists = r.root.findAllByType(FlatList);
      expect(lists.length).toBe(1);
      const list = lists[0];
      expect(list.props.data).toBe(runs); // 전체 런 배열을 data 로 받아 가상화
      // 안정 키 — id 가 있으면 id, 없으면 인덱스. 같은 런이 같은 키를 받는다.
      expect(list.props.keyExtractor(runs[0], 0)).toBe('r1');
      expect(list.props.keyExtractor(runs[1], 1)).toBe('r2');
      expect(list.props.keyExtractor(mkRun({id: undefined}), 3)).toBe('3');
      // 보이는 행이 실제 RunCard 로 마운트된다(신발 브랜드 + 런 날짜가 화면에 뜬다).
      const txt = renderedText(r.root);
      expect(txt).toContain('Nike');
      expect(txt).toContain('5월 28일');
      // FlatList(VirtualizedList)가 셀 렌더용 타이머를 예약하므로 teardown 전에 언마운트해
      // act() 밖 setState 경고를 막는다.
      act(() => r.unmount());
    });
  });

  describe('E. 디자인 시스템 통합', () => {
    // 소스 파일 목록(테스트·빌드 산출물 제외) — 그라데이션 중복 정의/잔존 import 스캔용.
    const repoRoot = path.join(__dirname, '..', '..');
    const readFile = (p: string) => fs.readFileSync(p, 'utf8');
    function listSrc(): string[] {
      const out: string[] = [];
      const skip = new Set([
        'node_modules', 'android', 'ios', 'build', 'dist', 'coverage', 'tests', '__tests__',
      ]);
      (function walk(dir: string) {
        for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
          if (e.isDirectory()) {
            if (e.name.startsWith('.') || skip.has(e.name)) continue;
            walk(path.join(dir, e.name));
          } else if (/\.(ts|tsx)$/.test(e.name)) {
            out.push(path.join(dir, e.name));
          }
        }
      })(repoRoot);
      return out;
    }
    const stopColors = (root: ReactTestRenderer.ReactTestInstance) =>
      root
        .findAll(n => !!n.type && (n.type as {displayName?: string}).displayName === 'Stop')
        .map(n => n.props.stopColor as string);
    const flatBtnStyle = (root: ReactTestRenderer.ReactTestInstance, label: string) => {
      const node = pressableByLabel(root, label);
      const st = node.props.style;
      return StyleSheet.flatten(typeof st === 'function' ? st({pressed: false}) : st) || {};
    };
    // 라벨로 찾은 CTA 가 '단일 Button 프리미티브'임을 관찰 가능한 렌더 산출물로 단언한다(부분 롤백 가드).
    //   ① 그 버튼 **서브트리**에 GRAD_TOP→GRAD_BOT Stop(=GradientFill) — 트리 전체가 아니라 이 버튼으로
    //      스코프해 타 CTA 의 그라데이션 누출을 차단한다. ② 자기 style 에 ACCENT 글로우. ③ RADIUS.btn 모서리.
    //   raw <View backgroundColor:ACCENT> + 상수 radius 로 손수 만든 오렌지 버튼은 GradientFill/glow 가
    //   없어 통과 못 한다 — '프리미티브 사용'과 'radius 상수만 통일'을 구분한다(Finding3 false-completeness 해소).
    const expectPrimitiveCta = (root: ReactTestRenderer.ReactTestInstance, label: string) => {
      const node = pressableByLabel(root, label);
      const stops = stopColors(node);
      expect(stops).toContain(GRAD_TOP);
      expect(stops).toContain(GRAD_BOT);
      const st = flatBtnStyle(root, label);
      expect(st.shadowColor).toBe(ACCENT);
      expect(st.borderRadius).toBe(RADIUS.btn);
      return node;
    };

    test('CTA: 단일 Button 프리미티브, MockupButton/인라인 그라데이션 제거', () => {
      const srcFiles = listSrc();

      // 1) MockupButton 컴포넌트가 제거되고, 어떤 소스도 그것을 import 하지 않는다
      //    (FirstShoe/AddShoe 가 단일 Button 으로 이주 — 별도 주황 버튼 컴포넌트 0).
      expect(fs.existsSync(path.join(repoRoot, 'MockupButton.rn.tsx'))).toBe(false);
      const importsMockup = srcFiles.filter(f =>
        /from\s+['"][^'"]*MockupButton/.test(readFile(f)),
      );
      expect(importsMockup).toEqual([]);

      // 2) CTA 그라데이션 정지점 hex(#FF7A2E/#F25E00/#EE5800)는 theme.ts 토큰에만 산다 —
      //    화면/컴포넌트가 자체 그라데이션을 복제하지 않는다(단일 소스 = GRAD_TOP/GRAD_BOT).
      const ctaHex = /#FF7A2E|#F25E00|#EE5800/i;
      const dupeGradients = srcFiles.filter(
        f => path.basename(f) !== 'theme.ts' && ctaHex.test(readFile(f)),
      );
      expect(dupeGradients).toEqual([]);

      // 3) 단일 Button 프리미티브 CTA = GRAD_TOP→GRAD_BOT 그라데이션 + ACCENT 글로우 그림자
      //    + RADIUS.btn 단일 모서리 토큰(관찰 가능한 렌더 트리/스타일).
      const b = renderTree(el(Button, {label: '시작', onPress: () => {}}));
      const stops = stopColors(b.root);
      expect(stops).toContain(GRAD_TOP);
      expect(stops).toContain(GRAD_BOT);
      const st = flatBtnStyle(b.root, '시작');
      expect(st.shadowColor).toBe(ACCENT);
      expect(st.borderRadius).toBe(RADIUS.btn);
      act(() => b.unmount());

      // 4) 화면들이 그 단일 CTA 로 라우팅된다 — RunGoal '러닝 시작' 인라인 SVG CTA 가
      //    사라지고 동일 토큰 그라데이션 + ACCENT 글로우 + RADIUS.btn 의 Button 으로 뜬다.
      const goal = renderTree(el(RunGoalScreen, {onStart: () => {}}));
      const goalStops = stopColors(goal.root);
      expect(goalStops).toContain(GRAD_TOP);
      expect(goalStops).toContain(GRAD_BOT);
      const goalSt = flatBtnStyle(goal.root, '러닝 시작');
      expect(goalSt.shadowColor).toBe(ACCENT);
      expect(goalSt.borderRadius).toBe(RADIUS.btn);
      act(() => goal.unmount());
    });

    test('radius 단일화: Finding1 대상 사각 ACCENT CTA 들이 실제로 단일 Button 프리미티브로 렌더된다(부분 롤백 가드)', () => {
      // code_critic(Finding 1·3) + test_critic(missing_tests): "CTA 단일 Button" 스펙은 라이브
      // 렌더되는 사각 ACCENT 버튼들을 단일 Button 프리미티브로 라우팅하라고 요구한다. 과거 수용
      // 테스트는 (a) per-file `import {Button}`(전환 대상 5파일이 모두 이미 Button 을 import 하므로
      // tautological — 특정 CTA 가 실제로 프리미티브를 거치는지와 무관하게 통과) 와 (b) `backgroundColor:
      // ACCENT` & raw `borderRadius:14|16` **둘 다** 가진 객체 스캔만 봤다. 후자는 토큰 radius 로 손수
      // 만든 오렌지 CTA(`{backgroundColor:ACCENT, borderRadius:RADIUS.btn}`)를 '전환됨'으로 통과시켜
      // false-completeness 를 남긴다('프리미티브 사용'과 'raw View+radius 상수만 통일'을 구분 못 함).
      // 여기서는 대표 CTA 4종을 실제로 렌더해 '프리미티브 경유(그라데이션+ACCENT 글로우+RADIUS.btn)'를
      // 관찰 산출물로 단언한다 — 6개 중 하나라도 raw 오렌지 버튼으로 부분 롤백하면 GradientFill/glow
      // 부재로 즉시 깨진다(직전 커밋 RunGoal 패턴을 다른 5개 CTA 에 미러).
      const NOW = Date.UTC(2026, 5, 13);
      const SHOE: BackendShoe = {id: 's1', name: 'Nike Pegasus 40', max_km: 600, total_km: 590};
      const RUNS: BackendRun[] = [
        {id: 'r1', shoe_id: 's1', km: 12, run_date: '2026-03-20', duration: 3600},
      ];
      const ctx = buildContext(RUNS, [SHOE], [], null, NOW, []);

      // ① ChallengesSection createBtn('챌린지 만들기') — 폼을 열어야 노출된다.
      const ch = renderTree(
        el(ChallengesSection, {challenges: [], onCreate: () => {}, today: '2026-06-03'}),
      );
      act(() => pressableByLabel(ch.root, '새 챌린지').props.onPress());
      expectPrimitiveCta(ch.root, '챌린지 만들기');
      act(() => ch.unmount());

      // ② RetirementFlow btnPrimary(step0 '여정 돌아보기').
      const ret = renderTree(
        el(RetirementFlow, {shoe: SHOE, runs: RUNS, ctx, now: NOW, onClose: () => {}}),
      );
      expectPrimitiveCta(ret.root, '여정 돌아보기');
      act(() => ret.unmount());

      // ③ ShoesScreen 은퇴 키프세이크 CTA(retire-open-flow, '은퇴') — 수명도달 신발 상세에 노출.
      const UI_SHOE: Shoe = {
        id: 's1',
        brand: 'Nike',
        model: 'Pegasus 40',
        used: 590,
        max: 600,
        condition: '교체',
      };
      const shoes = renderTree(
        el(ShoesScreen, {
          shoes: [UI_SHOE],
          runs: [],
          totals: {0: {totalRuns: 3, totalTime: '3:00:00', avgPace: "5'00\""}},
          unit: 'km',
          rawShoes: [SHOE],
          rawRuns: [],
          progressionCtx: ctx,
          now: NOW,
          detailShoeId: 's1',
          onConsumeDetail: () => {},
        }),
      );
      expectPrimitiveCta(shoes.root, '은퇴');
      act(() => shoes.unmount());

      // ④ ProfileScreen cloudBtnGoogle('Google로 계속') — Google iconNode 가 프리미티브 **안에**
      //    렌더된다(별도 손수 오렌지 버튼이 아님): logo-google 아이콘이 그 Button 서브트리에 있어야 한다.
      const NOOP_PORT = {
        signIn: () => Promise.resolve({uid: 'u', email: 'e'}),
        signOut: () => Promise.resolve(),
        pull: () => Promise.resolve(null),
        push: () => Promise.resolve(),
      };
      const prof = renderTree(
        el(ProfileScreen, {cloudPort: NOOP_PORT, backupData: {shoes: [], runs: [], settings: {}}}),
      );
      act(() => {
        prof.root
          .findAll((n: ReactTestRenderer.ReactTestInstance) => n.props?.accessibilityLabel === '설정 열기')[0]
          ?.props?.onPress?.();
      });
      const googleBtn = expectPrimitiveCta(prof.root, 'Google로 계속');
      const logo = googleBtn.findAll(
        (n: ReactTestRenderer.ReactTestInstance) =>
          !!n.props && (n.props as {name?: string}).name === 'logo-google',
      );
      expect(logo.length).toBeGreaterThan(0); // 아이콘이 프리미티브 내부 — 손수 만든 오렌지 버튼 아님.
      act(() => prof.unmount());

      // 보조 가드(소스 스캔): 전환 대상 파일에 backgroundColor:ACCENT + raw 14/16 사각 CTA 객체 0.
      // (literal r14/r16 잔존만 잡는 약한 가드 — '프리미티브 경유'의 본 단언은 위 ①~④ 렌더다.)
      const strip = (src: string) =>
        src
          .replace(/\r/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n')
          .map(l => l.replace(/\/\/.*$/, ''))
          .join('\n');
      for (const f of ['App.tsx', 'ChallengesSection.tsx', 'ShoesScreen.rn.tsx', 'ProfileScreen.rn.tsx', 'RetirementFlow.rn.tsx']) {
        const code = strip(readFile(path.join(repoRoot, f)));
        const squareAccentCta = (code.match(/\{[^{}]*\}/g) || []).filter(
          o => /backgroundColor:\s*ACCENT\b/.test(o) && /borderRadius:\s*1[46]\b/.test(o),
        );
        expect(squareAccentCta).toEqual([]);
      }
    });

    test('gloss 클립: 단일 Button 의 상단 광택이 위쪽 모서리를 RADIUS.btn 으로 둥글린다(모서리 삐짐 회귀 가드)', () => {
      // code_critic(Finding 2): base 에 overflow:hidden 이 없어(글로우 보존) gloss(full-width
      // 1px plain View)의 top-left/right 모서리가 클립되지 않으면 흰 사각 픽셀이 둥근 모서리
      // 밖으로 삐져나온다. gloss 가 스스로 borderTopLeft/RightRadius(=RADIUS.btn)를 가져
      // 시각 동등을 회복해야 한다. 활성 CTA 에서만 gloss 가 렌더된다(disabled/ghost 엔 없음).
      const b = renderTree(el(Button, {label: '시작', onPress: () => {}}));
      // gloss = 높이 1px 의 흰 반투명 plain View(아이콘/라벨/그라데이션 Svg 와 구분).
      const glossNodes = b.root.findAll((n: ReactTestRenderer.ReactTestInstance) => {
        const flat = StyleSheet.flatten(n.props && n.props.style) as
          | {height?: number; backgroundColor?: string; borderTopLeftRadius?: number; borderTopRightRadius?: number}
          | undefined;
        return (
          !!flat &&
          flat.height === 1 &&
          typeof flat.backgroundColor === 'string' &&
          /rgba\(255,\s*255,\s*255/.test(flat.backgroundColor)
        );
      });
      // RN 의 View 는 composite+host 두 인스턴스로 잡히므로 ≥1(둘 다 동일 gloss 스타일).
      expect(glossNodes.length).toBeGreaterThanOrEqual(1);
      // 매칭된 gloss 노드는 모두 위쪽 두 모서리를 RADIUS.btn 으로 둥글린다(삐짐 방지).
      glossNodes.forEach(n => {
        const flat = StyleSheet.flatten(n.props.style) as {
          borderTopLeftRadius?: number;
          borderTopRightRadius?: number;
        };
        expect(flat.borderTopLeftRadius).toBe(RADIUS.btn);
        expect(flat.borderTopRightRadius).toBe(RADIUS.btn);
      });
      act(() => b.unmount());

      // disabled CTA 는 그라데이션/글로우/gloss 를 끄고 flat 표면으로 떨어진다(gloss 0).
      const d = renderTree(el(Button, {label: '비활성', onPress: () => {}, disabled: true}));
      const dGloss = d.root.findAll((n: ReactTestRenderer.ReactTestInstance) => {
        const fl = StyleSheet.flatten(n.props && n.props.style) as {height?: number; backgroundColor?: string} | undefined;
        return !!fl && fl.height === 1 && typeof fl.backgroundColor === 'string' && /rgba\(255,\s*255,\s*255/.test(fl.backgroundColor);
      });
      expect(dGloss.length).toBe(0);
      act(() => d.unmount());
    });

    test('Card·SegmentedControl·StatGrid 프리미티브가 단일 보더 토큰 + 관찰 가능한 동작으로 렌더된다', () => {
      // ① Card — 단일 표면(CARD) + 단일 보더 토큰(CARD_BORDER) + 단일 반경(RADIUS.lg).
      //    화면마다 SEP·withAlpha(T1,.07)·borderWidth 1 로 흩어졌던 카드 외곽선이 한 토큰으로
      //    모인다. 관찰: 카드 호스트 style 의 backgroundColor/borderColor/borderRadius.
      const c = renderTree(el(Card, {children: el(Text, {children: '카드 본문'})}));
      const cardHosts = c.root.findAll((n: ReactTestRenderer.ReactTestInstance) => {
        const f = StyleSheet.flatten(n.props && n.props.style) as
          | {backgroundColor?: string; borderRadius?: number; borderColor?: string; borderWidth?: number}
          | undefined;
        return !!f && f.backgroundColor === CARD && f.borderRadius === RADIUS.lg;
      });
      expect(cardHosts.length).toBeGreaterThanOrEqual(1);
      cardHosts.forEach(n => {
        const f = StyleSheet.flatten(n.props.style) as {borderColor?: string; borderWidth?: number};
        expect(f.borderColor).toBe(CARD_BORDER);          // 단일 보더 토큰
        expect(f.borderWidth).toBe(StyleSheet.hairlineWidth);
      });
      expect(renderedText(c.root)).toContain('카드 본문');
      act(() => c.unmount());

      // ② SegmentedControl — 선택 상태가 accessibilityState.selected 로 관찰되고, press 시
      //    onChange 가 그 키로 호출된다(앱 전역 4개 탭 스트립을 대체한 단일 프리미티브).
      //    컨테이너 보더 = 단일 CARD_BORDER 토큰(neutral variant).
      let segVal = 'a';
      const items = [{key: 'a', label: '주간'}, {key: 'b', label: '월간'}];
      const sc = renderTree(
        el(SegmentedControl, {items, value: 'a', onChange: (k: string) => {segVal = k;}, variant: 'neutral'}),
      );
      const selA = pressableByLabel(sc.root, '주간');
      const selB = pressableByLabel(sc.root, '월간');
      expect(selA.props.accessibilityState.selected).toBe(true);
      expect(selB.props.accessibilityState.selected).toBe(false);
      const segContainer = sc.root.findAll((n: ReactTestRenderer.ReactTestInstance) => {
        const f = StyleSheet.flatten(n.props && n.props.style) as
          | {borderColor?: string; flexDirection?: string}
          | undefined;
        return !!f && f.borderColor === CARD_BORDER && f.flexDirection === 'row';
      });
      expect(segContainer.length).toBeGreaterThanOrEqual(1);
      act(() => selB.props.onPress());
      expect(segVal).toBe('b');                            // 관찰 가능한 동작
      act(() => sc.unmount());

      // ③ StatGrid — value/unit/label 을 모두 렌더하고, 값 Text 는 DISPLAY 폰트 +
      //    tabular-nums(자리수 흔들림 방지) 단일 소스(화면별 손짠 스탯 그리드 대체).
      const sg = renderTree(
        el(StatGrid, {items: [
          {value: '12', unit: 'km', label: '거리', testID: 'sg0'},
          {value: '5', unit: '회', label: '횟수', testID: 'sg1'},
        ]}),
      );
      const txt = renderedText(sg.root);
      for (const s of ['12', 'km', '거리', '5', '회', '횟수']) expect(txt).toContain(s);
      const valNodes = sg.root.findAll((n: ReactTestRenderer.ReactTestInstance) => {
        const f = StyleSheet.flatten(n.props && n.props.style) as
          | {fontFamily?: string; fontVariant?: string[]}
          | undefined;
        return !!f && f.fontFamily === DISPLAY && Array.isArray(f.fontVariant) && f.fontVariant.includes('tabular-nums');
      });
      expect(valNodes.length).toBeGreaterThanOrEqual(2); // 두 셀의 값이 모두 DISPLAY/tabular
      act(() => sg.unmount());

      // ④ 정적 가드: SegmentedControl·StatGrid 가 정의(primitives)뿐 아니라 실제 화면에서
      //    채택된다(per-screen 탭 스트립/스탯 그리드 복제 0 = 단일 프리미티브 경유).
      const src = listSrc();
      const adopt = (name: string) =>
        src.filter(f => path.basename(f) !== 'primitives.tsx' && new RegExp(`\\b${name}\\b`).test(readFile(f)));
      expect(adopt('SegmentedControl').length).toBeGreaterThan(0);
      expect(adopt('StatGrid').length).toBeGreaterThan(0);
    });

    test('TYPE 정수 스케일 수렴 + hero/scrim/screen-padding 토큰 도입 (반px 사이즈 제거)', () => {
      // 주석/CRLF 안전 strip(라인 // 제거 전 \r 선제거 — CRLF 풋건 회피) + 소스 코드만 스캔.
      const strip = (s: string) =>
        s.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

      // ① TYPE 모든 프리셋 fontSize 가 정수(반px 0) — 본문 위계 스케일.
      for (const k of Object.keys(TYPE) as (keyof typeof TYPE)[]) {
        expect(Number.isInteger(TYPE[k].fontSize)).toBe(true);
      }

      // ② HERO — 명명된 hero 사이즈(hero<heroLg<mega), 모두 정수, 본문 최대(display) 위.
      expect([...Object.keys(HERO)].sort()).toEqual(['hero', 'heroLg', 'mega'].sort());
      expect(Number.isInteger(HERO.hero)).toBe(true);
      expect(Number.isInteger(HERO.heroLg)).toBe(true);
      expect(Number.isInteger(HERO.mega)).toBe(true);
      expect(HERO.hero).toBeLessThan(HERO.heroLg);
      expect(HERO.heroLg).toBeLessThan(HERO.mega);
      expect(HERO.hero).toBeGreaterThan(TYPE.display.fontSize);

      // ③ GUTTER(단일 거터, 정수) + SCRIM(단일 모달 딤).
      expect(Number.isInteger(GUTTER)).toBe(true);
      expect(GUTTER).toBeGreaterThan(0);
      expect(SCRIM).toBe('rgba(0,0,0,0.6)');

      // ④ 정적 스캔: 어떤 소스도 반px fontSize/Size 를 갖지 않는다(11.5/12.5/13.5/14.5/16.5 …
      //    가 정수 스케일로 수렴). SVG path 좌표(d=…)는 fontSize/Size 키가 아니라 잡지 않는다.
      const halfPx = /\b(?:fontSize|valueSize|unitSize|labelSize)\s*[:=]\s*\{?\s*\d+\.5\b/;
      const offenders = listSrc().filter(f => halfPx.test(strip(readFile(f))));
      expect(offenders).toEqual([]);

      // ⑤ scrim 단일화: raw 'rgba(0,0,0,0.6)' 리터럴은 theme.ts 에만(화면은 SCRIM 토큰 참조).
      const rawScrim = listSrc().filter(
        f => path.basename(f) !== 'theme.ts' && /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.6\s*\)/.test(strip(readFile(f))),
      );
      expect(rawScrim).toEqual([]);

      // ⑥ 토큰이 정의에 그치지 않고 실제 화면에서 소비된다(hero/scrim/gutter 각 ≥1 화면).
      //    \bHERO\b 는 HERO_BG(뒤가 단어문자 _)를 매칭하지 않아 hero 스케일 사용만 센다.
      const consumes = (tok: string) =>
        listSrc().filter(f => path.basename(f) !== 'theme.ts' && new RegExp(`\\b${tok}\\b`).test(strip(readFile(f))));
      expect(consumes('HERO').length).toBeGreaterThan(0);
      expect(consumes('SCRIM').length).toBeGreaterThan(0);
      expect(consumes('GUTTER').length).toBeGreaterThan(0);

      // ⑦ hero 사이즈가 실제 렌더 산출물에 반영된다(관찰): Stat 값 Text 의 fontSize === HERO.heroLg.
      const h = renderTree(el(Stat, {value: '42', unit: 'km', valueSize: HERO.heroLg, testID: 'hero'}));
      const heroVal = h.root.findAll((n: ReactTestRenderer.ReactTestInstance) => {
        const f = StyleSheet.flatten(n.props && n.props.style) as {fontSize?: number; fontFamily?: string} | undefined;
        return !!f && f.fontSize === HERO.heroLg && f.fontFamily === DISPLAY;
      });
      expect(heroVal.length).toBeGreaterThanOrEqual(1);
      act(() => h.unmount());
    });
  });
});
