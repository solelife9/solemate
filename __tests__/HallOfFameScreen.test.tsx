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
    // 2026-08-03: shoeHealth·collection 카테고리는 랭킹에서 제거됐다(검증 불가·인센티브
    // 역전). 남은 축 중 하나로 확인한다 — 검사 의도는 '칩을 누르면 그 축으로 재조회'다.
    const chip = one(r.root, 'hof-category-consistency');
    await act(async () => {
      (chip.props as any).onPress();
    });
    await settle();
    expect(provider.getLeaderboard).toHaveBeenCalledWith('consistency', '2026-06');
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

// ── 러너 프로필 열기(소셜 2단계) ──────────────────────────────────────────────
// "1, 2, 3위는 뭘 신나"가 이 랭킹의 차별점인데 목록은 신발 이름 한 줄까지만 담는다.
// 그 줄을 눌러 그 사람의 프로필로 들어가는 게 다음 걸음이다.
describe('러너 프로필 열기', () => {
  const pressable = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
    byId(root, id).find(n => typeof (n.props as any).onPress === 'function');

  test('남의 행을 누르면 uid 와 이름을 준다', async () => {
    const onOpenRunner = jest.fn();
    const r = await render(
      <HallOfFameScreen provider={makeProvider(true)} now={NOW} onOpenRunner={onOpenRunner} />,
    );
    const row = pressable(r.root, 'hof-entry-a');
    expect(row).toBeTruthy();
    await act(async () => { (row!.props as any).onPress(); });
    expect(onOpenRunner).toHaveBeenCalledWith('a', expect.any(String));
    r.unmount();
  });

  test('내 행은 열리지 않는다 — 내 프로필은 마이 탭이 정본이다', async () => {
    const onOpenRunner = jest.fn();
    const r = await render(
      <HallOfFameScreen provider={makeProvider(true)} now={NOW} onOpenRunner={onOpenRunner} />,
    );
    const mine = byId(r.root, 'hof-entry-me').find(n => (n.props as any).disabled !== undefined);
    expect(mine).toBeTruthy();
    expect((mine!.props as any).disabled).toBe(true);
    r.unmount();
  });

  test('핸들러가 없으면 아무 행도 눌리지 않는다 — 반응 없는 버튼을 만들지 않는다', async () => {
    const r = await render(<HallOfFameScreen provider={makeProvider(true)} now={NOW} />);
    for (const id of ['hof-entry-a', 'hof-entry-c']) {
      const row = byId(r.root, id).find(n => (n.props as any).disabled !== undefined);
      expect((row!.props as any).disabled).toBe(true);
    }
    r.unmount();
  });
});

// ── 「이번 달 많이 신는 러닝화」 ───────────────────────────────────────────────
// 위 목록을 세기만 한 카드다 — **추가 읽기가 0**이라는 게 설계의 핵심.
describe('신발 유행 카드', () => {
  /** 신발을 실은 엔트리 n명(같은 신발 share 명). */
  const withShoes = (n: number, share: number) =>
    Array.from({length: n}, (_, i) => entry({
      uid: `u${i}`, rank: i + 1, score: 100 - i, nickname: `러너${i}`,
      shoes: i < share
        ? [{brand: 'Nike', model: 'Pegasus 41', usedKm: 300}]
        : [{brand: 'Etc', model: `M${i}`, usedKm: 100}],
    } as never));

  const provider = (rows: unknown[]) => ({
    getLeaderboard: jest.fn(async (category: string, yearMonth: string) => ({
      kind: 'remote' as const, available: true, category, yearMonth, entries: rows,
    })),
    getMyRanking: jest.fn(async (category: string, yearMonth: string) => ({
      kind: 'remote' as const, available: true, category, yearMonth,
      total: rows.length, topPercent: null, me: null, nearby: [],
    })),
  } as never);

  // 2026-08-03: 카드를 붙일 때 앵커가 **카테고리 칩 가로 스크롤**에 걸려, 카드가 칩
  // 옆으로 들어간 적이 있다. testID 만 보는 테스트는 그걸 못 잡았다 — 위치도 본다.
  test('세로 본문에 있다 — 가로 칩 스크롤 안이 아니다', async () => {
    const r = await render(<HallOfFameScreen provider={provider(withShoes(10, 4))} now={NOW} />);
    const inHorizontal = (node: any): boolean => {
      if (!node || typeof node !== 'object') return false;
      const kids = node.children ?? [];
      const has = (n: any): boolean =>
        n?.props?.testID === 'hof-trends' || (n?.children ?? []).some(has);
      if (node.props?.horizontal === true && kids.some(has)) return true;
      return kids.some(inHorizontal);
    };
    expect(inHorizontal(r.toJSON())).toBe(false);
    r.unmount();
  });

  test('표본이 모이면 카드가 뜬다', async () => {
    const r = await render(<HallOfFameScreen provider={provider(withShoes(10, 4))} now={NOW} />);
    expect(one(r.root, 'hof-trends')).toBeTruthy();
    r.unmount();
  });

  test('표본이 모자라면 카드를 아예 만들지 않는다 — 3명이 신는 건 유행이 아니다', async () => {
    const r = await render(<HallOfFameScreen provider={provider(withShoes(3, 2))} now={NOW} />);
    expect(byId(r.root, 'hof-trends')).toHaveLength(0);
    r.unmount();
  });

  test('신발을 안 실은 옛 엔트리만 있으면 카드가 없다', async () => {
    const rows = Array.from({length: 12}, (_, i) =>
      entry({uid: `u${i}`, rank: i + 1, score: 10, nickname: `r${i}`}));
    const r = await render(<HallOfFameScreen provider={provider(rows)} now={NOW} />);
    expect(byId(r.root, 'hof-trends')).toHaveLength(0);
    r.unmount();
  });

  test('표본 수를 밝힌다 — "전체 사용자"가 아니라 "순위에 오른 N명"이다', async () => {
    const r = await render(<HallOfFameScreen provider={provider(withShoes(10, 4))} now={NOW} />);
    // 텍스트가 노드로 쪼개져 있어(["순위 ", 10, "명 기준"]) 이어 붙여 본다.
    const flat = (n: any): string => {
      if (typeof n === 'string' || typeof n === 'number') return String(n);
      if (!n?.children) return '';
      return n.children.map(flat).join('');
    };
    const txt = flat(r.toJSON());
    expect(txt).toContain('순위 10명 기준');
    expect(txt).toContain('많이 신는 러닝화');
    expect(txt).toContain('Pegasus 41');       // 4명이 신어 1위여야 한다
    r.unmount();
  });

  test('카드를 그리려고 추가로 읽지 않는다', async () => {
    const p = provider(withShoes(10, 4));
    const r = await render(<HallOfFameScreen provider={p} now={NOW} />);
    // 리더보드 1회 + 내 순위 1회가 전부다. 프로필을 미리 당겨오면 여기가 늘어난다.
    expect((p as never as {getLeaderboard: jest.Mock}).getLeaderboard).toHaveBeenCalledTimes(1);
    r.unmount();
  });
});

// ── 내 최고 순위(전성기) ──────────────────────────────────────────────────────
// 랭킹은 한 달짜리라, 잘 달린 달이 다음 달이면 사라진다. 그 한 달을 붙잡는 한 줄이다.
// **읽기 0** — 이미 읽은 내 순위를 지나가며 로컬에 적어 둔다.
describe('내 최고 순위', () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  const {RANK_HISTORY_KEY} = require('../lib/rankHistory');

  const flat = (n: any): string => {
    if (typeof n === 'string' || typeof n === 'number') return String(n);
    if (!n?.children) return '';
    return n.children.map(flat).join('');
  };

  beforeEach(async () => { await AsyncStorage.clear(); });

  test('지난 최고가 지금보다 좋으면 그 달과 함께 보여준다', async () => {
    await AsyncStorage.setItem(RANK_HISTORY_KEY,
      JSON.stringify({distance: {rank: 1, yearMonth: '2026-05'}}));
    const r = await render(<HallOfFameScreen provider={makeProvider(true)} now={NOW} />);
    expect(flat(r.toJSON())).toContain('내 최고 1위 · 2026년 5월');
    r.unmount();
  });

  test('지금이 최고면 그렇다고 말한다 — 그 순간을 알려주는 게 이 줄의 값이다', async () => {
    // 목 provider 의 내 순위는 2위. 저장된 최고를 그보다 낮게 두면 지금이 최고다.
    await AsyncStorage.setItem(RANK_HISTORY_KEY,
      JSON.stringify({distance: {rank: 9, yearMonth: '2026-05'}}));
    const r = await render(<HallOfFameScreen provider={makeProvider(true)} now={NOW} />);
    expect(flat(r.toJSON())).toContain('지금이 내 최고 순위예요');
    r.unmount();
  });

  test('이번 달 순위를 로컬에 적어 둔다 — 다음 달에 이게 전성기가 된다', async () => {
    const r = await render(<HallOfFameScreen provider={makeProvider(true)} now={NOW} />);
    const saved = JSON.parse((await AsyncStorage.getItem(RANK_HISTORY_KEY)) ?? '{}');
    expect(saved.distance.rank).toBe(2);          // 목의 내 순위
    r.unmount();
  });

  test('내 순위를 모르면 줄이 아예 없다 — 없는 기록을 만들지 않는다', async () => {
    const r = await render(<HallOfFameScreen provider={makeProvider(false)} now={NOW} />);
    expect(byId(r.root, 'hof-best-rank')).toHaveLength(0);
    r.unmount();
  });

  test('기록이 없으면 줄이 없다(첫 사용자에게 빈 자리를 만들지 않는다)', async () => {
    // 저장 전 첫 렌더에는 아직 기록이 없다 — provider 가 실패하는 경우로 본다.
    const failing = {
      getLeaderboard: jest.fn(async () => { throw new Error('offline'); }),
      getMyRanking: jest.fn(async () => { throw new Error('offline'); }),
    } as never;
    const r = await render(<HallOfFameScreen provider={failing} now={NOW} />);
    expect(byId(r.root, 'hof-best-rank')).toHaveLength(0);
    r.unmount();
  });
});

// ─── 축마다 집계 범위가 다르다는 걸 화면이 밝히는가 (2026-08-03) ────────────────
// 거리·꾸준함은 이번 달 런만 세지만, 진척 포인트는 **평생 누적 XP**다
// (App.tsx 가 view.rank.xp 를 싣는다). 그 축에도 "이번 달 랭킹"이라고 적으면
// 사용자는 이번 달 성적표로 읽는다 — 실제로는 먼저 시작한 사람이 위에 있는 표다.
describe('집계 범위 라벨', () => {
  const labelOf = (r: ReactTestRenderer.ReactTestRenderer): string => {
    let out = '';
    const walk = (n: any) => {
      if (typeof n === 'string') { out += n; return; }
      if (!n || !n.children) return;
      n.children.forEach(walk);
    };
    walk(r.toJSON());
    return out;
  };

  test('거리 축은 이번 달 랭킹이라고 밝힌다', async () => {
    const r = await render(<HallOfFameScreen provider={makeProvider(true)} now={NOW} />);
    expect(labelOf(r)).toContain('이번 달 랭킹');
  });

  test('진척 포인트 축은 누적임을 밝힌다 — "이번 달"이라 하지 않는다', async () => {
    const r = await render(<HallOfFameScreen provider={makeProvider(true)} now={NOW} />);
    const chip = one(r.root, 'hof-category-progressPoints');
    await act(async () => { (chip.props as any).onPress(); });
    await settle();
    const t = labelOf(r);
    expect(t).toContain('전체 기간 누적');
    expect(t).not.toContain('이번 달 랭킹');
  });
});
