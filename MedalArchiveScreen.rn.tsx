// ============================================================================
// MedalArchiveScreen.rn.tsx — 마라톤 메달 아카이브 (마이 탭 → 명예의 전당 옆)
// 완주한 대회의 메달·기록 컬렉션. 원형 가이드로 촬영해 '균일한 원반'으로 정렬돼 진열장처럼
// 깔끔하다(신발 명예의 전당과 짝, HALL_GOLD 무드). 목록은 App 이 lib/medals 에서 주입한다.
// 원반 탭 → 상세(큰 원형 메달 + 기록증 + 공식 기록 + 그 러닝 링크 + BIB). 색은 theme 토큰만.
// ============================================================================
import React, {useRef, useState} from 'react';
import {View, Text, ScrollView, Pressable, Image, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BG, CARD, CARD_HI, ACCENT, HALL_GOLD, T1, T2, T3, T4, SEP, CARD_BORDER, FONT, DISPLAY, withAlpha} from './theme';
import {SwipeBack} from './primitives';
import {fmtTime} from './lib/format';
import {RACE_DISTANCE_LABEL} from './data/raceEvents';
import {medalTimeSec, type Medal} from './lib/medals';
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

  return (
    <SwipeBack onBack={onBack}>
      <View style={[m.screen, {paddingTop: insets.top}]} testID="medal-archive-screen">
        <View style={m.nav}>
          <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="뒤로" style={m.iconBtn}>
            <Ionicons name="chevron-back" size={20} color={T1} />
          </Pressable>
          <Text style={m.navTitle}>메달 아카이브</Text>
          {onAddMedal ? (
            <Pressable onPress={onAddMedal} hitSlop={8} accessibilityRole="button" accessibilityLabel="메달 추가" testID="medal-add" style={m.iconBtn}>
              <Ionicons name="add" size={24} color={ACCENT} />
            </Pressable>
          ) : <View style={{width: 36}} />}
        </View>

        <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'center', padding: 18, paddingBottom: insets.bottom + 28}} showsVerticalScrollIndicator={false}>
          <View style={m.head}>
            <Text style={m.h}>메달 아카이브</Text>
            <Text style={m.count}>{medals.length}개 수집</Text>
          </View>
          <Text style={m.sub}>완주한 대회의 메달과 기록.</Text>

          {medals.length === 0 ? (
            <View style={m.empty} testID="medal-empty">
              <View style={[m.disc, {width: 84, height: 84, borderRadius: 42, borderStyle: 'dashed'}]}>
                <Ionicons name="medal-outline" size={34} color={T4} />
              </View>
              <Text style={m.emptyT}>아직 메달이 없어요</Text>
              <Text style={m.emptyD}>완주한 대회의 메달과 기록을 남겨보세요.{'\n'}대회를 완주하면 러닝 요약에서도 뜨고, 아래로 지금 추가할 수도 있어요.</Text>
              {onAddMedal && (
                <Pressable onPress={onAddMedal} accessibilityRole="button" accessibilityLabel="메달 추가하기" style={({pressed}) => [m.emptyCta, pressed && {opacity: 0.85}]}>
                  <Ionicons name="add" size={18} color={HALL_GOLD} />
                  <Text style={m.emptyCtaT}>메달 추가하기</Text>
                </Pressable>
              )}
            </View>
          ) : (
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
                    style={({pressed}) => [m.cell, pressed && {opacity: 0.7}]}>
                    <MedalDisc photoUri={md.medalPhotoUri} />
                    <Text style={m.cellName} numberOfLines={2}>{md.raceName}</Text>
                    <Text style={m.cellTime}>{RACE_DISTANCE_LABEL[md.distance]} {t ? fmtTime(t) : '기록 없음'}</Text>
                  </Pressable>
                );
              })}
            </View>
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
    <View style={m.detailOverlay} testID="medal-detail">
      <View style={[m.detailNav, {paddingTop: insetTop + 6}]}>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기" style={m.iconBtn}>
          <Ionicons name="chevron-down" size={22} color={T1} />
        </Pressable>
        <View style={{flexDirection: 'row', gap: 8}}>
          <Pressable onPress={onShare} hitSlop={8} accessibilityRole="button" accessibilityLabel="메달 공유" testID="medal-share" style={m.iconBtn}>
            <Ionicons name="share-outline" size={18} color={HALL_GOLD} />
          </Pressable>
          {onDelete && (
            <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="메달 삭제" style={m.iconBtn}>
              <Ionicons name="trash-outline" size={18} color={T3} />
            </Pressable>
          )}
        </View>
      </View>
      {/* 공유 카드(화면 밖 마운트) — 캡처 전용, 사용자에겐 안 보임 */}
      <View style={{position: 'absolute', left: -9999, top: 0}} pointerEvents="none">
        <MedalShareCard ref={cardRef} model={shareModel} />
      </View>
      <ScrollView contentContainerStyle={{alignItems: 'center', paddingHorizontal: 24, paddingBottom: insetBottom + 24}} showsVerticalScrollIndicator={false}>
        <MedalDisc photoUri={medal.medalPhotoUri} size={168} />
        <Text style={m.detailName}>{medal.raceName}</Text>
        {official && <Text style={m.detailTime}>{fmtTime(official)}</Text>}
        {!official && app && <Text style={m.detailTime}>{fmtTime(app)}</Text>}
        {official && app && Math.abs(app - official) >= 2 && (
          <Text style={m.detailNote}>앱 측정 {fmtTime(app)} · 공식 기록(칩 타임)이 정본</Text>
        )}

        <View style={m.detailCard}>
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
          <Pressable onPress={() => onOpenRun(medal.runId!)} accessibilityRole="button" accessibilityLabel="이 대회 러닝 기록 보기" style={({pressed}) => [m.runLink, pressed && {opacity: 0.7}]}>
            <Ionicons name="footsteps-outline" size={16} color={ACCENT} />
            <Text style={m.runLinkT}>이 대회 러닝 기록 보기</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const m = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  nav: {paddingTop: 12, paddingHorizontal: 14, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  iconBtn: {width: 36, height: 36, borderRadius: 999, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center'},
  navTitle: {color: T1, fontFamily: FONT, fontSize: 17, fontWeight: '600', letterSpacing: -0.2},

  head: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4},
  h: {color: T1, fontFamily: DISPLAY, fontSize: 25, fontWeight: '700', letterSpacing: -0.5},
  count: {color: HALL_GOLD, fontFamily: FONT, fontSize: 13, fontWeight: '600'},
  sub: {color: T3, fontFamily: FONT, fontSize: 14, marginBottom: 8},

  grid: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 8},
  cell: {width: '33.33%', alignItems: 'center', gap: 7, paddingVertical: 12, paddingHorizontal: 4},
  disc: {
    borderWidth: 1, borderColor: withAlpha(HALL_GOLD, 0.35),
    backgroundColor: '#1a160e', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  cellName: {color: T2, fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: -0.2, textAlign: 'center', lineHeight: 14},
  cellTime: {color: HALL_GOLD, fontFamily: FONT, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums']},

  empty: {alignItems: 'center', gap: 10, paddingVertical: 56},
  emptyT: {color: T2, fontFamily: FONT, fontSize: 16, fontWeight: '600', marginTop: 6},
  emptyD: {color: T3, fontFamily: FONT, fontSize: 14, textAlign: 'center', lineHeight: 19, paddingHorizontal: 12},
  emptyCta: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, backgroundColor: withAlpha(HALL_GOLD, 0.12), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(HALL_GOLD, 0.4)},
  emptyCtaT: {color: HALL_GOLD, fontFamily: FONT, fontSize: 15, fontWeight: '700'},

  // 상세 오버레이
  detailOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BG},
  detailNav: {paddingHorizontal: 14, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  detailName: {color: T1, fontFamily: FONT, fontSize: 21, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', marginTop: 20, textWrap: 'balance'} as any,
  detailTime: {color: HALL_GOLD, fontFamily: DISPLAY, fontSize: 40, fontWeight: '700', letterSpacing: -1, marginTop: 8, fontVariant: ['tabular-nums']},
  detailNote: {color: T3, fontFamily: FONT, fontSize: 13, marginTop: 6, textAlign: 'center'},
  detailCard: {alignSelf: 'stretch', backgroundColor: CARD, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER, paddingHorizontal: 16, marginTop: 22},
  detailRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14},
  detailRowDiv: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  detailRowL: {color: T3, fontFamily: FONT, fontSize: 14},
  detailRowV: {color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums']},
  certWrap: {alignSelf: 'stretch', marginTop: 18, gap: 8},
  certLabel: {color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: 0.4},
  certImg: {width: '100%', height: 260, borderRadius: 14, backgroundColor: CARD},
  runLink: {flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 20, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: withAlpha(ACCENT, 0.1), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.3)},
  runLinkT: {color: ACCENT, fontFamily: FONT, fontSize: 15, fontWeight: '600'},
});
