// ============================================================================
// MedalArchiveScreen.rn.tsx — 마라톤 메달 아카이브 (마이 탭 → 명예의 전당 옆)
// 완주한 대회의 메달·기록 컬렉션. 원형 가이드로 촬영해 '균일한 원반'으로 정렬돼 진열장처럼
// 깔끔하다(신발 명예의 전당과 짝, HALL_GOLD 무드). 목록은 App 이 lib/medals 에서 주입한다.
// 원반 탭 → 상세(큰 원형 메달 + 기록증 + 공식 기록 + 그 러닝 링크 + BIB). 색은 theme 토큰만.
// ============================================================================
import React, {useEffect, useRef, useState} from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {View, ScrollView, Pressable, Image, StyleSheet, Animated} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BG, CARD, CARD_HI, ACCENT, HALL_GOLD, T1, T2, T3, T4, SEP, FONT, DISPLAY, withAlpha, TYPE, HERO, GLASS, RADIUS, GUTTER, MOTION} from './theme';
import {SwipeBack, EmptyGhostHeader, GhostStrong, GhostBar, GlassEdge} from './primitives';
import {fmtTime} from './lib/format';
import {RACE_DISTANCE_LABEL} from './data/raceEvents';
import {medalTimeSec, medalArchiveStats, type Medal} from './lib/medals';
import MedalShareCard, {type MedalShareModel} from './MedalShareCard';
import {shareMedalCard, type SvgCapturable} from './lib/shareCard';

function MedalDisc({photoUri, size = 84}: {photoUri?: string; size?: number}) {
  return (
    <View style={[m.disc, {width: size, height: size, borderRadius: size / 2}]}>
      {photoUri ? (
        <Image source={{uri: photoUri}} style={{width: '100%', height: '100%'}} resizeMode="cover" />
      ) : (
        <Ionicons name="medal" size={size * 0.42} color={HALL_GOLD} />
      )}
    </View>
  );
}

export default function MedalArchiveScreen({
  medals = [],
  onBack,
  onAddMedal,
  onOpenRun,
  onDelete,
}: {
  medals?: Medal[];
  onBack?: () => void;
  /** 직접 메달 추가(과거 대회 포함) — 대회 기록 흐름을 연다. 없으면 버튼 미표시. */
  onAddMedal?: () => void;
  /** 연결된 러닝으로 이동(있으면 상세에서 '러닝 기록 보기'). */
  onOpenRun?: (runId: string) => void;
  onDelete?: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [selId, setSelId] = useState<string | null>(null);
  const sel = medals.find((x) => x.id === selId) || null;
  const stats = medalArchiveStats(medals);

  return (
    <SwipeBack onBack={onBack}>
      <View style={[m.screen, {paddingTop: insets.top}]} testID="medal-archive-screen">
        <View style={m.nav}>
          <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="뒤로" style={m.iconBtn}>
            <Ionicons name="chevron-back" size={ri(20)} color={T1} />
          </Pressable>
          <Text style={m.navTitle}>메달 아카이브</Text>
          {onAddMedal ? (
            <Pressable onPress={onAddMedal} hitSlop={8} accessibilityRole="button" accessibilityLabel="메달 추가" testID="medal-add" style={m.iconBtn}>
              <Ionicons name="add" size={ri(24)} color={ACCENT} />
            </Pressable>
          ) : <View style={{width: rs(36)}} />}
        </View>

        <ScrollView
          contentContainerStyle={{paddingHorizontal: GUTTER, paddingTop: rv(18), paddingBottom: insets.bottom + 28}}
          showsVerticalScrollIndicator={false}>
          {medals.length === 0 ? (
            // 빈 상태 = 고스트 메달 타일(전역 표준) — 걸릴 메달의 자리를 실루엣으로.
            <View testID="medal-empty">
              <EmptyGhostHeader
                title="아직 메달이 없어요"
                sub={<>대회를 완주하면 자동으로 감지해 이 자리에 걸려요.{'\n'}지난 대회의 메달은 <GhostStrong>메달 추가하기</GhostStrong>로 지금 남길 수 있어요.</>}
              />
              <View style={{flexDirection: 'row', gap: rs(12)}}>
                <View style={m.ghostTile}>
                  <GlassEdge glints={false} radius={RADIUS.lg} />
                  <View style={[m.disc, {width: rs(64), height: rs(64), borderRadius: rs(32)}]}>
                    <Ionicons name="medal-outline" size={ri(26)} color={T4} />
                  </View>
                  <GhostBar w="72%" style={{marginTop: rv(14)}} />
                  <GhostBar w="46%" dim />
                </View>
                <View style={[m.ghostTile, {opacity: 0.55}]}>
                  <GlassEdge glints={false} radius={RADIUS.lg} />
                  <View style={[m.disc, {width: rs(64), height: rs(64), borderRadius: rs(32)}]} />
                  <GhostBar w="60%" style={{marginTop: rv(14)}} />
                  <GhostBar w="38%" dim />
                </View>
              </View>
              {onAddMedal && (
                <Pressable onPress={onAddMedal} accessibilityRole="button" accessibilityLabel="메달 추가하기" style={({pressed}) => [m.emptyCta, pressed && m.pressed]}>
                  <Ionicons name="add" size={ri(18)} color={HALL_GOLD} />
                  <Text style={m.emptyCtaT}>메달 추가하기</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <>
              {/* 요약 스탯 헤더 — 상단정렬 + 공백을 개수·완주거리·최장으로 채운다(러닝 라이프 아카이브 가치). */}
              <View style={m.statStrip}>
                <GlassEdge glints={false} radius={RADIUS.lg} />
                <View style={m.stat}><Text style={m.statV}>{stats.count}</Text><Text style={m.statL}>메달</Text></View>
                <View style={m.statDiv} />
                <View style={m.stat}><Text style={m.statV}>{stats.totalKm}<Text style={m.statU}> km</Text></Text><Text style={m.statL}>완주 거리</Text></View>
                <View style={m.statDiv} />
                <View style={m.stat}><Text style={m.statV}>{stats.longest ? RACE_DISTANCE_LABEL[stats.longest] : '—'}</Text><Text style={m.statL}>최장</Text></View>
              </View>
              <Text style={m.sub}>완주한 대회의 메달과 기록.</Text>
            <View style={m.grid}>
              {medals.map((md) => {
                const t = medalTimeSec(md);
                return (
                  <Pressable
                    key={md.id}
                    onPress={() => setSelId(md.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${md.raceName} ${RACE_DISTANCE_LABEL[md.distance]} ${t ? fmtTime(t) : ''}`}
                    testID={`medal-${md.id}`}
                    style={({pressed}) => [m.cell, pressed && m.pressed]}>
                    <MedalDisc photoUri={md.medalPhotoUri} />
                    <Text style={m.cellName} numberOfLines={2}>{md.raceName}</Text>
                    <Text style={m.cellTime}>{RACE_DISTANCE_LABEL[md.distance]} {t ? fmtTime(t) : '기록 없음'}</Text>
                  </Pressable>
                );
              })}
            </View>
            </>
          )}
        </ScrollView>

        {/* 상세 — 원반 탭 시 오버레이 */}
        {sel && (
          <MedalDetail
            medal={sel}
            insetTop={insets.top}
            insetBottom={insets.bottom}
            onClose={() => setSelId(null)}
            onOpenRun={onOpenRun}
            onDelete={onDelete ? () => { onDelete(sel.id); setSelId(null); } : undefined}
          />
        )}
      </View>
    </SwipeBack>
  );
}

function MedalDetail({medal, insetTop, insetBottom, onClose, onOpenRun, onDelete}: {
  medal: Medal;
  insetTop: number;
  insetBottom: number;
  onClose: () => void;
  onOpenRun?: (runId: string) => void;
  onDelete?: () => void;
}) {
  // 시트 은유 진입/퇴장(chevron-down 정합) — 무전환 등장 폐지: 페이드+슬라이드
  // (MOTION.dur.sheet · ease.inout, 나이키 문법 시그니처). JS 드라이버 = 코드베이스 관례.
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {toValue: 1, duration: MOTION.dur.sheet, easing: MOTION.ease.inout, useNativeDriver: false}).start();
  }, [anim]);
  const close = () => {
    Animated.timing(anim, {toValue: 0, duration: MOTION.dur.sheet, easing: MOTION.ease.inout, useNativeDriver: false}).start(() => onClose());
  };
  const official = typeof medal.officialTimeSec === 'number' && medal.officialTimeSec > 0 ? medal.officialTimeSec : undefined;
  const app = medal.appTimeSec;
  const rows: {l: string; v: string}[] = [];
  rows.push({l: '종목', v: RACE_DISTANCE_LABEL[medal.distance]});
  if (official) rows.push({l: '공식 기록', v: fmtTime(official)});
  else if (app) rows.push({l: '기록', v: fmtTime(app)});
  if (typeof medal.paceSec === 'number') rows.push({l: '평균 페이스', v: `${Math.floor(medal.paceSec / 60)}'${String(Math.round(medal.paceSec % 60)).padStart(2, '0')}" /km`});
  if (medal.region) rows.push({l: '장소', v: medal.region});
  rows.push({l: '날짜', v: medal.date});
  if (medal.bib) rows.push({l: '배번', v: medal.bib});

  // 자랑 카드 — 캡처용 off-screen ref. 정본 시간(공식 우선)으로 브래그. BIB·이름 미포함(프라이버시).
  const cardRef = useRef<SvgCapturable | null>(null);
  const brag = official ?? app;
  const shareModel: MedalShareModel = {
    brand: 'keego',
    raceName: medal.raceName,
    distanceLabel: RACE_DISTANCE_LABEL[medal.distance],
    officialTime: brag ? fmtTime(brag) : '',
    date: medal.date.replace(/-/g, '.'),
    paceLabel: typeof medal.paceSec === 'number' ? `${Math.floor(medal.paceSec / 60)}'${String(Math.round(medal.paceSec % 60)).padStart(2, '0')}"/km` : undefined,
    medalPhotoUri: medal.medalPhotoUri,
  };
  const onShare = () => {
    void shareMedalCard(cardRef, `${medal.raceName} ${RACE_DISTANCE_LABEL[medal.distance]}${brag ? ` ${fmtTime(brag)}` : ''} 완주 — keego`);
  };

  return (
    <Animated.View
      style={[
        m.detailOverlay,
        {opacity: anim, transform: [{translateY: anim.interpolate({inputRange: [0, 1], outputRange: [32, 0]})}]},
      ]}
      testID="medal-detail">
      <View style={[m.detailNav, {paddingTop: insetTop + 6}]}>
        <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기" style={m.iconBtn}>
          <Ionicons name="chevron-down" size={ri(22)} color={T1} />
        </Pressable>
        <View style={{flexDirection: 'row', gap: rv(8)}}>
          <Pressable onPress={onShare} hitSlop={8} accessibilityRole="button" accessibilityLabel="메달 공유" testID="medal-share" style={m.iconBtn}>
            <Ionicons name="share-outline" size={ri(18)} color={HALL_GOLD} />
          </Pressable>
          {onDelete && (
            <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="메달 삭제" style={m.iconBtn}>
              <Ionicons name="trash-outline" size={ri(18)} color={T3} />
            </Pressable>
          )}
        </View>
      </View>
      {/* 공유 카드(화면 밖 마운트) — 캡처 전용, 사용자에겐 안 보임 */}
      <View style={{position: 'absolute', left: -9999, top: 0}} pointerEvents="none">
        <MedalShareCard ref={cardRef} model={shareModel} />
      </View>
      <ScrollView contentContainerStyle={{alignItems: 'center', paddingHorizontal: GUTTER, paddingBottom: insetBottom + 24}} showsVerticalScrollIndicator={false}>
        <MedalDisc photoUri={medal.medalPhotoUri} size={ri(168)} />
        <Text style={m.detailName}>{medal.raceName}</Text>
        {official && <Text style={m.detailTime}>{fmtTime(official)}</Text>}
        {!official && app && <Text style={m.detailTime}>{fmtTime(app)}</Text>}
        {official && app && Math.abs(app - official) >= 2 && (
          <Text style={m.detailNote}>앱 측정 {fmtTime(app)} · 공식 기록(칩 타임)이 정본</Text>
        )}

        <View style={m.detailCard}>
          <GlassEdge glints={false} radius={RADIUS.lg} />
          {rows.map((r, i) => (
            <View key={r.l} style={[m.detailRow, i > 0 && m.detailRowDiv]}>
              <Text style={m.detailRowL}>{r.l}</Text>
              <Text style={m.detailRowV}>{r.v}</Text>
            </View>
          ))}
        </View>

        {!!medal.certPhotoUri && (
          <View style={m.certWrap}>
            <Text style={m.certLabel}>기록증</Text>
            <Image source={{uri: medal.certPhotoUri}} style={m.certImg} resizeMode="contain" />
          </View>
        )}

        {!!medal.runId && onOpenRun && (
          <Pressable onPress={() => onOpenRun(medal.runId!)} accessibilityRole="button" accessibilityLabel="이 대회 러닝 기록 보기" style={({pressed}) => [m.runLink, pressed && m.pressed]}>
            <Ionicons name="footsteps-outline" size={ri(16)} color={ACCENT} />
            <Text style={m.runLinkT}>이 대회 러닝 기록 보기</Text>
          </Pressable>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const m = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  // 누름 표준(MOTION.press) — 사설 opacity 0.85/0.7 폐지.
  pressed: {opacity: MOTION.press.opacity, transform: [{scale: MOTION.press.scale}]},
  nav: {paddingTop: rv(12), paddingHorizontal: GUTTER, paddingBottom: rv(6), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  iconBtn: {width: rs(36), height: rs(36), borderRadius: RADIUS.pill, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center'},
  navTitle: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '600', letterSpacing: -0.2},

  head: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: rv(4)},
  h: {color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.5},
  count: {color: HALL_GOLD, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600'},
  sub: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, marginBottom: rv(8)},

  // 요약 스탯 헤더(상단정렬 시 공백 채움 + 아카이브 가치)
  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  statStrip: {flexDirection: 'row', alignItems: 'center', backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', paddingVertical: rv(16), marginTop: rv(2), marginBottom: rv(10)},
  stat: {flex: 1, alignItems: 'center', gap: rv(4)},
  statV: {color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums']},
  statU: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700'},
  statL: {color: T3, fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '600', letterSpacing: 0.3},
  statDiv: {width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: SEP, marginVertical: rv(4)},

  grid: {flexDirection: 'row', flexWrap: 'wrap', marginTop: rv(8)},
  cell: {width: '33.33%', alignItems: 'center', gap: rv(8), paddingVertical: rv(12), paddingHorizontal: rs(4)},
  disc: {
    borderWidth: 1, borderColor: withAlpha(HALL_GOLD, 0.35),
    // 골드 틴트 원반 — raw hex(#1a160e) 대신 골드 파생(시각 등가, 토큰 동기 유지).
    backgroundColor: withAlpha(HALL_GOLD, 0.08), alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  cellName: {color: T2, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: -0.2, textAlign: 'center', lineHeight: rf(14)},
  cellTime: {color: HALL_GOLD, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', fontVariant: ['tabular-nums']},

  // 고스트 메달 타일(빈 상태) — 실그리드 카드와 같은 재질, 내용만 실루엣.
  ghostTile: {flex: 1, alignItems: 'center', backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', paddingVertical: rv(22), paddingHorizontal: rs(14)},
  emptyCta: {flexDirection: 'row', alignItems: 'center', gap: rv(6), marginTop: rv(16), alignSelf: 'flex-start', paddingVertical: rv(12), paddingHorizontal: rs(20), borderRadius: RADIUS.pill, backgroundColor: withAlpha(HALL_GOLD, 0.12), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(HALL_GOLD, 0.4)},
  emptyCtaT: {color: HALL_GOLD, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700'},

  // 상세 오버레이
  detailOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BG},
  detailNav: {paddingHorizontal: GUTTER, paddingBottom: rv(4), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  detailName: {color: T1, fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', marginTop: rv(20), textWrap: 'balance'} as any,
  detailTime: {color: HALL_GOLD, fontFamily: DISPLAY, fontSize: HERO.hero, fontWeight: '700', letterSpacing: -1, marginTop: rv(8), fontVariant: ['tabular-nums']},
  detailNote: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(6), textAlign: 'center'},
  detailCard: {alignSelf: 'stretch', backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', paddingHorizontal: rs(16), marginTop: rv(22)},
  detailRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: rv(14)},
  detailRowDiv: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  detailRowL: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize},
  detailRowV: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', fontVariant: ['tabular-nums']},
  certWrap: {alignSelf: 'stretch', marginTop: rv(18), gap: rv(8)},
  certLabel: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: 0.4},
  certImg: {width: '100%', height: rs(260), borderRadius: RADIUS.input, backgroundColor: CARD},
  runLink: {flexDirection: 'row', alignItems: 'center', gap: rv(8), marginTop: rv(20), paddingVertical: rv(12), paddingHorizontal: rs(16), borderRadius: RADIUS.sm, backgroundColor: withAlpha(ACCENT, 0.1), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.3)},
  runLinkT: {color: ACCENT, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600'},
});
