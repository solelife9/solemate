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
import React, {useEffect, useMemo, useState} from 'react';
import { rs, ri, rv } from './lib/responsive';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import {Text, FONT_SCALE_CAP_HERO} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
// 「이번 달 많이 신는 러닝화」 — 엔트리에 이미 실려 온 신발을 세기만 한다(추가 읽기 0).
import {shoeTrends, type ShoeTrend} from './lib/shoeTrends';
import {ScreenHeader, EmptyGhostHeader, GhostBar, GhostThumb, GlassEdge} from './primitives';
import {
  BG,
  CARD_HI,
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
  withAlpha, GLASS,
  GUTTER, MOTION, NUM,
  ICON,
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

// 1·2·3위 표기 — 이모지 메달(🥇🥈🥉) 폐지(감사 #62, 밈 톤 금지): 티어 색 숫자로.
// 색은 TIER_COLORS 권위(gold/silver/bronze) — 순위 색이지 그 유저의 rankTier 색이 아니다.
const RANK_TINT: Record<number, string> = {
  1: TIER_COLORS.gold,
  2: TIER_COLORS.silver,
  3: TIER_COLORS.bronze,
};

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

// 고스트 랭킹 행 — 로딩·빈 상태가 같은 실루엣을 공유한다(2장, 둘째 45% 딤).
const GHOST_ROW_OPACITY = [1, 0.45] as const;
function GhostRankRow({opacity, alt}: {opacity: number; alt?: boolean}) {
  return (
    <View style={[s.row, {opacity}]}>
      <GlassEdge glints={false} radius={RADIUS.md} />
      <GhostBar w={rs(18)} />
      <GhostThumb size={34} />
      <View style={{flex: 1, minWidth: 0}}>
        <GhostBar w={alt ? '42%' : '56%'} />
      </View>
      <GhostBar w={rs(48)} dim style={{marginTop: 0}} />
    </View>
  );
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
  /**
   * 러너 한 명을 연다(랭킹 행 탭 → 공개 프로필). 없으면 행이 눌리지 않는다 —
   * 소셜이 꺼진 빌드에서 아무 일도 안 하는 버튼을 만들지 않기 위해서다.
   */
  onOpenRunner?: (uid: string, nickname: string) => void;
  /** 뒤로(진척 화면으로 복귀). */
  onBack?: () => void;
  /** 랭킹 데이터 소스(기본 keegoFirestoreRankingProvider). 테스트는 fake 주입. */
  provider?: RankingProvider;
  /** 기준 시각(epoch ms) — 기본 yearMonth 결정. 미주입 시 Date.now(). */
  now?: number;
}

export default function HallOfFameScreen({
  profileName = '나',
  onOpenRunner,
  onBack,
  provider = keegoFirestoreRankingProvider,
  now,
}: HallOfFameScreenProps) {
  const insets = useSafeAreaInsets();
  const [yearMonth] = useState(() => yearMonthOf(now ?? Date.now()));
  const [category, setCategory] = useState<Category>('distance');
  const [loading, setLoading] = useState(true);
  // 로드 실패(오프라인/Firestore) 여부 — 빈 상태 카피를 "랭킹이 곧 열려요"(오해 유발)
  // 대신 정직한 오프라인 안내로 바꾼다(심사 잔여 '오프라인 표시' 최소안, 2026-07-25).
  const [loadFailed, setLoadFailed] = useState(false);
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
        setLoadFailed(false);
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
        setLoadFailed(true);
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
  // 표본이 모자라면 top 이 비어 카드가 통째로 빠진다 — 3명이 신는 걸 유행이라 부르지 않는다.
  const trends = useMemo(() => shoeTrends(entries, 5), [entries]);

  const renderRow = (e: LeaderboardEntry, highlight: boolean) => {
    const tColor = TIER_COLORS[e.rankTier] ?? TIER_COLORS.bronze;
    const tName = titleName(e.equippedTitle);
    const shown = e.nickname || (highlight ? profileName : '러너');
    // 내 행은 열지 않는다 — 내 프로필은 마이 탭이 정본이고, 여기서 또 열면 같은 걸
    // 두 곳에서 보게 된다. 남의 행만 눌린다.
    const openable = !!onOpenRunner && !highlight && !!e.uid;
    return (
      <Pressable
        key={`${e.uid}-${e.rank}`}
        testID={`hof-entry-${e.uid}`}
        onPress={openable ? () => onOpenRunner!(e.uid, shown) : undefined}
        disabled={!openable}
        accessibilityRole={openable ? 'button' : undefined}
        accessibilityLabel={openable ? `${shown} 프로필 보기` : undefined}
        style={({pressed}) => [
          s.row,
          highlight && {
            borderWidth: 1,
            borderColor: withAlpha(ACCENT, 0.55),
            backgroundColor: withAlpha(ACCENT, 0.08),
          },
          pressed && openable && s.rowPressed,
        ]}>
        {/* 일반 행 = 코너 페이드 헤어라인, 내 행(highlight) = 액센트 의미 보더(예외). */}
        {!highlight && <GlassEdge glints={false} radius={RADIUS.md} />}
        <View style={s.rankCol}>
          <Text style={[s.rankNum, RANK_TINT[e.rank] ? {color: RANK_TINT[e.rank]} : null]}>
            {e.rank}
          </Text>
        </View>
        <View style={[s.tierDot, {backgroundColor: tColor}]} />
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={s.rowName} numberOfLines={1}>
            {shown}
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
          {/* 「1, 2, 3위는 뭘 신나」 — 이 한 줄이 keego 랭킹의 차별점이다(2026-08-01).
              엔트리에 실려 온 값이라 **추가 읽기가 없다**. 옛 엔트리엔 없으므로 조용히 빠진다.
              브랜드는 작은 대문자, 모델은 본문 — 이름이 길어도 한 줄에서 잘린다. */}
          {e.shoes?.length ? (
            <Text style={s.rowShoes} numberOfLines={1} testID={`hof-shoes-${e.uid}`}>
              {e.shoes.map(sh => (sh.model || sh.brand)).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Text style={s.rowScore}>{formatScore(category, e.score)}</Text>
        {/* 열 수 있는 행에만 화살표. 없으면 눌러도 아무 일이 없는 줄로 보인다. */}
        {openable && (
          <Ionicons name="chevron-forward" size={ri(ICON.inline)} color={T3} style={s.rowChev} />
        )}
      </Pressable>
    );
  };

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: GUTTER,
          paddingBottom: insets.bottom + 28,
          gap: SPACE.lg,
        }}>
        {/* header — 표준 내비 헤더(primitives.ScreenHeader), 수제 조립 폐지(2026-07-25).
            거터는 ScrollView 컨테이너가 이미 주므로 패딩 0. (구 back 버튼 testID
            hof-back 은 헤더 행으로 이동 — 참조 테스트 없음 확인.) */}
        <ScreenHeader title="랭킹" onBack={onBack} testID="hof-back" style={s.header} />
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
                // 칩 높이 ~34pt — hitSlop 으로 실효 44pt 확보 + 누름 표준(MOTION.press).
                hitSlop={6}
                style={({pressed}) => [
                  s.catChip,
                  active && {backgroundColor: CARD_HI, borderColor: withAlpha(ACCENT, 0.5)},
                  pressed && s.pressed,
                ]}>
                <Ionicons name={c.icon} size={ri(ICON.tag)} color={active ? ACCENT : T3} />
                <Text style={[s.catChipTxt, active && {color: T1}]}>{c.label}</Text>
              </Pressable>
            );
          })}
  
        {/* 「이번 달 많이 신는 러닝화」 — 위 목록을 세기만 한 것이라 **추가 읽기가 0**이다.
            표본이 적으면 shoeTrends 가 빈 목록을 주고 이 카드는 통째로 빠진다. */}
        {trends.top.length > 0 && (
          <View style={s.trendCard} testID="hof-trends">
            <GlassEdge glints={false} radius={RADIUS.md} />
            <View style={s.trendHead}>
              <Text style={s.trendTitle}>이번 달 많이 신는 러닝화</Text>
              {/* 표본을 밝힌다 — "전체 사용자"가 아니라 "순위에 오른 N명"이다. */}
              <Text style={s.trendMeta}>순위 {trends.sampleSize}명 기준</Text>
            </View>
            {trends.top.map((t: ShoeTrend, i: number) => (
              <View key={`${t.brand}|${t.model}`} style={s.trendRow}>
                <Text style={s.trendRank}>{i + 1}</Text>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={s.trendBrand} numberOfLines={1}>{t.brand.toUpperCase()}</Text>
                  <Text style={s.trendModel} numberOfLines={1}>{t.model || t.brand}</Text>
                </View>
                <View style={{alignItems: 'flex-end'}}>
                  <Text style={s.trendCount}>{t.runners}명</Text>
                  {/* 평균 거리는 아는 사람 것만 낸다. 아무도 모르면 이 줄이 빠진다. */}
                  {t.avgKm !== null && (
                    <Text style={s.trendKm}>평균 {t.avgKm.toLocaleString('ko-KR')}km</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

        {/* 내 순위 카드 */}
        {myAvailable && myEntry ? (
          <View style={s.myCard} testID="hof-my-rank">
            <GlassEdge glints={false} radius={RADIUS.xl} />
            <View style={{flex: 1}}>
              <Text style={s.myLabel}>내 순위</Text>
              <Text maxFontSizeMultiplier={FONT_SCALE_CAP_HERO} style={s.myRank}>
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
            <GlassEdge glints={false} radius={RADIUS.md} />
            <Ionicons name="person-circle-outline" size={ri(ICON.action)} color={T3} />
            <Text style={s.hintTxt}>
              로그인 후 동기화하면 내 순위가 표시돼요
            </Text>
          </View>
        )}

        {/* 리더보드 본문 */}
        {loading ? (
          // 로딩 = 고스트 랭킹 행(스피너 폐지) — 빈 상태와 같은 실루엣 언어: '곧 채워질
          // 자리'를 형태로 보여준다(2026-07-10 로딩 표준). 에디토리얼 스케일에 맞춰
          // 2장만(둘째 45% 딤) — 형제 화면(보관함·아카이브) 고스트 문법과 통일(감사 #31).
          <View style={{gap: rv(8)}} testID="hof-loading">
            {GHOST_ROW_OPACITY.map((o, i) => (
              <GhostRankRow key={i} opacity={o} alt={i % 2 === 1} />
            ))}
          </View>
        ) : lbAvailable && entries.length > 0 ? (
          <View style={{gap: rv(8)}} testID="hof-leaderboard">
            {entries.map(e => renderRow(e, e.uid === myUid))}
          </View>
        ) : (
          // 빈 상태 — 중앙 아이콘+텍스트 폐지 → 전역 표준 EmptyGhostHeader + 고스트 행
          // (형제 화면 ShoeArchive/HallOfShoes 와 같은 문법, 감사 #54).
          <View testID="hof-empty">
            {/* 실패(오프라인)와 진짜 빈 상태를 구분 — "곧 열려요"는 오프라인에선 거짓말이 된다. */}
            <EmptyGhostHeader
              title={loadFailed ? '지금은 오프라인이에요' : '랭킹이 곧 열려요'}
              sub={loadFailed
                ? <>랭킹은 연결되면 다시 불러올게요.{'\n'}러닝 기록은 폰에 그대로 — 달리는 데는 지장 없어요.</>
                : <>친구들과 거리·꾸준함·신발 관리로 경쟁해 보세요.{'\n'}로그인하고 러닝을 기록하면 이 달의 순위에 등장합니다.</>}
            />
            <View style={{gap: rv(8)}}>
              {GHOST_ROW_OPACITY.map((o, i) => (
                <GhostRankRow key={i} opacity={o} alt={i % 2 === 1} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  // ScreenHeader 는 자체 GUTTER·상하 패딩을 갖는다 — 이 화면은 ScrollView 컨테이너가
  // 거터·gap 을 이미 주므로 0 으로 상쇄한다(시각 동등).
  header: {paddingHorizontal: 0, paddingVertical: 0},
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
  // 내 순위 카드 — 코너 페이드 헤어라인(GlassEdge glints=false, 2026-07-10 통일 스윕).
  // 불투명 HERO_BG 판 → 반투명 히어로 유리(GLASS.fillActive) — 재질 일치(검수 잔여, 2026-07-17).
  myCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS.fillActive,
    borderRadius: RADIUS.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
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
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingHorizontal: SPACE.lg,
    paddingVertical: rv(12),
  },
  hintTxt: {flex: 1, fontFamily: FONT, color: T2, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  // 리더보드 행 — 일반=코너 페이드 헤어라인, 내 행=액센트 보더(렌더에서 주입).
  // 유행 카드 — 랭킹 행과 같은 표면이되 순위 숫자를 눌러 두어 목록과 구분한다.
  trendCard: {
    backgroundColor: GLASS.fill, borderRadius: RADIUS.md, borderCurve: 'continuous',
    paddingHorizontal: rs(14), paddingVertical: rv(12), gap: rv(2),
    borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, overflow: 'hidden',
  },
  trendHead: {flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between', marginBottom: rv(6)},
  trendTitle: {fontFamily: FONT, ...TYPE.label, fontWeight: '700', color: T1},
  trendMeta: {fontFamily: FONT, ...TYPE.micro, color: T3},
  trendRow: {flexDirection: 'row', alignItems: 'center', gap: rs(10), paddingVertical: rv(7)},
  trendRank: {fontFamily: NUM, ...TYPE.body, color: T3, width: rs(16)},
  trendBrand: {fontFamily: FONT, ...TYPE.micro, color: T3},
  trendModel: {fontFamily: FONT, ...TYPE.body, fontWeight: '600', color: T1, marginTop: rv(1)},
  trendCount: {fontFamily: NUM, ...TYPE.body, color: T1},
  trendKm: {fontFamily: FONT, ...TYPE.micro, color: T3, marginTop: rv(2)},

  // 열리는 행은 눌린 티가 나야 한다 — 안 그러면 눌러도 반응이 없는 것처럼 느껴진다.
  rowPressed: {opacity: MOTION.press.opacity},
  rowChev: {marginLeft: rs(2)},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rv(10),
    backgroundColor: GLASS.fill,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
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
  // 신는 러닝화 — 이름 아래 한 줄. 무채(T3)로 눌러 순위·점수보다 뒤에 읽히게 한다.
  rowShoes: {fontFamily: FONT, color: T3, fontSize: TYPE.label.fontSize, marginTop: 2},
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
  // 누름 표준(MOTION.press).
  pressed: {opacity: MOTION.press.opacity, transform: [{scale: MOTION.press.scale}]},
  // 상태(빈/로딩) — EmptyGhostHeader + 고스트 행 문법으로 전환, 구 중앙 empty 스타일 삭제.
  center: {paddingVertical: rv(48), alignItems: 'center'},
});
