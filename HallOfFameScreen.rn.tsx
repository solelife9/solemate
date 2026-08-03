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
// 내 최고 순위(전성기) — 이미 읽은 내 순위를 지나가며 적어 둔다(읽기 0).
import AsyncStorage from '@react-native-async-storage/async-storage';
import {recordRank, sanitizeRankBests, formatYearMonthKo,
  RANK_HISTORY_KEY, type RankBests} from './lib/rankHistory';
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
  TIER_LABEL,
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

// ── 랭킹 축은 '러닝 기록에서 파생된 것'만 둔다 (2026-08-03) ────────────────────
// 뺀 둘과 그 이유:
//  · shoeHealth(평균 잔여 수명%) — **안 신을수록 1등**이었다. 새 신발만 사서 모셔두면
//    100점이고, 수명을 끝까지 쓴 은퇴 신발이 평균에 섞여 성실히 쓴 사람일수록 점수가
//    내려갔다. MISSION('부상 없이, 계속 달리도록')과 인센티브가 정반대다.
//  · collection(등록 신발 수) — **검증이 불가능하다.** 이름만 열 번 입력하면 1위가
//    되는데 앱은 그게 진짜인지 판별할 수 없다. Truth-only 위반이라 튜닝으로 못 고친다.
// 남긴 셋은 전부 런 레코드에서 파생된다(위조하려면 러닝 자체를 만들어야 한다).
//
// ⚠️ 점수 발행은 그대로 둔다 — firestore.rules 의 validRankingEntry 가 shoeHealth·
// collection 필드를 요구하므로 빼면 쓰기가 거부된다. 화면에서만 내린다. 축을 다시
// 설계해 열 때(모델별 랭킹·은퇴 켤레 등) 규칙 변경 없이 되살릴 수 있다.
type Category =
  | 'distance'
  | 'consistency'
  | 'progressPoints';

// 카테고리 메타(라벨/아이콘/점수 표기). 고정 순서로 칩을 노출(결정적 레이아웃).
// 로테이션은 제거(정상 행동 페널티화 회피).
const CATEGORIES: ReadonlyArray<{key: Category; label: string; icon: string}> = [
  {key: 'distance', label: '거리', icon: 'walk'},
  {key: 'consistency', label: '꾸준함', icon: 'flame'},
  {key: 'progressPoints', label: '진척 포인트', icon: 'sparkles'},
];

/**
 * 티어를 **글자로** 보여주는 등수 상한 (2026-08-04).
 *
 * 기준을 티어 등급(마스터·레전드)으로 잡으면 **초반 몇 달은 배지가 하나도 안 뜬다** —
 * 레전드 5,000 XP·마스터 3,000 XP 인데 총 최대가 ≈6,310 이라 거기 닿는 데 오래 걸린다.
 * 만들어 놓고 보이지 않는 기능이 되므로 **등수**로 게이트한다: 첫날부터 동작하고,
 * 목록이 길어지면 아래쪽은 저절로 조용해진다.
 *
 * 값이 100인 이유: 리더보드가 애초에 상위 100명만 읽는다
 * (lib/progression/firestoreRanking.ts `topByCategory(..., 100)`). 즉 지금은 **보이는
 * 모든 행**에 글자가 붙고, 나중에 더 많이 읽게 되면 100위까지만 붙는다.
 */
const TIER_BADGE_MAX_RANK = 100;

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

/** 카테고리별 점수 표기(거리 km / 꾸준함 일 / 진척 포인트 P). */
function formatScore(category: Category, score: number): string {
  const n = Number.isFinite(score) ? score : 0;
  switch (category) {
    case 'distance':
      return `${Math.round(n).toLocaleString()} km`;
    case 'progressPoints':
      return `${Math.round(n).toLocaleString()} P`;
    case 'consistency':
      return `${Math.round(n)} 일`;
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
      <View style={s.rowFill}>
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
  /** 카테고리별 최고 순위. 로컬에만 둔다 — 지난달 리더보드를 다시 읽지 않기 위해서다. */
  const [bests, setBests] = useState<RankBests>({});

  // 최고 순위는 한 번만 읽는다(로컬 저장소). 실패해도 화면은 그대로 — 없으면 안 보일 뿐.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(RANK_HISTORY_KEY)
      .then(raw => {
        if (!alive || !raw) return;
        try { setBests(sanitizeRankBests(JSON.parse(raw))); } catch { /* 손상은 무시 */ }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

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
          // 이번 달 순위를 전성기 기록에 반영한다. 더 좋을 때만 바뀌므로 보통 no-op 다.
          if (mine.me) {
            setBests(prev => {
              const next = recordRank(prev, category, yearMonth, mine.me!.rank);
              // 동일성으로 저장 여부를 판단한다 — 안 바뀌었으면 쓰지 않는다.
              if (next !== prev) {
                AsyncStorage.setItem(RANK_HISTORY_KEY, JSON.stringify(next)).catch(() => {});
              }
              return next;
            });
          }
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
    // 배지를 다는 기준은 **티어 등급이 아니라 등수**다(2026-08-04 민우님 결정).
    //
    // 처음엔 마스터·레전드에만 달았는데(목업 D), 그러면 **초반 몇 달은 배지가 아예 안 뜬다** —
    // 레전드 5,000 XP·마스터 3,000 XP 인데 총 최대가 ≈6,310 이라 사용자가 거기 닿는 데
    // 오래 걸린다. 만들어 놓고 보이지 않는 기능이 된다.
    // 등수로 게이트하면 첫날부터 동작하고, 목록이 길어져도 아래쪽은 조용해진다.
    const showTierBadge = e.rank <= TIER_BADGE_MAX_RANK;
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
        {/* 상위 티어가 아니면 지금까지처럼 점만. 배지는 아래 이름 옆에 붙는다. */}
        {!showTierBadge && <View style={[s.tierDot, {backgroundColor: tColor}]} />}
        <View style={s.rowFill}>
          {/* 이름 + 티어 배지 (2026-08-03 목업 D 채택).
              전에는 지름 8px 색 점이 티어의 전부라, 다이아(#3B82F6)와 마스터(#9333EA)를
              색만으로 구별할 수 없었다(색각 이상 사용자에겐 정보가 아예 사라진다 — DESIGN §6.7).
              그렇다고 모든 행에 영어 라벨을 달면 목록이 시끄럽다.
              그래서 **마스터·레전드에만** 글자를 준다 — 물음이 "누가 레전드를 찍었나"였고,
              레전드가 5,000 XP(총 최대 ≈6,310)라 실제로 드물어 희소성이 유지된다.
              골드와 플래티넘을 가려 읽을 이유는 없으므로 그 구간은 점 그대로 둔다.
              시각 문법은 기존 titlePill 과 같은 계열(틴트 배경 + 티어색 글자)이되,
              **대문자 micro** 로 구분한다 — 한 행에 둘 다 있어도 서로 다른 물건으로 읽힌다.
              문구는 theme.TIER_LABEL 단일 출처(마이·진척 화면과 같은 어휘). */}
          <View style={s.nameRow}>
            <Text style={s.rowName} numberOfLines={1}>
              {shown}
              {highlight ? <Text style={{color: ACCENT}}>{'  (나)'}</Text> : null}
            </Text>
            {showTierBadge ? (
              <View
                testID={`hof-tier-${e.uid}`}
                style={[
                  s.tierBadge,
                  {
                    backgroundColor: withAlpha(tColor, 0.14),
                    borderColor: withAlpha(tColor, 0.4),
                  },
                ]}>
                <Text style={[s.tierBadgeTxt, {color: tColor}]}>
                  {TIER_LABEL[e.rankTier].toUpperCase()}
                </Text>
              </View>
            ) : null}
          </View>
          {tName ? (
            // 타이틀 칩은 원래 티어색을 썼는데, 티어 배지가 생기면서 **레전드 행에서 두 칩이
            // 같은 오렌지**가 됐다(둘 다 tColor). 색이 겹치면 둘 다 안 읽힌다.
            // 그래서 위계를 나눈다 — **티어=색, 타이틀=무채.** 티어는 드물고(마스터·레전드만)
            // 랭킹의 주제라 색을 갖고, 타이틀은 부가 정보라 물러난다.
            <View style={s.titlePill}>
              <Text style={s.titlePillTxt} numberOfLines={1}>
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
        {/* 축마다 집계 범위가 다르다 — 라벨이 그걸 말해줘야 한다(2026-08-03).
            · 거리·꾸준함 = 이번 달 런만 센다(월간 리셋 — 매달 시작선이 같다).
            · 진척 포인트 = **평생 누적 XP**다(App.tsx 가 view.rank.xp 를 싣는다).
              티어가 XP 에서 파생되므로(rank.tierForXp, 레전드 5,000) 이 축의 순위는
              곧 '누가 레전드를 찍었나'다 — 월간 경쟁이 아니라 명예의 전당 성격이라
              그대로 둔다. 다만 "이번 달 랭킹"이라 적으면 거짓이 된다.
            엔트리는 leaderboards/{ym} 에 월별로 쌓이므로, 누적 축이라도 목록에 오르는 건
            **그 달에 동기한 사람**뿐이다. 결함이 아니라 성질이다 — 유령 1위가 영구히
            박혀 있는 대신 '현역 중 누가 최고인가'가 보인다. 라벨에 그걸 밝힌다. */}
        <Text style={s.monthLabel}>
          {category === 'progressPoints'
            ? `전체 기간 누적 · ${yearMonth}에 달린 러너 중`
            : `${yearMonth} · 이번 달 랭킹`}
        </Text>

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
            <View style={s.rowEnd}>
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

        {/* 최고 순위(전성기) — 랭킹은 한 달짜리라 잘 달린 달이 다음 달이면 사라진다.
            트로피 카드로 세우지 않고 내 순위 밑 **한 줄**로 둔다: 자랑이 아니라 맥락이다.
            지금이 최고면 그렇다고 말한다 — 그 순간을 알려주는 게 이 줄의 값이다. */}
        {myAvailable && myEntry && bests[category] ? (
          <Text style={s.bestLine} testID="hof-best-rank">
            {bests[category].rank >= myEntry.rank
              ? '지금이 내 최고 순위예요'
              : `내 최고 ${bests[category].rank}위 · ${formatYearMonthKo(bests[category].yearMonth)}`}
          </Text>
        ) : null}

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
            {/* 2026-08-03 카피 정정 — 두 군데가 사실과 달랐다.
                · "친구들과" — 팔로우/친구 기능이 앱에 없다(RunnerProfileScreen 주석 참조).
                · "신발 관리" — 검증 불가·인센티브 역전으로 축에서 뺐다(위 CATEGORIES 주석).
                제목도 바꿨다: 발행이 켜진 지금 "곧 열려요"는 거짓이고(랭킹은 이미 열려
                있다) 'coming soon' 문구는 심사에서도 걸린다(App Store 4.2).
                비어 있는 진짜 이유는 **이번 달 기록이 아직 없어서**다. */}
            <EmptyGhostHeader
              title={loadFailed ? '지금은 오프라인이에요' : '이번 달 순위는 아직 비어 있어요'}
              sub={loadFailed
                ? <>랭킹은 연결되면 다시 불러올게요.{'\n'}러닝 기록은 폰에 그대로 — 달리는 데는 지장 없어요.</>
                : <>거리·꾸준함·진척 포인트로 겨뤄요.{'\n'}이번 달 러닝을 기록하면 여기에 등장합니다.</>}
            />
            <View style={{gap: rv(8)}}>
              {GHOST_ROW_OPACITY.map((o, i) => (
                <GhostRankRow key={i} opacity={o} alt={i % 2 === 1} />
              ))}
            </View>
          </View>
        )}
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
                <View style={s.rowFill}>
                  <Text style={s.trendBrand} numberOfLines={1}>{t.brand.toUpperCase()}</Text>
                  <Text style={s.trendModel} numberOfLines={1}>{t.model || t.brand}</Text>
                </View>
                <View style={s.rowEnd}>
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
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  // 행 안에서 이름·모델이 남는 폭을 다 쓰되 **줄이 밀려나지 않게** 한다.
  // minWidth:0 이 없으면 flex 자식의 기본 min-content 폭 때문에 numberOfLines 가
  // 걸리기 전에 오른쪽 값이 밀린다. 목록 행 3곳이 같은 구조라 한 토큰으로 모은다.
  rowFill: {flex: 1, minWidth: 0},
  // 행 오른쪽 값 묶음(점수·인원) — 우측 정렬.
  rowEnd: {alignItems: 'flex-end'},
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
  // 최고 순위 한 줄 — 카드 밖, 목록 앞. 조용해야 한다(자랑이 아니라 맥락).
  bestLine: {
    fontFamily: FONT, ...TYPE.caption, color: T3,
    textAlign: 'center', marginTop: rv(-6),
  },

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
  // 이름 + 티어 배지 한 줄. 이름이 길면 **이름이 먼저 줄어든다**(flexShrink) — 배지는
  // 짧고 고정폭이라 밀려나면 안 된다.
  nameRow: {flexDirection: 'row', alignItems: 'center', gap: rs(7), minWidth: 0},
  rowName: {fontFamily: FONT, color: T1, fontSize: TYPE.body.fontSize, fontWeight: '700', flexShrink: 1},
  // 티어 배지(마스터·레전드 전용). titlePill 과 같은 틴트 문법이되 대문자 micro 로
  // 구분한다 — 한 행에 둘 다 있어도 서로 다른 물건으로 읽힌다.
  tierBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.pill,
    paddingHorizontal: rs(7),
    paddingVertical: rv(1),
    flexShrink: 0,
  },
  tierBadgeTxt: {fontFamily: FONT, ...TYPE.micro},
  // 신는 러닝화 — 이름 아래 한 줄. 무채(T3)로 눌러 순위·점수보다 뒤에 읽히게 한다.
  rowShoes: {fontFamily: FONT, color: T3, fontSize: TYPE.label.fontSize, marginTop: 2},
  // 타이틀 칩은 **무채**다(2026-08-04). 원래 티어색을 썼는데 티어 배지가 생기면서
  // 두 칩이 같은 색이 됐고, 색이 겹치면 둘 다 안 읽힌다. 위계를 나눈다 —
  // **티어=색, 타이틀=무채.** 티어는 랭킹의 주제라 색을 갖고, 타이틀은 부가라 물러난다.
  titlePill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(T1, 0.14),
    backgroundColor: withAlpha(T1, 0.06),
    borderRadius: RADIUS.pill,
    paddingHorizontal: rs(8),
    paddingVertical: rv(2),
    marginTop: rv(4),
    maxWidth: '100%',
  },
  titlePillTxt: {fontFamily: FONT, color: T2, fontSize: TYPE.caption.fontSize, fontWeight: '700', flexShrink: 1},
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
