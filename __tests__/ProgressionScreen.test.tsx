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
import type {ExtChallenge} from '../lib/progression/challengesExt';
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
// 세그먼트 탭(업적/챌린지) 전환 — 한 번에 한 섹션만 렌더된다.
async function selectTab(
  root: ReactTestRenderer.ReactTestInstance,
  key: 'achievements' | 'challenges',
) {
  const tab = byTestID(root, `tab-${key}`)[0];
  await act(async () => {
    tab.props.onPress(key);
  });
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
    await selectTab(root, 'achievements');

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
    await selectTab(root, 'achievements');

    const total = byTestID(root, 'progression-points')[0];
    expect(total).toBeTruthy();
    expect(textOf(total)).toContain(`${view.totalXp.toLocaleString()} XP`);
  });

  test('업적/챌린지 세그먼트 탭이 한 번에 한 섹션만 렌더한다', async () => {
    const view = getProgression(RUNS, SHOES, null, NOW);
    const a = view.achievements[0];

    const r = await render(
      <ProgressionScreen runs={RUNS} shoes={SHOES} now={NOW} initialState={seenSuppressedState()} />,
    );
    const root = r.root;

    // 두 탭 컨트롤이 모두 존재한다.
    expect(byTestID(root, 'tab-achievements').length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, 'tab-challenges').length).toBeGreaterThanOrEqual(1);

    // 기본 = 업적 탭: 업적 카드/총 XP 노출, 챌린지 섹션 없음.
    await selectTab(root, 'achievements');
    expect(byTestID(root, `ach-${a.key}`).length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, 'progression-points').length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, 'challenges-section').length).toBe(0);

    // 챌린지 탭: 챌린지 섹션 노출, 업적 카드/총 XP 사라짐.
    await selectTab(root, 'challenges');
    expect(byTestID(root, 'challenges-section').length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, `ach-${a.key}`).length).toBe(0);
    expect(byTestID(root, 'progression-points').length).toBe(0);
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

// ── 챌린지 섹션(Slice C product_bug 수정) ───────────────────────────────────────
// 회귀 가드: 확장 챌린지 카드(weekly/shoe/rotation)와 스마트 추천 카드가 실제 마운트되는
// ProgressionScreen 트리 안에서 렌더되고('진척' 화면 = App 이 실제로 띄우는 화면), 스마트
// 추천의 '이 챌린지 시작'을 누르면 수락/영속 핸들러(onAcceptChallenge)가 화면을 통해
// 호출됨을 증명한다. 카드가 어디에도 마운트되지 않던(unreachable) 블로킹 버그의 가드.
describe('ProgressionScreen — 챌린지 섹션(확장 + 스마트)', () => {
  // 활성 신발 2켤레 — s1 과사용(스마트 추천이 생성되는 조건). 신발 귀속 런으로 매핑된다.
  const CH_SHOES: BackendShoe[] = [
    {id: 's1', name: 'Alphafly 3', max_km: 300, retired: false} as any,
    {id: 's2', name: 'Novablast 5', max_km: 800, retired: false} as any,
  ];
  const CH_RUNS: BackendRun[] = [
    {id: 'r1', shoe_id: 's1', km: 20, run_date: '2026-06-02', duration: 6000} as any,
    {id: 'r2', shoe_id: 's1', km: 18, run_date: '2026-06-05', duration: 5400} as any,
    {id: 'r3', shoe_id: 's1', km: 16, run_date: '2026-06-09', duration: 4800} as any,
    {id: 'r4', shoe_id: 's2', km: 4, run_date: '2026-06-08', duration: 1500} as any,
  ];
  const EXT_CHALLENGES: ExtChallenge[] = [
    {id: 'm1', kind: 'weekly', metric: 'distance', targetKm: 100},
    {id: 'sh1', kind: 'shoe', shoeId: 's2', targetKm: 50},
    {id: 'r1', kind: 'rotation', rotationMode: 'distinct', targetShoes: 2},
  ];

  test('수락한 weekly/shoe/rotation 카드가 진척 화면 트리에 렌더된다', async () => {
    const r = await render(
      <ProgressionScreen
        runs={CH_RUNS}
        shoes={CH_SHOES}
        now={NOW}
        initialState={seenSuppressedState(CH_RUNS, CH_SHOES)}
        extChallenges={EXT_CHALLENGES}
      />,
    );
    const root = r.root;
    await selectTab(root, 'challenges');

    // 챌린지 섹션 컨테이너 + 3종 확장 카드가 모두 실제 트리에 존재한다.
    expect(byTestID(root, 'challenges-section').length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, 'ext-challenge-m1').length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, 'ext-challenge-sh1').length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, 'ext-challenge-r1').length).toBeGreaterThanOrEqual(1);
    // shoe 카드는 지정 신발 이름을 제목에 노출한다(공급한 shoes 에서 파생).
    expect(textOf(byTestID(root, 'ext-challenge-sh1')[0])).toContain('Novablast 5');
  });

  test('스마트 추천 카드가 공급한 런/신발에서 생성돼 투명한 사유와 함께 렌더된다', async () => {
    const r = await render(
      <ProgressionScreen
        runs={CH_RUNS}
        shoes={CH_SHOES}
        now={NOW}
        initialState={seenSuppressedState(CH_RUNS, CH_SHOES)}
      />,
    );
    const root = r.root;
    await selectTab(root, 'challenges');

    expect(byTestID(root, 'smart-challenge').length).toBeGreaterThanOrEqual(1);
    const reason = byTestID(root, 'smart-challenge-reason')[0];
    // 새 로직: 평균 런 거리 × 3 기반 주간 챌린지 사유
    expect(textOf(reason)).toContain('기준');
    expect(textOf(reason)).toContain('km');
  });

  test("스마트 추천의 '이 챌린지 시작'을 누르면 수락/영속 핸들러가 화면을 통해 호출된다", async () => {
    const onAcceptChallenge = jest.fn();
    const r = await render(
      <ProgressionScreen
        runs={CH_RUNS}
        shoes={CH_SHOES}
        now={NOW}
        initialState={seenSuppressedState(CH_RUNS, CH_SHOES)}
        onAcceptChallenge={onAcceptChallenge}
      />,
    );
    const root = r.root;
    await selectTab(root, 'challenges');

    const accept = byTestID(root, 'smart-challenge-accept')[0];
    expect(accept).toBeTruthy();
    await act(async () => {
      accept.props.onPress();
    });

    // 화면을 통해 수락 핸들러(App 의 acceptChallenge → K_CHALLENGES 영속)가 호출된다.
    expect(onAcceptChallenge).toHaveBeenCalledTimes(1);
    const accepted: ExtChallenge = onAcceptChallenge.mock.calls[0][0];
    expect(accepted.kind).toBe('weekly'); // 스마트 추천은 주간 거리 챌린지
    expect(typeof accepted.id).toBe('string');
    expect(accepted.reason && accepted.reason.length).toBeGreaterThan(0);
  });

  test('이미 수락(같은 id)한 추천은 카드로 노출되고 중복 추천 카드는 숨긴다', async () => {
    // 화면이 생성할 추천의 id: NOW=2026-06-12(금) → weekStart=2026-06-08 → smart-weekly-2026-06-08
    const accepted: ExtChallenge = {
      id: 'smart-weekly-2026-06-08',
      kind: 'weekly',
      metric: 'distance',
      targetKm: 45,
      reason: '수락됨',
    };
    const r = await render(
      <ProgressionScreen
        runs={CH_RUNS}
        shoes={CH_SHOES}
        now={NOW}
        initialState={seenSuppressedState(CH_RUNS, CH_SHOES)}
        extChallenges={[accepted]}
      />,
    );
    const root = r.root;
    await selectTab(root, 'challenges');

    // 중복 추천 카드는 숨고, 수락분은 일반 확장 카드로 노출된다.
    expect(byTestID(root, 'smart-challenge').length).toBe(0);
    expect(byTestID(root, 'ext-challenge-smart-weekly-2026-06-08').length).toBeGreaterThanOrEqual(1);
  });
});
