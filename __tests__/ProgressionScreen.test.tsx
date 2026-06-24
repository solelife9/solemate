/**
 * ProgressionScreen.rn.tsx — 진척 화면 행동 테스트 (재설계 · UI).
 *
 * 타이틀 시스템 폐지 → XP 기반 랭크 + 6카테고리 업적. 관찰 가능한 동작만 검증한다:
 *  1) 히어로가 닉네임 + 티어 칩(TIER_LABEL) + 총 XP·업적 달성 수를 렌더한다.
 *  2) 랭크 칩 라벨이 그 티어의 TIER_COLORS 값으로 칠해진다.
 *  3) 랭크 진행 카드가 다음 티어 진행바와 함께 렌더된다(낮은 시드 → 최고등급 아님).
 *  4) 업적 진행 바가 주입한 런/신발에서 파생된 current/target 을 그대로 보여준다.
 *  5) 총 획득 XP 합산이 view.totalXp 를 그대로 보여준다.
 *  6) 업적/챌린지 세그먼트 탭이 한 번에 한 섹션만 렌더한다.
 *
 * props-driven · 네트워크 없음 · jest.setup 목 · AsyncStorage.clear() per test.
 * @format
 */
import React from 'react';
import {StyleSheet} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProgressionScreen from '../ProgressionScreen.rn';
import {getProgression, collectUnlockedKeys} from '../lib/progression';
import {defaultProgressionState} from '../lib/progression/storage';
import * as storage from '../lib/progression/storage';
import type {ProgressionState} from '../lib/progression/types';
import {TIER_COLORS} from '../theme';

// 결정적 기준 시각(시간 기반 타이틀/스트릭).
const NOW = Date.parse('2026-06-12T08:00:00Z');

// 최소 시드 — running_beginner / shoe_beginner 가 해제되고, 상위 사다리는 잠긴다.
const SHOES: BackendShoe[] = [
  {id: 's1', name: 'Nike Pegasus 41', max_km: 600, retired: false, total_km: 120} as any,
];
const RUNS: BackendRun[] = [
  {id: 'r1', shoe_id: 's1', km: 10, run_date: '2026-06-01', duration: 3000} as any,
  {id: 'r2', shoe_id: 's1', km: 8, run_date: '2026-06-03', duration: 2400} as any,
];

// 언락 배너가 영속/표시(및 setTimeout 누수)를 흔들지 않도록, 주어진 런/신발에서 지금
// 충족된 모든 키를 미리 seen 처리한 초기 상태. 데이터셋마다 충족 키가 다르므로 호출부가
// 자신의 런/신발을 넘겨 자신의 언락을 정확히 억제해야 한다(미스매치 시 배너 타이머 누수).
function seenSuppressedState(
  runs: readonly BackendRun[] = RUNS,
  shoes: readonly BackendShoe[] = SHOES,
  extra?: Partial<ProgressionState>,
): ProgressionState {
  const view = getProgression(runs, shoes, null, NOW);
  return {
    ...defaultProgressionState(),
    seenUnlocks: collectUnlockedKeys(view),
    ...extra,
  };
}

async function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}
const byTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n && n.props && n.props.testID === id);
// 노드 하위의 모든 Text 를 한 문자열로 모은다(자식 분할 렌더 대비).
function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  return node
    .findAll((n: any) => n.type === 'Text')
    .map((t: any) =>
      (Array.isArray(t.props.children) ? t.props.children : [t.props.children])
        .filter((c: any) => typeof c === 'string' || typeof c === 'number')
        .join(''),
    )
    .join(' ');
}
function colorOf(node: ReactTestRenderer.ReactTestInstance): string | undefined {
  return (StyleSheet.flatten(node.props.style) as any)?.color;
}
describe('ProgressionScreen — 진척 표면', () => {
  test('히어로가 닉네임 + 티어 칩 + 총 XP·업적 달성 수를 렌더한다', async () => {
    const view = getProgression(RUNS, SHOES, null, NOW);
    const achievementCount = view.achievements.filter(a => a.unlocked).length;

    const r = await render(
      <ProgressionScreen
        runs={RUNS}
        shoes={SHOES}
        profileName="김민준"
        now={NOW}
        initialState={seenSuppressedState()}
      />,
    );
    const root = r.root;

    // 히어로 컨테이너.
    expect(byTestID(root, 'rank-hero').length).toBeGreaterThanOrEqual(1);

    // 닉네임이 그대로 렌더된다(타이틀 장착 폐지 — 닉네임 단독).
    expect(textOf(byTestID(root, 'progression-nick')[0])).toContain('김민준');

    // 히어로 부제: 총 XP(천단위) + 업적 달성 수.
    const sub = byTestID(root, 'progression-xp')[0];
    expect(textOf(sub)).toContain(`${view.rank.xp.toLocaleString()} XP`);
    expect(textOf(sub)).toContain(`업적 ${achievementCount}개 달성`);

    // 타이틀 시스템 폐지 회귀 가드: 더 이상 장착 타이틀 표시가 없다.
    expect(byTestID(root, 'equipped-title').length).toBe(0);
  });

  test('랭크 칩 라벨이 그 티어의 TIER_COLORS 값으로 칠해진다', async () => {
    const expected = getProgression(RUNS, SHOES, null, NOW).rank;
    // 엔진의 색이 곧 권위 토큰 값이어야 한다(하드코딩 금지).
    expect(expected.color).toBe(TIER_COLORS[expected.tier]);

    const r = await render(
      <ProgressionScreen runs={RUNS} shoes={SHOES} now={NOW} initialState={seenSuppressedState()} />,
    );
    const root = r.root;

    // 랭크 칩 라벨이 티어 색이다(칩이 단일 랭크 신호).
    const chip = byTestID(root, 'rank-chip')[0];
    const chipText = chip.findAll((n: any) => n.type === 'Text')[0];
    expect(colorOf(chipText)).toBe(expected.color);
    // 칩에 TIER_LABEL 티어명이 표시된다(Bronze … Legend).
    const tierLabel = expected.tier[0].toUpperCase() + expected.tier.slice(1);
    expect(textOf(chip)).toContain(tierLabel);
  });

  test('랭크 진행 카드가 다음 티어 진행바와 함께 렌더된다', async () => {
    const r = await render(
      <ProgressionScreen runs={RUNS} shoes={SHOES} now={NOW} initialState={seenSuppressedState()} />,
    );
    const root = r.root;
    // 진행 카드 자체.
    expect(byTestID(root, 'rank-guide').length).toBeGreaterThanOrEqual(1);
    // 낮은 시드 → legend 아님 → 다음 티어 진행바 노출(최고등급 문구 아님).
    expect(byTestID(root, 'rank-next').length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, 'rank-max').length).toBe(0);
  });

  test('업적 진행 바가 주입한 데이터에서 파생된 current/target 을 그대로 보여준다', async () => {
    const view = getProgression(RUNS, SHOES, null, NOW);
    const a = view.achievements[0];
    expect(a).toBeTruthy();

    const r = await render(
      <ProgressionScreen runs={RUNS} shoes={SHOES} now={NOW} initialState={seenSuppressedState()} />,
    );
    const root = r.root;

    // 업적 카드 자체가 트리에 존재한다.
    expect(byTestID(root, `ach-${a.key}`).length).toBeGreaterThanOrEqual(1);

    const prog = byTestID(root, `ach-progress-${a.key}`)[0];
    expect(prog).toBeTruthy();
    const want = `${a.progress.current.toLocaleString()} / ${a.progress.target.toLocaleString()}`;
    expect(textOf(prog)).toContain(want);

    // 채움 폭이 비율을 반영한다(0..100%).
    const fill = byTestID(root, `ach-fill-${a.key}`)[0];
    const w = (StyleSheet.flatten(fill.props.style) as any).width;
    expect(typeof w).toBe('string');
    expect(w.endsWith('%')).toBe(true);
  });

  test('총 획득 XP 합산이 view.totalXp 를 그대로 보여준다', async () => {
    const view = getProgression(RUNS, SHOES, null, NOW);

    const r = await render(
      <ProgressionScreen runs={RUNS} shoes={SHOES} now={NOW} initialState={seenSuppressedState()} />,
    );
    const root = r.root;

    const total = byTestID(root, 'progression-points')[0];
    expect(total).toBeTruthy();
    expect(textOf(total)).toContain(`${view.totalXp.toLocaleString()} XP`);
  });

  test('진척 화면은 업적만 노출한다(챌린지는 마이 탭으로 이관 — 챌린지 섹션 없음)', async () => {
    const view = getProgression(RUNS, SHOES, null, NOW);
    const a = view.achievements[0];

    const r = await render(
      <ProgressionScreen runs={RUNS} shoes={SHOES} now={NOW} initialState={seenSuppressedState()} />,
    );
    const root = r.root;

    // 업적 카드/총 XP 는 탭 전환 없이 바로 노출되고, 챌린지 섹션·탭은 존재하지 않는다.
    expect(byTestID(root, `ach-${a.key}`).length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, 'progression-points').length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, 'tab-challenges').length).toBe(0);
    expect(byTestID(root, 'challenges-section').length).toBe(0);
  });
});

// ── 회귀 가드: 프로덕션 마운트(initialState 없음) 데이터 파괴 금지 ─────────────────
// iron law('사용자 데이터 파괴 금지'). 비동기 loadProgression() 이 끝나기 전 화면은
// default(빈 seenUnlocks) 상태다. 이때 언락 배너 효과가 detectNewUnlocks([], keys) 로
// 모든 충족 키를 "새 언락"으로 오판하면 (a) 이미 본 언락까지 배너 도배(anti-scenario 8),
// (b) default 파생 상태를 progression_v1 에 저장해 디스크의 실제 earnedTitles·
// equippedTitleKey·retiredShoes·points 를 덮어써(클로버) 영구 소실시킨다.
// 가드: loaded 전엔 어떤 저장도 일어나지 않아야 한다.
describe('ProgressionScreen — 프로덕션 마운트 데이터 보존', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('로드 전 default 상태로 saveProgression 을 호출해 실제 데이터를 덮어쓰지 않는다', async () => {
    await AsyncStorage.clear();

    // 디스크에 실제로 저장돼 있던(=loadProgression 이 돌려줄) 사용자 상태.
    // 이미 충족된 모든 키가 seen 처리돼 있어 "새 언락"은 없어야 한다. 은퇴 레코드가
    // 은퇴 업적/타이틀(First Retirement·Shoe Care Starter 등)을 구동하므로, seenUnlocks 는
    // 그 은퇴 레코드를 포함한 뷰로 계산해야 일관된다(영속 retiredShoes 반영).
    const retiredShoes: ProgressionState['retiredShoes'] = [
      {
        shoeId: 'old1',
        name: '은퇴한 페가수스',
        km: 620,
        retiredAt: '2026-04-01T00:00:00Z',
        retireYear: 2026,
        grade: 'standard',
      },
    ];
    const view = getProgression(
      RUNS,
      SHOES,
      {...defaultProgressionState(), retiredShoes},
      NOW,
    );
    const realState: ProgressionState = {
      earnedTitles: [
        {key: 'running_beginner', unlockedAt: '2026-05-01T00:00:00Z', isEquipped: true},
      ],
      equippedTitleKey: 'running_beginner',
      seenUnlocks: collectUnlockedKeys(view),
      retiredShoes,
      points: 1234,
    };

    // 프로덕션 경로: 마운트 시 storage 에서 비동기 로드한다.
    const loadSpy = jest
      .spyOn(storage, 'loadProgression')
      .mockResolvedValue(realState);
    const saveSpy = jest
      .spyOn(storage, 'saveProgression')
      .mockResolvedValue(undefined);

    let r!: ReactTestRenderer.ReactTestRenderer;
    // initialState 미주입 → 진짜 프로덕션 마운트.
    await act(async () => {
      r = ReactTestRenderer.create(
        <ProgressionScreen runs={RUNS} shoes={SHOES} profileName="김민준" now={NOW} />,
      );
    });
    // 비동기 loadProgression 의 .then 을 흘려보낸다(load 완료 → loaded=true).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = r.root;
    expect(loadSpy).toHaveBeenCalled();

    // 핵심: 저장이 일어났다면 단 한 번도 default/빈 상태로 디스크를 덮어쓰지 않았다.
    // (구버전은 로드 전 {...default, seenUnlocks: allKeys} 를 저장해 여기서 실패한다.)
    for (const call of saveSpy.mock.calls) {
      const saved = call[0];
      expect(saved.earnedTitles.length).toBeGreaterThan(0);
      expect(saved.equippedTitleKey).toBe('running_beginner');
      expect(saved.points).toBe(1234);
      expect(saved.retiredShoes.length).toBeGreaterThan(0);
    }

    // 이미 본(seen) 언락은 배너로 다시 뜨지 않는다(멱등 · 도배 금지).
    expect(byTestID(root, 'unlock-banner').length).toBe(0);
  });
});
