// ============================================================================
// HallOfShoes.rn.tsx — 명예의 전당(은퇴한 신발 박물관) (Slice B · UI)
// ----------------------------------------------------------------------------
// 은퇴한 신발들이 영원히 전시되는 개인 박물관. progression_v1.retiredShoes 에 영속된
// RetiredShoeRecord 를 그대로 그린다(절대 사라지지 않음 — 리로드/재설치에도 보존). 각
// 항목은 신발명 · 누적 거리(km) · 은퇴 연도 · Smart Retirement Grade 를 명패처럼 보여준다.
//
// 톤은 슬프지 않고 자랑스럽게(트로피 룸 / 전당) — 각 신발이 남긴 거리를 기린다. 데이터를
// 만들지 않는다(날조 금지): 레코드가 0개면 격려하는 빈 상태를, 있으면 최근 은퇴 순으로
// 전시한다. 토큰·primitives 만(raw hex 0), 한국어.
// ============================================================================
import React, {useMemo} from 'react';
import {View, Text, ScrollView, Pressable, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG,
  CARD_DIM,
  CARD_HI,
  ACCENT,
  T1,
  T3,
  SEP,
  FONT,
  DISPLAY,
  SPACE,
  RADIUS,
  withAlpha,
} from './theme';
import {Unit, displayNum} from './lib/units';
import {retirementGradeBadge} from './lib/progression/retirementCard';
import type {RetiredShoeRecord} from './lib/progression/types';

export interface HallOfShoesProps {
  /** 영속된 은퇴 신발 레코드(progression_v1.retiredShoes). */
  records?: readonly RetiredShoeRecord[];
  /** 표시 단위(km|mi). 기본 km. */
  unit?: Unit;
  /** 뒤로(전체화면 진입 시). 없으면 뒤로 버튼 미표시. */
  onBack?: () => void;
  /** 한 신발 명패를 누르면(카드 다시 보기 등). 선택. */
  onOpenRecord?: (record: RetiredShoeRecord) => void;
}

/** 은퇴 연도 라벨 — retireYear 우선, 없으면 retiredAt(ISO) 앞 4자. 둘 다 없으면 ''. */
function yearOf(r: RetiredShoeRecord): string {
  if (Number.isFinite(r.retireYear) && r.retireYear > 0) return String(r.retireYear);
  const iso = typeof r.retiredAt === 'string' ? r.retiredAt.slice(0, 4) : '';
  return /^\d{4}$/.test(iso) ? iso : '';
}

function HallOfShoes({records = [], unit = 'km', onBack, onOpenRecord}: HallOfShoesProps) {
  const insets = useSafeAreaInsets();

  // 유효 레코드만(shoeId 필수) · 최근 은퇴 순. retiredAt 비면 연도/이름으로 안정 정렬.
  const list = useMemo(() => {
    const valid = (Array.isArray(records) ? records : []).filter(
      r => r && typeof r.shoeId === 'string' && r.shoeId,
    );
    return [...valid].sort((a, b) => {
      const ax = typeof a.retiredAt === 'string' ? a.retiredAt : '';
      const bx = typeof b.retiredAt === 'string' ? b.retiredAt : '';
      if (ax !== bx) return ax > bx ? -1 : 1; // 최근(큰 ISO) 먼저
      return (b.retireYear || 0) - (a.retireYear || 0);
    });
  }, [records]);

  const totalKm = useMemo(
    () => list.reduce((acc, r) => acc + (Number.isFinite(r.km) && r.km > 0 ? r.km : 0), 0),
    [list],
  );

  return (
    <View style={[s.screen, {paddingTop: insets.top}]}>
      <View style={s.nav}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="뒤로"
            testID="hall-back"
            style={s.iconBtn}>
            <Ionicons name="chevron-back" size={20} color={T1} />
          </Pressable>
        ) : (
          <View style={s.iconBtn} />
        )}
        <Text style={s.navTitle}>명예의 전당</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {/* 히어로 — 트로피 룸 헤더 + 전당 통계(은퇴 켤레 · 누적 거리) */}
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Ionicons name="trophy" size={26} color={ACCENT} />
          </View>
          <Text style={s.heroTitle}>Hall of Shoes</Text>
          <Text style={s.heroSub}>
            함께 달려준 신발들이 남긴 거리를 영원히 기록해요.
          </Text>
          {list.length > 0 && (
            <View style={s.heroStats}>
              <View style={s.heroStat}>
                <Text style={s.heroStatValue}>{list.length}</Text>
                <Text style={s.heroStatLabel}>은퇴 켤레</Text>
              </View>
              <View style={s.heroDivider} />
              <View style={s.heroStat}>
                <Text style={s.heroStatValue}>
                  {displayNum(totalKm, unit, 0)}
                  <Text style={s.heroStatUnit}>{unit}</Text>
                </Text>
                <Text style={s.heroStatLabel}>누적 거리</Text>
              </View>
            </View>
          )}
        </View>

        {list.length === 0 ? (
          <View style={[s.card, s.empty]} testID="hall-empty">
            <Ionicons name="ribbon-outline" size={30} color={T3} />
            <Text style={s.emptyTitle}>아직 은퇴한 신발이 없어요</Text>
            <Text style={s.emptyText}>
              수명을 다한 신발을 은퇴시키면, 그 신발의 여정이 이곳에 영원히
              전시돼요.
            </Text>
          </View>
        ) : (
          <View style={s.plaques}>
            {list.map(r => (
              <Plaque
                key={r.shoeId}
                record={r}
                unit={unit}
                onPress={onOpenRecord ? () => onOpenRecord(r) : undefined}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── 명패(은퇴 신발 한 칸) ──────────────────────────────────────────────────────
function Plaque({
  record,
  unit,
  onPress,
}: {
  record: RetiredShoeRecord;
  unit: Unit;
  onPress?: () => void;
}) {
  const badge = retirementGradeBadge(record.grade);
  const year = yearOf(record);
  const km = Number.isFinite(record.km) && record.km > 0 ? record.km : 0;
  const name = (typeof record.name === 'string' && record.name.trim()) || '내 러닝화';

  const Inner = (
    <>
      <View style={s.plaqueLeft}>
        <View
          style={[
            s.gradeDot,
            {backgroundColor: withAlpha(badge.color, 0.18), borderColor: badge.color},
          ]}>
          <Text style={s.gradeEmoji}>{badge.emoji}</Text>
        </View>
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={s.plaqueName} numberOfLines={1}>
            {name}
          </Text>
          <View style={s.plaqueMetaRow}>
            <Text style={[s.plaqueGrade, {color: badge.color}]}>{badge.name}</Text>
            {!!year && <Text style={s.plaqueYear}>· Class of {year}</Text>}
          </View>
        </View>
      </View>
      <View style={s.plaqueRight}>
        <Text style={s.plaqueKm}>
          {displayNum(km, unit, 0)}
          <Text style={s.plaqueKmU}>{unit}</Text>
        </Text>
        <Text style={s.plaqueKmLabel}>함께 달린 거리</Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name} 은퇴 기록`}
        testID={`hall-plaque-${record.shoeId}`}
        style={({pressed}) => [s.card, s.plaque, pressed && {backgroundColor: CARD_HI}]}>
        {Inner}
      </Pressable>
    );
  }
  return (
    <View testID={`hall-plaque-${record.shoeId}`} style={[s.card, s.plaque]}>
      {Inner}
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  nav: {
    paddingTop: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navTitle: {color: T1, fontFamily: FONT, fontSize: 17, fontWeight: '700'},
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {padding: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg},

  hero: {alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.md},
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.pill,
    backgroundColor: withAlpha(ACCENT, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: T1,
    fontFamily: DISPLAY,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroSub: {
    color: T3,
    fontFamily: FONT,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: SPACE.lg,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xl,
    marginTop: SPACE.md,
  },
  heroStat: {alignItems: 'center'},
  heroStatValue: {color: T1, fontFamily: DISPLAY, fontSize: 26, fontWeight: '800'},
  heroStatUnit: {color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600'},
  heroStatLabel: {color: T3, fontFamily: FONT, fontSize: 12, marginTop: 3},
  heroDivider: {width: StyleSheet.hairlineWidth, height: 34, backgroundColor: SEP},

  card: {
    backgroundColor: CARD_DIM,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(T1, 0.07),
  },
  empty: {alignItems: 'center', gap: SPACE.sm, padding: SPACE.xxl},
  emptyTitle: {color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '700'},
  emptyText: {
    color: T3,
    fontFamily: FONT,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  plaques: {gap: SPACE.md},
  plaque: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  plaqueLeft: {flexDirection: 'row', alignItems: 'center', gap: SPACE.md, flex: 1, minWidth: 0},
  gradeDot: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeEmoji: {fontSize: 20},
  plaqueName: {color: T1, fontFamily: DISPLAY, fontSize: 17, fontWeight: '800', letterSpacing: -0.3},
  plaqueMetaRow: {flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap'},
  plaqueGrade: {fontFamily: FONT, fontSize: 12.5, fontWeight: '700'},
  plaqueYear: {color: T3, fontFamily: FONT, fontSize: 12.5, fontWeight: '500'},
  plaqueRight: {alignItems: 'flex-end', flexShrink: 0},
  plaqueKm: {color: T1, fontFamily: DISPLAY, fontSize: 22, fontWeight: '800', letterSpacing: 0.2},
  plaqueKmU: {color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600'},
  plaqueKmLabel: {color: T3, fontFamily: FONT, fontSize: 11, marginTop: 2},
});

export default HallOfShoes;
