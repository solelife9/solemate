// ============================================================================
// HallOfFameScreen.rn.tsx — 랭킹(라이브 리더보드) (Slice E · UI)
// ============================================================================
// 화면 표시명은 "랭킹"이다("명예의 전당"은 은퇴 신발 박물관 HallOfShoes 전용 — 이름 충돌
// 회피). 파일/식별자명은 HallOfFame 으로 유지(내부 구현 일관). Firestore 월간 리더보드
// (leaderboards/{ym}/entries)의 카테고리별 상위 + 내 순위를 보여준다. 점수는 각 사용자가
// 자기 엔트리에 발행한 값(App 클라우드 동기가 publishMyRanking 으로 기록) — 화면은 표시 +
// 카테고리 선택만.
//
// 데이터 소스 seam: lib/progression RankingProvider(keegoFirestoreRankingProvider). 미로그인/
// 쿼리 실패면 provider 가 available:false 로 떨어지고, 화면은 가짜 경쟁자를 만들지 않고
// "곧 공개" 빈 상태를 보여준다(anti-scenario 5). provider 는 주입 가능(테스트 결정성).
//
// 토큰만 사용(theme.ts) — 색/폰트/간격 하드코딩 0. 티어 색은 TIER_COLORS 권위.
// ============================================================================
import React, {useEffect, useState} from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {GhostBar, GhostThumb} from './primitives';
import {
  BG,
  CARD,
  CARD_HI,
  HERO_BG,
  ACCENT,
  T1,
  T2,
  T3,
  SEP,
  FONT,
  DISPLAY,
  SPACE,
  RADIUS,
  TYPE,
  GUTTER,
  TIER_COLORS,
  withAlpha, GLASS,
} from './theme';
import {ymLocal} from './lib/format';
import {keegoFirestoreRankingProvider} from './lib/progression/firestoreRankingStore';
import {titleDef} from './lib/progression/titles';
import type {
  LeaderboardEntry,
  RankingProvider,
} from './lib/progression/types';

type Category =
  | 'distance'
  | 'consistency'
  | 'shoeHealth'
  | 'collection'
  | 'progressPoints';

// 카테고리 메타(라벨/아이콘/점수 표기). 고정 순서로 칩을 노출(결정적 레이아웃).
// 로테이션은 제거(정상 행동 페널티화 회피).
const CATEGORIES: ReadonlyArray<{key: Category; label: string; icon: string}> = [
  {key: 'distance', label: '거리', icon: 'walk'},
  {key: 'consistency', label: '꾸준함', icon: 'flame'},
  {key: 'shoeHealth', label: '신발 관리', icon: 'shield-checkmark'},
  {key: 'collection', label: '컬렉션', icon: 'albums'},
  {key: 'progressPoints', label: '진척 포인트', icon: 'sparkles'},
];

const MEDALS: Record<number, string> = {1: '🥇', 2: '🥈', 3: '🥉'};

/** 'YYYY-MM'(로컬 달, lib/format.ymLocal 단일화). 테스트는 now 주입으로 결정성 확보. */
function yearMonthOf(now: number): string {
  return ymLocal(new Date(now));
}

/** 카테고리별 점수 표기(거리 km / 포인트 P / 켤레 / 일 / 신발관리 0..100). */
function formatScore(category: Category, score: number): string {
  const n = Number.isFinite(score) ? score : 0;
  switch (category) {
    case 'distance':
      return `${Math.round(n).toLocaleString()} km`;
    case 'progressPoints':
      return `${Math.round(n).toLocaleString()} P`;
    case 'collection':
      return `${Math.round(n)} 켤레`;
    case 'consistency':
      return `${Math.round(n)} 일`;
    case 'shoeHealth':
      return `${Math.round(n * 100)}`;
    default:
      return String(Math.round(n));
  }
}

/** 타이틀 키 → 표시명(없으면 빈 문자열 → 칩 미표시). */
function titleName(key: string | null): string {
  if (!key) return '';
  const def = titleDef(key);
  return def ? def.name : '';
}

export interface HallOfFameScreenProps {
  /** 내 닉네임(내 행 강조 보조). */
  profileName?: string;
  /** 뒤로(진척 화면으로 복귀). */
  onBack?: () => void;
  /** 랭킹 데이터 소스(기본 keegoFirestoreRankingProvider). 테스트는 fake 주입. */
  provider?: RankingProvider;
  /** 기준 시각(epoch ms) — 기본 yearMonth 결정. 미주입 시 Date.now(). */
  now?: number;
}

export default function HallOfFameScreen({
  profileName = '나',
  onBack,
  provider = keegoFirestoreRankingProvider,
  now,
}: HallOfFameScreenProps) {
  const insets = useSafeAreaInsets();
  const [yearMonth] = useState(() => yearMonthOf(now ?? Date.now()));
  const [category, setCategory] = useState<Category>('distance');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [lbAvailable, setLbAvailable] = useState(false);
  const [myAvailable, setMyAvailable] = useState(false);
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null);
  const [topPercent, setTopPercent] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  // 카테고리/달 변화 시 리더보드 + 내 순위를 로드한다(발행은 App 클라우드 동기가 담당).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const lb = await provider.getLeaderboard(category, yearMonth);
        const mine = await provider.getMyRanking(category, yearMonth);
        if (!alive) return;
        setEntries(Array.isArray(lb.entries) ? lb.entries : []);
        setLbAvailable(lb.kind === 'remote' && lb.available === true);
        if (mine.kind === 'remote') {
          setMyAvailable(mine.available === true && mine.me !== null);
          setMyEntry(mine.me);
          setTopPercent(mine.topPercent);
          setTotal(mine.total);
        } else {
          setMyAvailable(false);
          setMyEntry(null);
          setTopPercent(null);
          setTotal(0);
        }
      } catch {
        // 로드 실패(네트워크·Firestore) 시 빈 상태로 폴백 — catch 가 없으면 setLoading(false)
        // 에 못 가 스피너에 영구 고착되던 버그(감사 발견). available=false → 빈 상태 렌더.
        if (!alive) return;
        setEntries([]);
        setLbAvailable(false);
        setMyAvailable(false);
        setMyEntry(null);
        setTopPercent(null);
        setTotal(0);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [provider, category, yearMonth]);

  const myUid = myEntry?.uid ?? null;

  const renderRow = (e: LeaderboardEntry, highlight: boolean) => {
    const tColor = TIER_COLORS[e.rankTier] ?? TIER_COLORS.bronze;
    const tName = titleName(e.equippedTitle);
    return (
      <View
        key={`${e.uid}-${e.rank}`}
        testID={`hof-entry-${e.uid}`}
        style={[
          s.row,
          highlight && {
            borderColor: withAlpha(ACCENT, 0.55),
            backgroundColor: withAlpha(ACCENT, 0.08),
          },
        ]}>
        <View style={s.rankCol}>
          <Text style={[s.rankNum, e.rank <= 3 && {color: tColor}]}>
            {MEDALS[e.rank] ?? e.rank}
          </Text>
        </View>
        <View style={[s.tierDot, {backgroundColor: tColor}]} />
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={s.rowName} numberOfLines={1}>
            {e.nickname || (highlight ? profileName : '러너')}
            {highlight ? <Text style={{color: ACCENT}}>{'  (나)'}</Text> : null}
          </Text>
          {tName ? (
            <View
              style={[
                s.titlePill,
                {
                  backgroundColor: withAlpha(tColor, 0.14),
                  borderColor: withAlpha(tColor, 0.4),
                },
              ]}>
              <Text style={[s.titlePillTxt, {color: tColor}]} numberOfLines={1}>
                {tName}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={s.rowScore}>{formatScore(category, e.score)}</Text>
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: rs(18),
          paddingBottom: insets.bottom + 28,
          gap: SPACE.lg,
        }}>
        {/* header */}
        <View style={s.headerRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              testID="hof-back"
              accessibilityRole="button"
              accessibilityLabel="뒤로"
              style={({pressed}) => [s.iconBtn, pressed && {backgroundColor: CARD}]}>
              <Ionicons name="chevron-back" size={ri(20)} color={T2} />
            </Pressable>
          ) : (
            <View style={{width: rs(38)}} />
          )}
          <Text style={s.title}>랭킹</Text>
          <View style={{width: rs(38)}} />
        </View>
        <Text style={s.monthLabel}>{yearMonth} · 이번 달 랭킹</Text>

        {/* 카테고리 선택 칩(가로 스크롤) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{gap: rv(8), paddingRight: rs(8)}}>
          {CATEGORIES.map(c => {
            const active = category === c.key;
            return (
              <Pressable
                key={c.key}
                testID={`hof-category-${c.key}`}
                onPress={() => setCategory(c.key)}
                accessibilityRole="tab"
                accessibilityState={{selected: active}}
                style={[s.catChip, active && {backgroundColor: CARD_HI, borderColor: withAlpha(ACCENT, 0.5)}]}>
                <Ionicons name={c.icon} size={ri(13)} color={active ? ACCENT : T3} />
                <Text style={[s.catChipTxt, active && {color: T1}]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 내 순위 카드 */}
        {myAvailable && myEntry ? (
          <View style={s.myCard} testID="hof-my-rank">
            <View style={{flex: 1}}>
              <Text style={s.myLabel}>내 순위</Text>
              <Text style={s.myRank}>
                #{myEntry.rank}
                <Text style={s.myTotal}> / {total.toLocaleString()}</Text>
              </Text>
              {topPercent !== null ? (
                <Text style={s.myPct}>상위 {topPercent}%</Text>
              ) : null}
            </View>
            <View style={{alignItems: 'flex-end'}}>
              <Text style={s.myScore}>{formatScore(category, myEntry.score)}</Text>
            </View>
          </View>
        ) : (
          <View style={s.hint} testID="hof-my-unavailable">
            <Ionicons name="person-circle-outline" size={ri(18)} color={T3} />
            <Text style={s.hintTxt}>
              로그인 후 동기화하면 내 순위가 표시돼요
            </Text>
          </View>
        )}

        {/* 리더보드 본문 */}
        {loading ? (
          // 로딩 = 고스트 랭킹 행(스피너 폐지) — 빈 상태와 같은 실루엣 언어: '곧 채워질
          // 자리'를 형태로 보여준다(2026-07-10 로딩 표준). 아래로 갈수록 잦아드는 페이드.
          <View style={{gap: rv(8)}} testID="hof-loading">
            {[1, 0.7, 0.45, 0.25, 0.12].map((o, i) => (
              <View key={i} style={[s.row, {opacity: o}]}>
                <GhostBar w={rs(18)} />
                <GhostThumb size={34} />
                <View style={{flex: 1, minWidth: 0}}>
                  <GhostBar w={i % 2 ? '42%' : '56%'} />
                </View>
                <GhostBar w={rs(48)} dim style={{marginTop: 0}} />
              </View>
            ))}
          </View>
        ) : lbAvailable && entries.length > 0 ? (
          <View style={{gap: rv(8)}} testID="hof-leaderboard">
            {entries.map(e => renderRow(e, e.uid === myUid))}
          </View>
        ) : (
          <View style={s.empty} testID="hof-empty">
            <Ionicons name="trophy-outline" size={ri(26)} color={T3} />
            <Text style={s.emptyTitle}>랭킹이 곧 열려요</Text>
            <Text style={s.emptyTxt}>
              친구들과 거리·꾸준함·신발 관리로 경쟁해 보세요.{'\n'}
              로그인하고 러닝을 기록하면 이 달의 순위에 등장합니다.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: rs(38),
    height: rs(38),
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: TYPE.title.fontSize,
    fontWeight: '700',
    letterSpacing: TYPE.title.letterSpacing,
  },
  monthLabel: {
    fontFamily: FONT,
    color: T3,
    fontSize: TYPE.caption.fontSize,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: rv(-8),
  },
  // 카테고리 칩
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rv(6),
    backgroundColor: GLASS.fill,
    borderWidth: 1,
    borderColor: SEP,
    borderRadius: RADIUS.pill,
    paddingHorizontal: rs(12),
    paddingVertical: rv(8),
  },
  catChipTxt: {fontFamily: FONT, color: T3, fontSize: TYPE.label.fontSize, fontWeight: '700'},
  // 내 순위 카드
  myCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HERO_BG,
    borderWidth: 1,
    borderColor: SEP,
    borderRadius: RADIUS.xl,
    padding: SPACE.xl,
  },
  myLabel: {fontFamily: FONT, color: T3, fontSize: TYPE.caption.fontSize, fontWeight: '700'},
  myRank: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: TYPE.display.fontSize,
    fontWeight: '700',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
    marginTop: rv(2),
  },
  myTotal: {fontFamily: FONT, color: T3, fontSize: TYPE.body.fontSize, fontWeight: '700'},
  myPct: {fontFamily: FONT, color: ACCENT, fontSize: TYPE.label.fontSize, fontWeight: '700', marginTop: rv(2)},
  myScore: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: TYPE.heading.fontSize,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  // 힌트(미가용)
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: GLASS.fill,
    borderWidth: 1,
    borderColor: SEP,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: rv(12),
  },
  hintTxt: {flex: 1, fontFamily: FONT, color: T2, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  // 리더보드 행
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rv(10),
    backgroundColor: GLASS.fill,
    borderWidth: 1,
    borderColor: SEP,
    borderRadius: RADIUS.md,
    paddingHorizontal: rs(12),
    paddingVertical: rv(12),
  },
  rankCol: {width: rs(30), alignItems: 'center'},
  rankNum: {
    fontFamily: DISPLAY,
    color: T2,
    fontSize: TYPE.body.fontSize,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tierDot: {width: rs(8), height: rs(8), borderRadius: rs(4)},
  rowName: {fontFamily: FONT, color: T1, fontSize: TYPE.body.fontSize, fontWeight: '700'},
  titlePill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.pill,
    paddingHorizontal: rs(8),
    paddingVertical: rv(2),
    marginTop: rv(4),
    maxWidth: '100%',
  },
  titlePillTxt: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', flexShrink: 1},
  rowScore: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: TYPE.body.fontSize,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  // 상태
  center: {paddingVertical: rv(48), alignItems: 'center'},
  empty: {alignItems: 'center', gap: rv(8), paddingVertical: rv(40), paddingHorizontal: GUTTER},
  emptyTitle: {fontFamily: DISPLAY, color: T1, fontSize: TYPE.heading.fontSize, fontWeight: '700', marginTop: rv(4)},
  emptyTxt: {fontFamily: FONT, color: T3, fontSize: TYPE.label.fontSize, fontWeight: '600', lineHeight: rf(18), textAlign: 'center'},
});
