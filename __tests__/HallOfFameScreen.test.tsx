/**
 * HallOfFameScreen.rn.tsx — 명예의 전당(라이브 리더보드) 행동 테스트 (Slice E · UI).
 *
 * 관찰 가능한 동작만 검증한다(네트워크 없음 — fake RankingProvider 주입):
 *  1) provider 의 리더보드 엔트리를 렌더하고, 내 순위 카드를 표시한다.
 *  2) 카테고리 칩을 누르면 그 카테고리로 provider 를 다시 조회한다.
 *  3) provider 가 available:false 면 가짜 경쟁자 없이 빈 상태("곧 공개")로 떨어진다.
 *
 * props-driven · 결정적 now 주입 · throw 없음.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HallOfFameScreen from '../HallOfFameScreen.rn';
import type {
  LeaderboardEntry,
  RankingProvider,
} from '../lib/progression/types';

const NOW = Date.parse('2026-06-14T08:00:00Z'); // → yearMonth 2026-06

function entry(over: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    uid: 'u',
    yearMonth: '2026-06',
    category: 'distance',
    rank: 1,
    score: 100,
    nickname: '러너',
    rankTier: 'gold',
    rankColor: '#FFD700',
    equippedTitle: null,
    ...over,
  };
}

function makeProvider(available: boolean): RankingProvider & {
  getLeaderboard: jest.Mock;
  getMyRanking: jest.Mock;
} {
  const entries = available
    ? [
        entry({uid: 'a', rank: 1, score: 500, nickname: '에이스', rankTier: 'legend', equippedTitle: 'running_1000k'}),
        entry({uid: 'me', rank: 2, score: 300, nickname: '나', rankTier: 'gold'}),
        entry({uid: 'c', rank: 3, score: 100, nickname: '씨', rankTier: 'silver'}),
      ]
    : [];
  const getLeaderboard = jest.fn(async (category: string, yearMonth: string) => ({
    kind: 'remote' as const,
    available,
    category,
    yearMonth,
    entries,
  }));
  const getMyRanking = jest.fn(async (category: string, yearMonth: string) => ({
    kind: 'remote' as const,
    available,
    category,
    yearMonth,
    total: available ? 50 : 0,
    topPercent: available ? 4 : null,
    me: available ? entry({uid: 'me', rank: 2, score: 300, nickname: '나'}) : null,
    nearby: [],
  }));
  return {getLeaderboard, getMyRanking} as any;
}

// 로드 effect(provider 조회 → setState)가 모두 settle 될 때까지 마이크로태스크를
// 여러 라운드 비운다 — 테스트 종료 후 setState("Cannot log after tests are done") 방지.
async function settle() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

async function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(el);
  });
  await settle();
  return r;
}

const byId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll(n => !!n.props && (n.props as any).testID === id);
const one = (root: ReactTestRenderer.ReactTestInstance, id: string) => byId(root, id)[0];

describe('HallOfFameScreen', () => {
  test('available: 엔트리 렌더 + 내 순위 카드', async () => {
    const provider = makeProvider(true);
    const r = await render(
      <HallOfFameScreen provider={provider} now={NOW} />,
    );
    const root = r.root;
    // 존재 여부로 단언(host 인스턴스가 RTR 에서 중복 매칭될 수 있어 정확 개수 대신 presence).
    expect(one(root, 'hof-my-rank')).toBeTruthy();
    expect(one(root, 'hof-leaderboard')).toBeTruthy();
    expect(one(root, 'hof-entry-a')).toBeTruthy();
    expect(one(root, 'hof-entry-me')).toBeTruthy();
    expect(one(root, 'hof-entry-c')).toBeTruthy();
    // 첫 조회는 기본 카테고리(distance) + 이번 달.
    expect(provider.getLeaderboard).toHaveBeenCalledWith('distance', '2026-06');
    expect(provider.getMyRanking).toHaveBeenCalledWith('distance', '2026-06');
  });

  test('카테고리 칩 누르면 그 카테고리로 재조회', async () => {
    const provider = makeProvider(true);
    const r = await render(
      <HallOfFameScreen provider={provider} now={NOW} />,
    );
    const chip = one(r.root, 'hof-category-shoeHealth');
    await act(async () => {
      (chip.props as any).onPress();
    });
    await settle();
    expect(provider.getLeaderboard).toHaveBeenCalledWith('shoeHealth', '2026-06');
  });

  test('unavailable: 빈 상태 + 내 순위 미가용 힌트', async () => {
    const provider = makeProvider(false);
    const r = await render(
      <HallOfFameScreen provider={provider} now={NOW} />,
    );
    const root = r.root;
    expect(one(root, 'hof-empty')).toBeTruthy();
    expect(one(root, 'hof-my-unavailable')).toBeTruthy();
    expect(byId(root, 'hof-leaderboard')).toHaveLength(0); // 미렌더 → 0(중복 무관).
    expect(byId(root, 'hof-my-rank')).toHaveLength(0);
  });
});

/** 렌더 트리의 모든 텍스트를 이어 붙인다. */
function textOf(node: unknown): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

// ─── 「1, 2, 3위는 뭘 신나」 (2026-08-01) ──────────────────────────────────────
// keego 랭킹의 차별점. 값은 **엔트리에 실려 온다** — 화면이 프로필을 따로 읽지 않는다.
// 그게 이 설계의 핵심이라(상위 100명 × 1읽기를 아낀다) 그 계약을 테스트로 못 박는다.
describe('랭킹 행의 신발 표시', () => {
  const shoeEntry = (over: Record<string, unknown> = {}) =>
    entry({uid: 'a', rank: 1, score: 500, nickname: '에이스', ...over});

  const renderWith = async (entries: unknown[]) => {
    const provider = {
      getLeaderboard: jest.fn(async (category: string, yearMonth: string) => ({
        kind: 'remote' as const, available: true, category, yearMonth, entries,
      })),
      getMyRanking: jest.fn(async (category: string, yearMonth: string) => ({
        kind: 'remote' as const, available: false, category, yearMonth,
        total: 0, topPercent: null, me: null, nearby: [],
      })),
    } as never;
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<HallOfFameScreen provider={provider} profileName="나" />);
    });
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
    return {r, provider};
  };

  test('신발이 있으면 순위 행에 뜬다', async () => {
    const {r} = await renderWith([
      shoeEntry({shoes: [
        {brand: 'Nike', model: 'Alphafly 3', usedKm: 210},
        {brand: 'Hoka', model: 'Clifton 9', usedKm: 130},
      ]}),
    ]);
    const t = textOf(r.toJSON());
    expect(t).toContain('Alphafly 3');
    expect(t).toContain('Clifton 9');
    r.unmount();
  });

  test('신발을 위해 추가 조회를 하지 않는다 — 엔트리에 실려 온다', async () => {
    const {r, provider} = await renderWith([
      shoeEntry({shoes: [{brand: 'Nike', model: 'Alphafly 3', usedKm: 210}]}),
    ]);
    // 화면이 부르는 것은 리더보드 + 내 순위 둘뿐이다(프로필 조회 없음).
    expect(Object.keys(provider as object).sort()).toEqual(['getLeaderboard', 'getMyRanking']);
    expect((provider as never as {getLeaderboard: jest.Mock}).getLeaderboard).toHaveBeenCalled();
    r.unmount();
  });

  test('옛 엔트리(신발 없음)는 그 줄이 조용히 빠진다', async () => {
    const {r} = await renderWith([shoeEntry()]);
    const found = r.root.findAll(n => (n.props as any)?.testID === 'hof-shoes-a');
    expect(found).toHaveLength(0);
    r.unmount();
  });

  test('모델명이 없으면 브랜드로 대체한다(직접 등록한 신발)', async () => {
    const {r} = await renderWith([
      shoeEntry({shoes: [{brand: '내신발', model: '', usedKm: 50}]}),
    ]);
    expect(textOf(r.toJSON())).toContain('내신발');
    r.unmount();
  });
});
