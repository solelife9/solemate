// ============================================================================
// SocialProfileCard.tsx — 공개 프로필 카드 (소셜 공용)
// ----------------------------------------------------------------------------
// 한 번 만들어 네 곳에 쓴다: 공개 동의 화면 · 내 프로필 · 남의 프로필 · (나중에) 랭킹 상세.
// **표시 전용**이다 — 데이터는 lib/publicProfile 이 만든 PublicProfile 을 그대로 받는다.
//
// 구성(위→아래): 정체성 → 실력 → 장비 → (선택) 안심 문구.
//   · 누적 거리 하나만 크게 — 시선의 종착점을 하나로.
//   · 거리 PB 4칸 — 못 뛴 거리는 '—' 로 담백하게(가짜 값을 만들지 않는다).
//   · 신발은 **수명 링을 각 줄에 인라인**으로. 링을 위에 따로 두면 같은 신발을 두 번
//     그리게 돼 지저분해진다(2026-08-01 목업 검토에서 고친 부분).
//
// 링 색은 러닝 링과 같은 Keego Ember 그라데이션(theme.RUN_RING_STOPS) — 신발 수명은
// DESIGN.md §1 이 허용한 '진행 지표'다. 그 외 강조는 전부 무채.
// ============================================================================
import React from 'react';
import {View, StyleSheet} from 'react-native';
import Svg, {Circle, Defs, LinearGradient, Stop} from 'react-native-svg';
import {Text} from './lib/text';
import {rf, rs, rv} from './lib/responsive';
import {
  T1, T2, T3, FONT, RADIUS, GLASS, SEP, TYPE, NUM,
  RING_ACCENT_HI, RING_ACCENT, RING_ACCENT_LO, withAlpha,
} from './theme';
import type {PublicProfile} from './lib/publicProfile';

/** 초 → 'M:SS' 또는 'H:MM:SS'. 0 이하면 null(표시하지 않는다). */
function fmtDuration(sec: number): string | null {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

/** 초/km → "5'12"". 0 이하면 null. */
function fmtPace(sec: number): string | null {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`;
}

/** 천단위 구분. */
const comma = (n: number) => Math.round(n).toLocaleString('en-US');

/** 신발 수명 링(작게, 줄 앞에). 사용률이 100%를 넘어도 한 바퀴에서 멈춘다. */
function WearRing({pct, size = rs(26)}: {pct: number; size?: number}) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, (Number.isFinite(pct) ? pct : 0) / 100));
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="wear" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={RING_ACCENT_HI} />
          <Stop offset="0.5" stopColor={RING_ACCENT} />
          <Stop offset="1" stopColor={RING_ACCENT_LO} />
        </LinearGradient>
      </Defs>
      <Circle cx="20" cy="20" r={r} fill="none" stroke={withAlpha(T1, 0.1)} strokeWidth={4} />
      <Circle
        cx="20" cy="20" r={r} fill="none" stroke="url(#wear)" strokeWidth={4}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)}
        transform="rotate(-90 20 20)"
      />
    </Svg>
  );
}

export default function SocialProfileCard({
  profile,
  footnote,
  testID,
}: {
  profile: PublicProfile;
  /** 아래 안심 문구(동의 화면에서만 쓴다). 없으면 그 줄이 통째로 빠진다. */
  footnote?: string;
  testID?: string;
}) {
  const {stats, spec, activeShoes} = profile;
  const pace = fmtPace(spec?.paceSec ?? 0);
  const hasSpecRow = (spec?.vo2max ?? 0) > 0 || !!pace || (spec?.longestKm ?? 0) > 0;

  return (
    <View style={s.card} testID={testID ?? 'social-profile-card'}>
      {/* 정체성 */}
      <View style={s.head}>
        <Text style={s.name} numberOfLines={1}>{profile.nickname}</Text>
        <View style={s.bigRow}>
          <Text style={s.big}>{comma(stats.totalKm)}</Text>
          <Text style={s.bigUnit}>km</Text>
        </View>
        <Text style={s.meta}>
          {stats.runCount}런{stats.monthKm > 0 ? ` · 이번 달 ${stats.monthKm}km` : ''}
        </Text>
      </View>

      {/* 실력 — 거리 PB */}
      <View style={s.pbGrid}>
        {(spec?.pb ?? []).map(p => {
          const v = fmtDuration(p.sec);
          return (
            <View key={p.key} style={[s.pb, !v && s.pbOff]}>
              <Text style={s.pbLabel}>{p.label}</Text>
              <Text style={[s.pbValue, !v && s.pbValueOff]}>{v ?? '—'}</Text>
            </View>
          );
        })}
      </View>

      {hasSpecRow ? (
        <View style={s.specRow}>
          {(spec.vo2max ?? 0) > 0 ? (
            <><Text style={s.specLabel}>VO2MAX</Text><Text style={s.specValue}>{spec.vo2max}</Text></>
          ) : null}
          {(spec.vo2max ?? 0) > 0 && pace ? <View style={s.dot} /> : null}
          {pace ? (<><Text style={s.specLabel}>평균</Text><Text style={s.specValue}>{pace}</Text></>) : null}
          {pace && (spec.longestKm ?? 0) > 0 ? <View style={s.dot} /> : null}
          {(spec.longestKm ?? 0) > 0 ? (
            <><Text style={s.specLabel}>최장</Text><Text style={s.specValue}>{spec.longestKm}km</Text></>
          ) : null}
        </View>
      ) : null}

      {/* 장비 — 신는 러닝화(수명 링 인라인) */}
      {activeShoes.length > 0 ? (
        <>
          <Text style={s.sectionHead}>신는 러닝화</Text>
          <View style={s.shoeList}>
            {activeShoes.map((sh, i) => {
              const pct = sh.maxKm > 0 ? (sh.usedKm / sh.maxKm) * 100 : 0;
              return (
                <View key={`${sh.name}-${i}`} style={s.shoeRow}>
                  <WearRing pct={pct} />
                  <View style={s.shoeText}>
                    {sh.brand ? <Text style={s.shoeBrand} numberOfLines={1}>{sh.brand}</Text> : null}
                    <Text style={s.shoeModel} numberOfLines={1}>{sh.model || sh.name}</Text>
                  </View>
                  <Text style={s.shoeKm}>
                    {comma(sh.usedKm)}
                    {sh.maxKm > 0 ? <Text style={s.shoeKmMax}>{` / ${comma(sh.maxKm)}`}</Text> : null}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {footnote ? (
        <View style={s.foot}>
          <Text style={s.footText}>{footnote}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: GLASS.fillActive,
    borderRadius: RADIUS.xl,
    borderCurve: 'continuous',
    paddingHorizontal: rs(14),
    paddingVertical: rv(15),
    overflow: 'hidden',
  },
  head: {alignItems: 'center', paddingBottom: rv(13)},
  name: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '800', letterSpacing: -0.3},
  bigRow: {flexDirection: 'row', alignItems: 'baseline', gap: rs(3), marginTop: rv(4)},
  // 초대형 숫자 전용 서체(NUM) — DESIGN.md 의 유일한 예외.
  big: {color: T1, fontFamily: NUM, fontSize: rf(34), fontWeight: '500', letterSpacing: -1.2},
  bigUnit: {color: T3, fontFamily: FONT, fontSize: rf(12), fontWeight: '600'},
  meta: {color: T3, fontFamily: FONT, fontSize: rf(11), marginTop: rv(5), fontVariant: ['tabular-nums']},

  pbGrid: {flexDirection: 'row', gap: rs(5)},
  pb: {flex: 1, backgroundColor: withAlpha(T1, 0.055), borderRadius: RADIUS.sm, borderCurve: 'continuous',
       paddingVertical: rv(7), alignItems: 'center'},
  pbOff: {opacity: 0.4},
  pbLabel: {color: T3, fontFamily: FONT, fontSize: rf(9), fontWeight: '700', letterSpacing: 0.5},
  pbValue: {color: T1, fontFamily: FONT, fontSize: rf(12), fontWeight: '700', marginTop: rv(3),
            letterSpacing: -0.3, fontVariant: ['tabular-nums']},
  pbValueOff: {color: T3, fontWeight: '600'},

  specRow: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
            flexWrap: 'wrap', gap: rs(5), marginTop: rv(9)},
  specLabel: {color: T3, fontFamily: FONT, fontSize: rf(9), fontWeight: '700', letterSpacing: 0.5},
  specValue: {color: T2, fontFamily: FONT, fontSize: rf(11.5), fontWeight: '700',
              letterSpacing: -0.2, fontVariant: ['tabular-nums']},
  dot: {width: rs(3), height: rs(3), borderRadius: rs(2), backgroundColor: withAlpha(T1, 0.22),
        alignSelf: 'center', marginHorizontal: rs(3)},

  sectionHead: {color: T3, fontFamily: FONT, fontSize: rf(9.5), fontWeight: '700', letterSpacing: 1,
                marginTop: rv(14), marginBottom: rv(7), paddingTop: rv(12),
                borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  shoeList: {gap: rv(8)},
  shoeRow: {flexDirection: 'row', alignItems: 'center', gap: rs(9)},
  shoeText: {flex: 1, minWidth: 0},
  shoeBrand: {color: T3, fontFamily: FONT, fontSize: rf(9), fontWeight: '700', letterSpacing: 0.5},
  shoeModel: {color: T2, fontFamily: FONT, fontSize: rf(12), fontWeight: '600', letterSpacing: -0.2},
  shoeKm: {color: T1, fontFamily: FONT, fontSize: rf(12), fontWeight: '700',
           letterSpacing: -0.3, fontVariant: ['tabular-nums']},
  shoeKmMax: {color: T3, fontSize: rf(9.5), fontWeight: '600'},

  foot: {flexDirection: 'row', marginTop: rv(14), paddingTop: rv(11),
         borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  footText: {flex: 1, color: T3, fontFamily: FONT, fontSize: rf(10.5), lineHeight: rf(14)},
});
