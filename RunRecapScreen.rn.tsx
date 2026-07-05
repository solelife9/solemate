// ============================================================================
// RunRecapScreen.rn.tsx — 완주 직후 리캡(축하) 풀스크린 (P0-2)
// 러닝을 마치면 기록 탭으로 바로 점프하던 흐름 대신, 러너가 가장 자랑스러운 순간에
// 거리/시간/페이스 + km 스플릿 막대 + 신기록(PR) 배지를 보여준 뒤 '완료'로 닫는다.
// 순수 프레젠테이션 — App 이 방금 저장한 런 데이터만 주입한다(데이터 생성 0).
// 닫기(onClose)에서 App 이 기록 탭으로 이동한다.
// ============================================================================
import React, {useMemo, useRef, useState} from 'react';
import {View, Text, ScrollView, Pressable, StyleSheet, Alert, TextInput, Image, Linking} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BG, CARD, CARD_HI, ACCENT, GOOD, WARN, DANGER, T1, T2, T3, T4, FONT, DISPLAY, RADIUS, SEP, withAlpha} from './theme';
import {fmtPaceSec} from './lib/pacePlan';
import {fmtPace} from './lib/format';
import {GlassEdge} from './primitives';
import {RunSplits, Split} from './RunSplits';
import {PRKind, PR_LABEL} from './lib/records';
import {pickPhotoWithPermission} from './lib/photo';
import {Unit} from './lib/units';
import {parseRoute} from './lib/route';
import {CourseMap} from './CourseMap';
import ShareCard from './ShareCard';
import {buildShareCardModel, shareRunCard, saveCardToLibrary, type SvgCapturable} from './lib/shareCard';

// 공유 카드 날짜 라벨 — "7월 3일 목요일"(표시 전용).
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
function todayLabelKo(): string {
  const d = new Date();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS_KO[d.getDay()]}요일`;
}

/** 초 → "h:mm:ss"(1시간↑) 또는 "m:ss". 음수/비유한은 0 처리. */
function fmtDur(s: number): string {
  const t = Number.isFinite(s) ? Math.max(0, Math.round(s)) : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function Stat({label, value, sub}: {label: string; value: string; sub?: string}) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statLabel}>{label}{sub ? <Text style={s.statSub}> {sub}</Text> : null}</Text>
    </View>
  );
}

export default function RunRecapScreen({
  km,
  durationS,
  cadence = 0,
  splits = [],
  elevationM = 0,
  calories = 0,
  prKinds = [],
  shoeName,
  goalKm,
  pacePlan = [],
  shoeWear,
  loadInfo,
  route = null,
  unit = 'km',
  track = null,
  runId,
  onSaveMeta,
  onClose,
}: {
  km: number;
  durationS: number;
  cadence?: number;
  splits?: Split[];
  elevationM?: number;
  calories?: number;
  /** 방금 런이 세운 신기록 종류(있으면 배지로 축하). */
  prKinds?: PRKind[];
  /** 신발 이름(파싱된 모델 라벨 권장). 없으면 신발 줄 숨김. */
  shoeName?: string;
  /** 목표 거리(km). km >= goalKm 이면 '목표 달성' 배지. 없으면 숨김. */
  goalKm?: number;
  /** 스피드 모드의 km별 목표 페이스(초/km). 있으면 '목표 대비' 결과 섹션을 보여준다. */
  pacePlan?: number[];
  /** 신발 마모 델타(시그니처) — 이 런이 신발 수명에 미친 영향. 없으면 신발 카드 숨김. */
  shoeWear?: {addedKm: number; remainingPct: number; deltaPct: number} | null;
  /** 훈련 부하 영향(#5) — 이 런 포함 이번 주 ACWR 평가. 미확신(표본부족)이면 null → 숨김. */
  loadInfo?: {phrase: string; word: string; level: 'low' | 'safe' | 'caution' | 'high'} | null;
  /** GPS 경로 원문(route_ 사이드카와 동일 blob). 있으면 코스 지도 + 경로 공유 카드. */
  route?: string | null;
  unit?: Unit;
  /** 트랙 세션이면 랩 정보 — 배지 '트랙 · 400m × N랩' + SNS 카드 LAPS 칸. */
  track?: {lapM: number; laps: number} | null;
  /** 방금 저장된 런 id — 사진/메모 저장 대상(없으면 섹션 숨김). */
  runId?: string;
  /** 사진/메모 영속(App.saveRunMeta). memo 는 레코드 동기, photoUri 는 로컬 사이드카. */
  onSaveMeta?: (id: string, meta: {memo?: string; photoUri?: string | null}) => void;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const goalHit = !!goalKm && goalKm > 0 && km >= goalKm;
  // ── 오늘의 한 컷 + 한 줄 메모(2026-07-05) — 스트라바가 사랑받는 그 순간을 담는다.
  //    저장은 비차단: 사진은 고르는 즉시, 메모는 blur/닫기 시점에 onSaveMeta 로.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const memoSavedRef = useRef('');
  const canMeta = !!runId && !!onSaveMeta;
  const attachPhoto = async () => {
    if (!canMeta) return;
    try {
      const p = await pickPhotoWithPermission();
      if (p.ok) { setPhotoUri(p.uri); onSaveMeta!(runId!, {photoUri: p.uri}); }
      else if (p.reason === 'denied') {
        // 권한 영구 거부 시 버튼이 고장 난 듯 무반응이던 것 개선(2026-07-05) — 설정 안내.
        Alert.alert('사진 접근 권한이 필요해요', '설정에서 사진 권한을 허용하면 오늘의 한 컷을 남길 수 있어요.', [
          {text: '설정 열기', onPress: () => { Promise.resolve(Linking.openSettings()).catch(() => {}); }},
          {text: '나중에', style: 'cancel'},
        ]);
      }
      // cancelled 는 조용히 넘어간다(사용자가 스스로 닫음).
    } catch { Alert.alert('사진을 불러오지 못했어요', '잠시 후 다시 시도해 주세요.'); }
  };
  const removePhoto = () => { setPhotoUri(null); if (canMeta) onSaveMeta!(runId!, {photoUri: null}); };
  const commitMemo = () => {
    if (!canMeta) return;
    const m = memo.trim();
    if (m === memoSavedRef.current) return;
    memoSavedRef.current = m;
    onSaveMeta!(runId!, {memo: m});
  };
  // 코스 지도 — 경로 blob 파싱(수동 기록/GPS 실패면 [] → 지도 스스로 숨김).
  const routePoints = useMemo(() => parseRoute(route), [route]);
  // SNS 공유 — 상세(RunDetail)와 동일한 투명 러닝 카드(스트라바 방식) 파이프라인 재사용.
  const cardRef = useRef<SvgCapturable | null>(null);
  const photoCardRef = useRef<SvgCapturable | null>(null);
  const shareInput = {
    distKm: km,
    unit,
    pace: fmtPace(km, durationS),
    time: fmtDur(durationS),
    durationS,
    shoeModel: shoeName || '',
    date: todayLabelKo(),
    track: track && track.laps > 0 ? track : null,
  };
  const cardModel = buildShareCardModel(shareInput);
  const onShare = () => {
    if (photoUri) {
      // 한 컷이 있으면 완성본(사진+카드)이 기본 — 수동으로 얹을 필요가 없다(2026-07-05).
      Alert.alert('러닝 카드 공유', '오늘의 한 컷 위에 기록이 얹힌 완성본으로 공유해요.', [
        {text: '완성본 공유', onPress: () => void shareRunCard(photoCardRef, shareInput)},
        {text: '투명 카드만 저장', onPress: async () => {
          const r = await saveCardToLibrary(cardRef);
          if (r.ok) Alert.alert('사진앱에 저장됐어요', '인스타 스토리에서 내 사진을 고른 뒤, 스티커로 이 카드를 올리면 돼요.');
          else if (r.reason === 'denied') Alert.alert('사진 접근 권한이 필요해요', '설정에서 사진 추가 권한을 허용해 주세요.');
          else { console.log('card save error', r.reason); Alert.alert('저장하지 못했어요', '잠시 후 다시 시도해 주세요.'); }
        }},
        {text: '취소', style: 'cancel'},
      ]);
      return;
    }
    Alert.alert('러닝 카드 공유', '투명 카드를 사진앱에 저장해, 인스타 스토리에서 내 사진 위에 올리세요.', [
      {text: '사진앱에 저장', onPress: async () => {
        const r = await saveCardToLibrary(cardRef);
        if (r.ok) Alert.alert('사진앱에 저장됐어요', '인스타 스토리에서 내 사진을 고른 뒤, 스티커로 이 카드를 올리면 돼요.');
        else if (r.reason === 'denied') Alert.alert('사진 접근 권한이 필요해요', '설정에서 사진 추가 권한을 허용해 주세요.');
        else { console.log('card save error', r.reason); Alert.alert('저장하지 못했어요', '잠시 후 다시 시도해 주세요.'); }
      }},
      {text: '공유 시트로', onPress: () => void shareRunCard(cardRef, shareInput)},
      {text: '취소', style: 'cancel'},
    ]);
  };
  const closeWithMeta = () => { commitMemo(); onClose?.(); };
  return (
    <View style={[s.screen, {paddingTop: insets.top}]} testID="run-recap-screen">
      <ScrollView contentContainerStyle={{paddingHorizontal: 18, paddingBottom: insets.bottom + 24, paddingTop: 8}} showsVerticalScrollIndicator={false}>
        {/* 축하 헤더 */}
        <View style={s.celebrate}>
          <View style={s.medal}><Ionicons name="checkmark-done" size={26} color={GOOD} /></View>
          <Text style={s.title}>러닝 완료</Text>
          {shoeName ? <Text style={s.shoe} numberOfLines={1}>{shoeName}</Text> : null}
        </View>

        {/* 거리 히어로 */}
        <View style={s.hero}>
          <Text style={s.heroNum} testID="recap-distance">{(Number.isFinite(km) ? km : 0).toFixed(2)}</Text>
          <Text style={s.heroUnit}>{unit}</Text>
        </View>

        {/* 배지 — 트랙 / 목표 달성 / 신기록 */}
        {(!!track && track.laps > 0) || goalHit || prKinds.length > 0 ? (
          <View style={s.badges}>
            {!!track && track.laps > 0 && (
              <View style={[s.badge, {borderColor: withAlpha(ACCENT, 0.4), backgroundColor: withAlpha(ACCENT, 0.12)}]} testID="recap-track">
                <Ionicons name="ellipse-outline" size={13} color={ACCENT} />
                <Text style={[s.badgeTxt, {color: ACCENT}]}>트랙 · {track.lapM}m × {track.laps}랩</Text>
              </View>
            )}
            {goalHit && (
              <View style={[s.badge, {borderColor: withAlpha(ACCENT, 0.4), backgroundColor: withAlpha(ACCENT, 0.12)}]}>
                <Ionicons name="flag" size={13} color={ACCENT} />
                <Text style={[s.badgeTxt, {color: ACCENT}]}>목표 {goalKm}{unit} 달성</Text>
              </View>
            )}
            {prKinds.map((k) => (
              <View key={k} testID={`recap-pr-${k}`} style={[s.badge, {borderColor: withAlpha(GOOD, 0.4), backgroundColor: withAlpha(GOOD, 0.12)}]}>
                <Ionicons name="trophy" size={13} color={GOOD} />
                <Text style={[s.badgeTxt, {color: GOOD}]}>신기록 · {PR_LABEL[k]}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* 오늘의 코스 — GPS 경로가 있으면 진짜 지도 위 경로(없으면 스스로 숨김).
            완주 직후가 러너가 코스를 가장 자랑하고 싶은 순간(공유 트리거). */}
        <CourseMap points={routePoints} title="오늘의 코스" style={{marginTop: 14}} />

        {/* 신발 마모 델타(시그니처) — 이 런이 신발 수명에 미친 영향 */}
        {shoeWear && (
          <View style={s.shoeCard} testID="recap-shoe-wear">
            <View style={s.shoeIcon}><Ionicons name="footsteps" size={18} color={ACCENT} /></View>
            <View style={{flex: 1, minWidth: 0}}>
              <Text style={s.shoeName} numberOfLines={1}>{shoeName || '신발'}</Text>
              <Text style={s.shoeMeta}>
                +{shoeWear.addedKm.toFixed(1)}{unit} · 남은 내구도 <Text style={s.shoeStrong}>{shoeWear.remainingPct}%</Text>
                {shoeWear.deltaPct > 0 ? <Text style={s.shoeDelta}>  −{shoeWear.deltaPct}%p</Text> : null}
              </Text>
            </View>
          </View>
        )}

        {/* 훈련 부하 영향(#5) — 이 런 포함 이번 주 부하. 부상예방 시그니처. */}
        {loadInfo && (() => {
          const c = loadInfo.level === 'high' ? DANGER : loadInfo.level === 'caution' ? WARN : GOOD;
          return (
            <View style={s.load} testID="recap-load">
              <View style={[s.loadDot, {backgroundColor: c}]} />
              <Text style={s.loadTxt}>이번 주 훈련 부하 <Text style={[s.loadStrong, {color: c}]}>{loadInfo.word}</Text> · {loadInfo.phrase}</Text>
            </View>
          );
        })()}

        {/* 핵심 지표 그리드 */}
        <View style={s.grid}>
          <Stat label="시간" value={fmtDur(durationS)} />
          <Stat label="평균 페이스" value={fmtPace(km, durationS)} sub={`/${unit}`} />
          {calories > 0 && <Stat label="칼로리" value={`${Math.round(calories)}`} sub="kcal" />}
          {cadence > 0 && <Stat label="케이던스" value={`${Math.round(cadence)}`} sub="spm" />}
          {elevationM > 0 && <Stat label="누적 상승" value={`${Math.round(elevationM)}`} sub="m" />}
        </View>

        {/* km 스플릿 막대(2구간↑일 때만 자체적으로 표시) */}
        {/* 스피드 모드 — km별 목표 대비 실제(플랜 적중 여부). 빠름=초록(−), 느림=주황(+). */}
        {pacePlan.length > 0 && splits.length > 0 && (() => {
          const rows = splits.map((sp, i) => {
            const tgt = pacePlan[Math.min(i, pacePlan.length - 1)];
            return {km: sp.km, tgt, actual: sp.paceSec, diff: Math.round(sp.paceSec - tgt)};
          });
          const avgDiff = Math.round(rows.reduce((a, r) => a + r.diff, 0) / rows.length);
          const fmtDelta = (d: number) => (d > 0 ? `+${d}초` : d < 0 ? `−${Math.abs(d)}초` : '±0초');
          const dColor = (d: number) => (d <= -3 ? GOOD : d >= 3 ? WARN : T3);
          return (
            <View style={s.plan} testID="recap-pace-plan">
              <View style={s.planHead}>
                <Text style={s.planTitle}>페이스 플랜 결과</Text>
                <Text style={[s.planSummary, {color: avgDiff <= -3 ? GOOD : avgDiff >= 3 ? WARN : T2}]}>
                  목표 대비 {avgDiff <= -3 ? '빠름' : avgDiff >= 3 ? '느림' : '근접'} {fmtDelta(avgDiff)}
                </Text>
              </View>
              {rows.map((r, i) => (
                <View key={i} style={s.planRow}>
                  <Text style={s.planKm}>{r.km}km</Text>
                  <Text style={s.planTgt}>목표 {fmtPaceSec(r.tgt)}</Text>
                  <Text style={s.planAct}>{fmtPaceSec(r.actual)}</Text>
                  <Text style={[s.planDelta, {color: dColor(r.diff)}]}>{fmtDelta(r.diff)}</Text>
                </View>
              ))}
            </View>
          );
        })()}

        <RunSplits splits={splits} />

        {/* 오늘의 한 컷 + 한 줄 메모(2026-07-05) — 기록이 이야기가 되는 자리.
            runId 없으면(비정상 경로) 섹션 자체를 숨긴다. 저장은 전부 비차단. */}
        {canMeta && (
          <View style={s.metaCard} testID="recap-meta">
            {photoUri ? (
              <View>
                <Image source={{uri: photoUri}} style={s.metaPhoto} resizeMode="cover" accessible accessibilityLabel="러닝 사진" />
                <Pressable onPress={removePhoto} accessibilityRole="button" accessibilityLabel="사진 제거"
                  style={({pressed}) => [s.metaPhotoRemove, pressed && {opacity: 0.8}]}>
                  <Ionicons name="close" size={14} color={T1} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={attachPhoto} accessibilityRole="button" accessibilityLabel="사진 추가" testID="recap-add-photo"
                style={({pressed}) => [s.metaPhotoAdd, pressed && {backgroundColor: CARD_HI}]}>
                <Ionicons name="camera-outline" size={18} color={T2} />
                <Text style={s.metaPhotoAddTxt}>오늘의 한 컷 남기기</Text>
              </Pressable>
            )}
            <TextInput
              value={memo}
              onChangeText={setMemo}
              onBlur={commitMemo}
              onSubmitEditing={commitMemo}
              placeholder="오늘의 러닝, 한 줄로"
              placeholderTextColor={T4}
              returnKeyType="done"
              maxLength={80}
              style={s.metaInput}
              accessibilityLabel="러닝 메모"
              testID="recap-memo-input"
            />
          </View>
        )}
      </ScrollView>

      {/* 공유 캡처용 오프스크린 러닝 카드(투명 PNG — 인스타 스토리 스티커 방식) */}
      {/* (오늘의 한 컷/메모 섹션은 ScrollView 안에 렌더 — 아래 s.metaCard 참조) */}
      <View style={s.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ShareCard ref={cardRef as never} model={cardModel} route={routePoints} />
        {!!photoUri && <ShareCard ref={photoCardRef as never} model={cardModel} route={routePoints} photoUri={photoUri} />}
      </View>

      <View style={[s.footer, s.footerRow, {paddingBottom: insets.bottom + 10}]}>
        <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="러닝 공유" testID="recap-share"
          style={({pressed}) => [s.shareBtn, pressed && {opacity: 0.85}]}>
          <GlassEdge radius={RADIUS.lg} />
          <Ionicons name="share-outline" size={17} color={T1} style={{marginRight: 7}} />
          <Text style={s.doneTxt}>공유</Text>
        </Pressable>
        <Pressable onPress={closeWithMeta} accessibilityRole="button" accessibilityLabel="완료" testID="recap-done"
          style={({pressed}) => [s.doneBtn, pressed && {opacity: 0.85}]}>
          <GlassEdge radius={RADIUS.lg} />
          <Text style={s.doneTxt}>완료</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  celebrate: {alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 6},
  medal: {width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(GOOD, 0.14)},
  title: {color: T1, fontFamily: FONT, fontSize: 22, fontWeight: '700', letterSpacing: -0.4},
  shoe: {color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600'},
  hero: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 6, marginTop: 8, marginBottom: 14},
  heroNum: {color: T1, fontFamily: DISPLAY, fontSize: 64, fontWeight: '700', letterSpacing: -2, lineHeight: 68},
  heroUnit: {color: T2, fontFamily: FONT, fontSize: 20, fontWeight: '700', marginBottom: 10},
  badges: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 16},
  badge: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 30, borderRadius: RADIUS.pill, borderWidth: 1},
  badgeTxt: {fontFamily: FONT, fontSize: 13, fontWeight: '700'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, paddingVertical: 6},
  stat: {width: '50%', paddingVertical: 14, paddingHorizontal: 18, alignItems: 'flex-start'},
  statValue: {color: T1, fontFamily: DISPLAY, fontSize: 26, fontWeight: '700', letterSpacing: -0.6},
  statLabel: {color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', marginTop: 3},
  statSub: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500'},
  shoeCard: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12},
  shoeIcon: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(ACCENT, 0.12)},
  shoeName: {color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '700', letterSpacing: -0.2},
  shoeMeta: {color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginTop: 2},
  shoeStrong: {color: T1, fontWeight: '700'},
  shoeDelta: {color: T3, fontWeight: '600'},
  load: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 2},
  loadDot: {width: 8, height: 8, borderRadius: 4},
  loadTxt: {flex: 1, color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500'},
  loadStrong: {fontWeight: '700'},
  plan: {backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, paddingHorizontal: 16, paddingVertical: 12, marginTop: 12},
  planHead: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8},
  planTitle: {color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '700'},
  planSummary: {fontFamily: FONT, fontSize: 13, fontWeight: '700'},
  planRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  planKm: {color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '700', width: 42},
  planTgt: {color: T4, fontFamily: FONT, fontSize: 13, fontWeight: '500', flex: 1},
  planAct: {color: T1, fontFamily: FONT, fontSize: 14, fontWeight: '700', width: 64, textAlign: 'right'},
  planDelta: {fontFamily: FONT, fontSize: 13, fontWeight: '700', width: 52, textAlign: 'right'},
  footer: {paddingHorizontal: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP, backgroundColor: CARD_HI},
  // 투명 유리 CTA(홈 '러닝 시작'과 동일 문법) — 오렌지 필 폐지, 포인트 컬러는 지표에만.
  // 공유(보조)와 완료(주) — 같은 유리, 폭 비율로만 위계(공유 1 : 완료 1.6).
  footerRow: {flexDirection: 'row', gap: 10},
  shareBtn: {flex: 1, height: 52, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: withAlpha(T1, 0.06), flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  doneBtn: {flex: 1.6, height: 52, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: withAlpha(T1, 0.1), alignItems: 'center', justifyContent: 'center'},
  doneTxt: {color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '700'},
  metaCard: {backgroundColor: CARD, borderRadius: RADIUS.lg, borderCurve: 'continuous', padding: 14, marginTop: 12, gap: 12},
  metaPhoto: {width: '100%', height: 180, borderRadius: RADIUS.md, borderCurve: 'continuous'},
  metaPhotoRemove: {position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center'},
  metaPhotoAdd: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.md, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, paddingVertical: 14},
  metaPhotoAddTxt: {color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '600'},
  metaInput: {color: T1, fontFamily: FONT, fontSize: 14, paddingVertical: 8, paddingHorizontal: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEP},
  offscreen: {position: 'absolute', left: -10000, top: 0, opacity: 0},
});
