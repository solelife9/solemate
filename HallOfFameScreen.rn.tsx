// ============================================================================
// HallOfFameScreen.rn.tsx — 랭킹(라이브 리더보드) (Slice E · UI)
// ============================================================================
// 화면 표시명은 "랭킹"이다("명예의 전당"은 은퇴 신발 박물관 HallOfShoes 전용 — 이름 충돌
// 회피). 파일/식별자명은 HallOfFame 으로 유지(내부 구현 일관). 멀티유저 백엔드(/api/v1)의
// 카테고리별 리더보드와 내 순위를 보여준다. 데이터는 서버가
// 검증된 run/shoe 로 재계산한 값만 쓴다(클라 점수 불신) — 화면은 표시 + 카테고리 선택만.
//
// 데이터 소스 seam: lib/progression RankingProvider(keegoRankingProvider). 백엔드 미배포/
// 미로그인이면 provider 가 available:false 로 떨어지고, 화면은 가짜 경쟁자를 만들지 않고
// "곧 공개" 빈 상태를 보여준다(anti-scenario 5). provider/sync 는 주입 가능(테스트 결정성).
//
// 토큰만 사용(theme.ts) — 색/폰트/간격 하드코딩 0. 티어 색은 TIER_COLORS 권위.
// ============================================================================
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
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
  TIER_COLORS,
  withAlpha,
} from './theme';
import {keegoRankingProvider, ensureBackendSynced} from './lib/progression/rankingProvider';
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

/** 'YYYY-MM'(로컬 달). 테스트는 now 주입으로 결정성 확보. */
function yearMonthOf(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
  /** 랭킹 데이터 소스(기본 keegoRankingProvider). 테스트는 fake 주입. */
  provider?: RankingProvider;
  /** 기존 device user_id — 마운트 시 백엔드에 연결+재계산(내가 리더보드에 반영되도록). */
  deviceUserId?: string | null;
  /** device→Firebase UID 연결+재계산 트리거(기본 ensureBackendSynced). 테스트 주입용. */
  sync?: (deviceUserId: string) => Promise<boolean>;
  /** 기준 시각(epoch ms) — 기본 yearMonth 결정. 미주입 시 Date.now(). */
  now?: number;
}

export default function HallOfFameScreen({
  profileName = '나',
  onBack,
  provider = keegoRankingProvider,
  deviceUserId = null,
  sync = ensureBackendSynced,
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
  // 동기화(link+recalc) 완료 후 1회 리로드를 트리거하는 키.
  const [reloadKey, setReloadKey] = useState(0);

  // 마운트 1회: device 계정을 백엔드에 연결+재계산(베스트에포트). 성공하면 리로드.
  useEffect(() => {
    if (!deviceUserId) return;
    let alive = true;
    void sync(deviceUserId).then(ok => {
      if (alive && ok) setReloadKey(k => k + 1);
    });
    return () => {
      alive = false;
    };
    // 마운트 1회만(deviceUserId 고정). sync 는 주입 안정적.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceUserId]);

  // 카테고리/달/리로드 변화 시 리더보드 + 내 순위를 로드한다.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
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
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [provider, category, yearMonth, reloadKey]);

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
          paddingHorizontal: 18,
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
              <Ionicons name="chevron-back" size={20} color={T2} />
            </Pressable>
          ) : (
            <View style={{width: 38}} />
          )}
          <Text style={s.title}>랭킹</Text>
          <View style={{width: 38}} />
        </View>
        <Text style={s.monthLabel}>{yearMonth} · 이번 달 랭킹</Text>

        {/* 카테고리 선택 칩(가로 스크롤) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{gap: 8, paddingRight: 8}}>
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
                <Ionicons name={c.icon} size={13} color={active ? ACCENT : T3} />
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
            <Ionicons name="person-circle-outline" size={18} color={T3} />
            <Text style={s.hintTxt}>
              로그인 후 동기화하면 내 순위가 표시돼요
            </Text>
          </View>
        )}

        {/* 리더보드 본문 */}
        {loading ? (
          <View style={s.center} testID="hof-loading">
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : lbAvailable && entries.length > 0 ? (
          <View style={{gap: 8}} testID="hof-leaderboard">
            {entries.map(e => renderRow(e, e.uid === myUid))}
          </View>
        ) : (
          <View style={s.empty} testID="hof-empty">
            <Ionicons name="trophy-outline" size={26} color={T3} />
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
    width: 38,
    height: 38,
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
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -8,
  },
  // 카테고리 칩
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  catChipTxt: {fontFamily: FONT, color: T3, fontSize: 12.5, fontWeight: '700'},
  // 내 순위 카드
  myCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HERO_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    borderRadius: RADIUS.xl,
    padding: SPACE.xl,
  },
  myLabel: {fontFamily: FONT, color: T3, fontSize: 12, fontWeight: '700'},
  myRank: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  myTotal: {fontFamily: FONT, color: T3, fontSize: 14, fontWeight: '700'},
  myPct: {fontFamily: FONT, color: ACCENT, fontSize: 13, fontWeight: '800', marginTop: 2},
  myScore: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  // 힌트(미가용)
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: 13,
  },
  hintTxt: {flex: 1, fontFamily: FONT, color: T2, fontSize: 12.5, fontWeight: '600'},
  // 리더보드 행
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    borderRadius: RADIUS.md,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  rankCol: {width: 30, alignItems: 'center'},
  rankNum: {
    fontFamily: DISPLAY,
    color: T2,
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  tierDot: {width: 8, height: 8, borderRadius: 4},
  rowName: {fontFamily: FONT, color: T1, fontSize: 14, fontWeight: '700'},
  titlePill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
    maxWidth: '100%',
  },
  titlePillTxt: {fontFamily: FONT, fontSize: 11, fontWeight: '700', flexShrink: 1},
  rowScore: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  // 상태
  center: {paddingVertical: 48, alignItems: 'center'},
  empty: {alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 20},
  emptyTitle: {fontFamily: DISPLAY, color: T1, fontSize: 16, fontWeight: '800', marginTop: 4},
  emptyTxt: {fontFamily: FONT, color: T3, fontSize: 12.5, fontWeight: '600', lineHeight: 18, textAlign: 'center'},
});
