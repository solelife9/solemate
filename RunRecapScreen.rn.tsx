// ============================================================================
// RunRecapScreen.rn.tsx — 완주 직후 리캡(축하) 풀스크린 (P0-2)
// 러닝을 마치면 기록 탭으로 바로 점프하던 흐름 대신, 러너가 가장 자랑스러운 순간에
// 거리/시간/페이스 + km 스플릿 막대 + 신기록(PR) 배지를 보여준 뒤 '완료'로 닫는다.
// 순수 프레젠테이션 — App 이 방금 저장한 런 데이터만 주입한다(데이터 생성 0).
// 닫기(onClose)에서 App 이 기록 탭으로 이동한다.
// ============================================================================
import React, {useEffect, useMemo, useRef, useState} from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {View, ScrollView, Pressable, StyleSheet, Image, Linking, Animated, type StyleProp, type ViewStyle} from 'react-native';
import {showDialog} from './lib/dialog';
import {Text, FONT_SCALE_CAP_HERO} from './lib/text';
import type {Text as RNText} from 'react-native'; // ref 인스턴스 타입 전용
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BG, BLACK, CARD_HI, ACCENT, GOOD, WARN, DANGER, HALL_GOLD, T1, T2, T3, FONT, DISPLAY, RADIUS, GUTTER, SEP, withAlpha, TYPE, GLASS, NUM, MOTION} from './theme';
import {GlassEdge, useReduceMotion, Input} from './primitives';
import {RACE_DISTANCE_LABEL, type RaceMatch} from './data/raceEvents';
import {fmtPaceSec} from './lib/pacePlan';
import {fmtPace} from './lib/format';
import {RunSplits, Split} from './RunSplits';
import {PRKind, PR_LABEL} from './lib/records';
import {pickPhotoWithPermission} from './lib/photo';
import {Unit, kmToDisplay, displayNum} from './lib/units';
import {parseRoute} from './lib/route';
import {CourseMap} from './CourseMap';
import ShareCardPicker from './ShareCardPicker';
import {buildShareCardModel} from './lib/shareCard';
import {takeCeremonyNumRect, type HandoffRect} from './lib/motionHandoff';

// ════════════════════════════════════════════════════════════════════════════
// 진입 시그니처 모션(태스크 #10) — 완주 순간의 감정 시퀀스.
// 체크 배지 스프링 팝 → '러닝 완료' 타이틀 Rise → 거리 카운트업(+스케일 정착) →
// 이하 섹션 Rise 스태거(80ms). RN 내장 Animated(JS 드라이버 — 코드베이스 관례).
// 접근성 '동작 줄이기'면 전부 생략하고 최종 상태 즉시 표시.
// ════════════════════════════════════════════════════════════════════════════

// jest 워커에서는 타이머 기반 애니메이션을 건너뛰고 최종 상태를 즉시 보여준다(reduce-motion
// 과 동일 취급 — OnboardingScreen 관례). 실제 앱 런타임엔 JEST_WORKER_ID 가 없다.
const SKIP_ANIM = !!(typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID);

// useReduceMotion 은 primitives 공용 훅을 소비한다(로컬 복붙 삭제, 2026-07-25).

/** 체크 배지 스프링 팝 — scale 0.6 → 1 오버슈트(성취의 '쿵' 순간). */
function PopIn({skip, children, style}: {skip: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle>}) {
  const a = useRef(new Animated.Value(skip ? 1 : 0)).current;
  useEffect(() => {
    if (skip) { a.setValue(1); return; }
    const anim = Animated.spring(a, {toValue: 1, friction: 5, tension: 120, useNativeDriver: false});
    anim.start();
    return () => anim.stop();
  }, [a, skip]);
  return (
    <Animated.View
      style={[style, {
        opacity: a.interpolate({inputRange: [0, 0.35, 1], outputRange: [0, 1, 1]}),
        transform: [{scale: a.interpolate({inputRange: [0, 1], outputRange: [0.6, 1]})}],
      }]}>
      {children}
    </Animated.View>
  );
}

/** 진입 Rise(로컬 — skip 지원) — 파라미터는 전역 MOTION.rise 토큰만(하드코딩 복제 폐지). */
function Enter({skip, delay = 0, children, style, testID}: {skip: boolean; delay?: number; children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string}) {
  const a = useRef(new Animated.Value(skip ? 1 : 0)).current;
  useEffect(() => {
    if (skip) { a.setValue(1); return; }
    const anim = Animated.timing(a, {toValue: 1, duration: MOTION.rise.dur, delay, easing: MOTION.ease.out, useNativeDriver: false});
    anim.start();
    return () => anim.stop();
  }, [a, delay, skip]);
  return (
    <Animated.View testID={testID} style={[style, {opacity: a, transform: [{translateY: a.interpolate({inputRange: [0, 1], outputRange: [MOTION.rise.dy, 0]})}]}]}>
      {children}
    </Animated.View>
  );
}

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
  bpm = 0,
  splits = [],
  elevationM = 0,
  calories = 0,
  prKinds = [],
  moment,
  shoeName,
  goalKm,
  goalMin = 0,
  pacePlan = [],
  shoeWear,
  loadInfo,
  route = null,
  unit = 'km',
  track = null,
  runId,
  onSaveMeta,
  raceMatch = null,
  onLogRace,
  onClose,
  onDelete,
}: {
  km: number;
  durationS: number;
  cadence?: number;
  /** 평균 심박(bpm). 라이브 캡처된 hrTrack 산출. 0 = 미측정(타일 숨김). */
  bpm?: number;
  splits?: Split[];
  elevationM?: number;
  calories?: number;
  /** 방금 런이 세운 신기록 종류(있으면 배지로 축하). */
  prKinds?: PRKind[];
  /** 기록 모먼트(공유 카드 리본) — App 이 신기록·인사이트로 계산해 전달. 없으면 미노출. */
  moment?: string;
  /** 신발 이름(파싱된 모델 라벨 권장). 없으면 신발 줄 숨김. */
  shoeName?: string;
  /** 목표 거리(km). km >= goalKm 이면 '목표 달성' 배지. 없으면 숨김. */
  goalKm?: number;
  /** 시간 목표(분, #15). durationS >= goalMin*60 이면 '목표 달성' 배지(시간 문구). */
  goalMin?: number;
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
  /** 대회 감지 결과 — 위치+날짜 특정(geo) 또는 하프/풀 완주(distance). 있으면 메달 배너. */
  raceMatch?: RaceMatch | null;
  /** '대회 기록 남기기' — App 이 메달 기록 흐름을 연다. 없으면 배너 미표시. */
  onLogRace?: () => void;
  onClose?: () => void;
  /** 방금 저장된 기록 삭제(심사 #1) — 자동 저장 전환으로 '버리기'가 리캡 상단 휴지통으로
      이동했다. App 이 확인 다이얼로그 + deleteRun 을 담당한다. 없으면 버튼 숨김. */
  onDelete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  // 목표 달성 배지 — 거리 목표(km)·시간 목표(분, #15 관통) 모두 판정.
  const timeGoalHit = !!goalMin && goalMin > 0 && durationS >= goalMin * 60;
  const goalHit = (!!goalKm && goalKm > 0 && km >= goalKm) || timeGoalHit;
  // ── 진입 시그니처 모션 — reduce-motion(또는 jest)이면 전부 즉시 최종 상태.
  const reduceMotion = useReduceMotion();
  const skipAnim = SKIP_ANIM || reduceMotion;
  const kmSafe = Number.isFinite(km) ? km : 0;
  // ── 세리머니 → 히어로 모프(2026-07-16, 사용자 요청) ─────────────────────────
  // 세리머니가 남긴 완주 숫자의 윈도 좌표를 1회 소비(마운트 시점 — 열람용 리캡은 null).
  // 있으면 카운트업 대신, 같은 숫자가 세리머니 자리(화면 중앙)에서 히어로 슬롯으로
  // 날아와 정착한다(위치+스케일 모프 MOTION.dur.sheet·inout — 시트 전환과 같은 시그니처 커브).
  const [morphSrc] = useState<HandoffRect | null>(takeCeremonyNumRect);
  const morphActive = !!morphSrc && !SKIP_ANIM;
  const [morphDone, setMorphDone] = useState(!morphActive);
  const morphT = useRef(new Animated.Value(0)).current;
  const [morphGeo, setMorphGeo] = useState<{left: number; top: number; dx: number; dy: number; s: number} | null>(null);
  const heroNumRef = useRef<RNText>(null);
  const morphOverlayRef = useRef<View>(null);
  const onHeroNumLayout = () => {
    if (!morphActive || morphGeo || morphDone) return;
    const heroNode: any = heroNumRef.current;
    const overlayNode: any = morphOverlayRef.current;
    if (!heroNode || !overlayNode || typeof heroNode.measureInWindow !== 'function' || typeof overlayNode.measureInWindow !== 'function') { setMorphDone(true); return; }
    // 클론이 사는 오버레이(absoluteFill·패딩 0)를 함께 재서 left/top 을 '오버레이 상대'로
    // 놓는다 — 루트 패딩·노치가 어느 좌표계로 잡히든 자기일관(윈도 좌표끼리의 차).
    overlayNode.measureInWindow((rx: number, ry: number) => {
      heroNode.measureInWindow((x: number, y: number, w: number, h: number) => {
        if (!(w > 0 && h > 0) || !morphSrc) { setMorphDone(true); return; }
        // 클론은 히어로 자리에 히어로 크기로 놓고, 시작 델타(세리머니 중심까지)에서 0 으로
        // 온다. 시작 스케일 = 폰트 크기 비(세리머니 64 / 히어로 68) — 박스(lineHeight) 비는
        // 폰트와 비율이 달라 실물보다 크게 시작한다.
        setMorphGeo({
          left: x - rx, top: y - ry,
          dx: (morphSrc.x + morphSrc.w / 2) - (x + w / 2),
          dy: (morphSrc.y + morphSrc.h / 2) - (y + h / 2),
          s: morphSrc.fs / rf(68),
        });
      });
    });
  };
  useEffect(() => {
    if (!morphGeo) return;
    if (reduceMotion) { setMorphDone(true); return; } // 동작 줄이기 — 모프 없이 즉시 정착
    const a = Animated.timing(morphT, {toValue: 1, duration: MOTION.dur.sheet, delay: 40, easing: MOTION.ease.inout, useNativeDriver: true});
    a.start(({finished}) => { if (finished) setMorphDone(true); });
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morphGeo]);
  // 거리 히어로 카운트업(0 → 최종, ~900ms) + 살짝 스케일 정착(0.96 → 1).
  // 모프 진입이면 카운트업 생략 — 숫자는 이미 '완성된 채' 세리머니에서 날아온다.
  const heroProg = useRef(new Animated.Value(skipAnim || morphActive ? 1 : 0)).current;
  const [heroShown, setHeroShown] = useState(skipAnim || morphActive ? kmSafe : 0);
  useEffect(() => {
    if (skipAnim || morphActive) { heroProg.setValue(1); setHeroShown(kmSafe); return; }
    const id = heroProg.addListener(({value}) => setHeroShown(kmSafe * value));
    const anim = Animated.timing(heroProg, {toValue: 1, duration: 900, delay: 320, easing: MOTION.ease.out, useNativeDriver: false});
    anim.start(({finished}) => { if (finished) setHeroShown(kmSafe); });
    return () => { heroProg.removeListener(id); anim.stop(); };
  }, [heroProg, kmSafe, skipAnim, morphActive]);
  // ── 오늘의 한 컷 + 한 줄 메모(2026-07-05) — 스트라바가 사랑받는 그 순간을 담는다.
  //    저장은 비차단: 사진은 고르는 즉시, 메모는 blur/닫기 시점에 onSaveMeta 로.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  // 대회 감지 배너 — '일반 러닝이에요'로 닫으면 이 세션 동안 숨긴다(재촉 금지).
  const [raceDismissed, setRaceDismissed] = useState(false);
  const memoSavedRef = useRef('');
  const canMeta = !!runId && !!onSaveMeta;
  const attachPhoto = async () => {
    if (!canMeta) return;
    try {
      const p = await pickPhotoWithPermission();
      if (p.ok) { setPhotoUri(p.uri); onSaveMeta!(runId!, {photoUri: p.uri}); }
      else if (p.reason === 'denied') {
        // 권한 영구 거부 시 버튼이 고장 난 듯 무반응이던 것 개선(2026-07-05) — 설정 안내.
        showDialog('사진 접근 권한이 필요해요', '설정에서 사진 권한을 허용하면 오늘의 한 컷을 남길 수 있어요.', [
          {text: '설정 열기', onPress: () => { Promise.resolve(Linking.openSettings()).catch(() => {}); }},
          {text: '나중에', style: 'cancel'},
        ]);
      }
      // cancelled 는 조용히 넘어간다(사용자가 스스로 닫음).
    } catch { showDialog('사진을 불러오지 못했어요', '잠시 후 다시 시도해 주세요.'); }
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
  // SNS 공유 — 여러 템플릿·포맷·배경·크기를 고르는 선택기. 오늘의 한 컷이 있으면 '사진' 배경도.
  const [shareOpen, setShareOpen] = useState(false);
  const shareInput = {
    distKm: km,
    unit,
    pace: fmtPace(km, durationS),
    time: fmtDur(durationS),
    durationS,
    shoeModel: shoeName || '',
    date: todayLabelKo(),
    track: track && track.laps > 0 ? track : null,
    // 6지표 카드용 — 칼로리·케이던스·심박(워치)·고도.
    calories, cadence, bpm, elevM: elevationM,
    // 기록 모먼트 카드 — App 이 신기록·인사이트로 계산해 전달(없으면 미노출).
    moment,
  };
  const cardModel = buildShareCardModel(shareInput);
  const onShare = () => setShareOpen(true);
  const closeWithMeta = () => { commitMemo(); onClose?.(); };
  return (
    <View style={[s.screen, {paddingTop: insets.top}]} testID="run-recap-screen">
      {/* 기록 삭제(심사 #1) — 자동 저장 전환으로 '버리기'가 여기로 왔다. 축하 위계를 해치지
          않게 우상단의 조용한 휴지통 하나(확인 다이얼로그는 App 담당). */}
      {!!onDelete && (
        <Pressable
          onPress={onDelete}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="기록 삭제"
          testID="recap-delete"
          style={({pressed}) => [s.deleteBtn, {top: insets.top + rv(6)}, pressed && {opacity: 0.7}]}>
          <Ionicons name="trash-outline" size={ri(17)} color={T3} />
        </Pressable>
      )}
      <ScrollView contentContainerStyle={{paddingHorizontal: GUTTER, paddingBottom: insets.bottom + 24, paddingTop: rv(8)}} showsVerticalScrollIndicator={false}>
        {/* 축하 헤더 — ① 체크 배지 스프링 팝 → ② 타이틀 Rise */}
        <View style={s.celebrate}>
          <PopIn skip={skipAnim}>
            <View style={s.medal}><Ionicons name="checkmark-done" size={ri(26)} color={GOOD} /></View>
          </PopIn>
          <Enter skip={skipAnim} delay={140} style={s.celebrateTxt}>
            <Text style={s.title}>러닝 완료</Text>
            {shoeName ? <Text style={s.shoe} numberOfLines={1}>{shoeName}</Text> : null}
          </Enter>
        </View>

        {/* 거리 히어로 — ③ 카운트업(0→최종) + 스케일 정착.
            모프 진입(세리머니 직후)은 클론이 날아와 앉을 때까지 숨겼다가 그대로 노출. */}
        <Animated.View
          style={[s.hero, {
            opacity: heroProg.interpolate({inputRange: [0, 0.12, 1], outputRange: [0, 1, 1]}),
            transform: [{scale: heroProg.interpolate({inputRange: [0, 1], outputRange: [0.96, 1]})}],
          }, morphActive && !morphDone && {opacity: 0}]}>
          <Text ref={heroNumRef} onLayout={onHeroNumLayout} style={s.heroNum} maxFontSizeMultiplier={FONT_SCALE_CAP_HERO} testID="recap-distance">{kmToDisplay(heroShown, unit).toFixed(2)}</Text>
          <Text style={s.heroUnit}>{unit}</Text>
        </Animated.View>

        {/* 배지 — 트랙 / 목표 달성 / 신기록 (④ 이하 섹션 Rise 스태거 80ms) */}
        {(!!track && track.laps > 0) || goalHit || prKinds.length > 0 ? (
          <Enter skip={skipAnim} delay={460} style={s.badges}>
            {!!track && track.laps > 0 && (
              <View style={[s.badge, {borderColor: withAlpha(ACCENT, 0.4), backgroundColor: withAlpha(ACCENT, 0.12)}]} testID="recap-track">
                <Ionicons name="ellipse-outline" size={ri(13)} color={ACCENT} />
                <Text style={[s.badgeTxt, {color: ACCENT}]}>트랙 · {track.lapM}m × {track.laps}랩</Text>
              </View>
            )}
            {goalHit && (
              <View style={[s.badge, {borderColor: withAlpha(ACCENT, 0.4), backgroundColor: withAlpha(ACCENT, 0.12)}]}>
                <Ionicons name="flag" size={ri(13)} color={ACCENT} />
                <Text style={[s.badgeTxt, {color: ACCENT}]}>{timeGoalHit ? `목표 ${goalMin}분 달성` : `목표 ${goalKm}${unit} 달성`}</Text>
              </View>
            )}
            {prKinds.map((k) => (
              <View key={k} testID={`recap-pr-${k}`} style={[s.badge, {borderColor: withAlpha(GOOD, 0.4), backgroundColor: withAlpha(GOOD, 0.12)}]}>
                <Ionicons name="trophy" size={ri(13)} color={GOOD} />
                <Text style={[s.badgeTxt, {color: GOOD}]}>신기록 · {PR_LABEL[k]}</Text>
              </View>
            ))}
          </Enter>
        ) : null}

        {/* 대회 완주 감지 배너 — 위치+날짜로 특정 대회면 콕 집어, 아니면 하프/풀 완주면 일반.
            '대회 기록 남기기' → 메달 기록 흐름. '일반 러닝이에요'로 닫으면 재촉 안 함(절제). */}
        {raceMatch && onLogRace && !raceDismissed && (
          <Enter skip={skipAnim} delay={540} style={s.raceBanner} testID="recap-race-banner">
            <View style={s.raceBannerHead}>
              <Ionicons name="medal" size={ri(16)} color={HALL_GOLD} />
              <Text style={s.raceBannerTitle}>
                {raceMatch.kind === 'geo' && raceMatch.race
                  ? `${raceMatch.race.name} 달리셨나요?`
                  : raceMatch.candidates && raceMatch.candidates.length === 1
                    ? `${raceMatch.candidates[0].name} 뛰셨나요?`
                    : `${RACE_DISTANCE_LABEL[raceMatch.distance]} 완주! 대회 기록인가요?`}
              </Text>
            </View>
            <Text style={s.raceBannerDesc}>
              {raceMatch.kind === 'geo'
                ? '메달과 공식 기록을 아카이브에 남겨보세요.'
                : raceMatch.candidates && raceMatch.candidates.length >= 1
                  ? '이 날 열린 대회 목록에서 골라 메달·기록을 남기세요.'
                  : '대회였다면 메달과 기록을 아카이브에 남겨보세요.'}
            </Text>
            <View style={s.raceBannerBtns}>
              <Pressable onPress={onLogRace} accessibilityRole="button" accessibilityLabel="대회 기록 남기기" style={({pressed}) => [s.raceBannerPrimary, pressed && {opacity: 0.85}]}>
                <Text style={s.raceBannerPrimaryT}>대회 기록 남기기</Text>
              </Pressable>
              <Pressable onPress={() => setRaceDismissed(true)} accessibilityRole="button" accessibilityLabel="일반 러닝이에요" hitSlop={6} style={({pressed}) => [s.raceBannerGhost, pressed && {opacity: 0.6}]}>
                <Text style={s.raceBannerGhostT}>일반 러닝이에요</Text>
              </Pressable>
            </View>
          </Enter>
        )}

        {/* 오늘의 코스 — GPS 경로가 있으면 진짜 지도 위 경로(없으면 스스로 숨김).
            완주 직후가 러너가 코스를 가장 자랑하고 싶은 순간(공유 트리거). */}
        <Enter skip={skipAnim} delay={620}>
          <CourseMap points={routePoints} title="오늘의 코스" style={{marginTop: rv(14)}} />
        </Enter>

        {/* 신발 마모 델타(시그니처) — 이 런이 신발 수명에 미친 영향 */}
        {shoeWear && (
          <Enter skip={skipAnim} delay={700} style={s.shoeCard} testID="recap-shoe-wear">
            <GlassEdge glints={false} radius={RADIUS.lg} />
              <View style={s.shoeIcon}><Ionicons name="footsteps" size={ri(18)} color={ACCENT} /></View>
            <View style={{flex: 1, minWidth: 0}}>
              <Text style={s.shoeName} numberOfLines={1}>{shoeName || '신발'}</Text>
              <Text style={s.shoeMeta}>
                +{displayNum(shoeWear.addedKm, unit, 1)}{unit} · 남은 내구도 <Text style={s.shoeStrong}>{shoeWear.remainingPct}%</Text>
                {shoeWear.deltaPct > 0 ? <Text style={s.shoeDelta}>  −{shoeWear.deltaPct}%</Text> : null}
              </Text>
            </View>
          </Enter>
        )}

        {/* 훈련 부하 영향(#5) — 이 런 포함 이번 주 부하. 부상예방 시그니처. */}
        {loadInfo && (() => {
          const c = loadInfo.level === 'high' ? DANGER : loadInfo.level === 'caution' ? WARN : GOOD;
          return (
            <Enter skip={skipAnim} delay={780} style={s.load} testID="recap-load">
              <View style={[s.loadDot, {backgroundColor: c}]} />
              <Text style={s.loadTxt}>이번 주 훈련 부하 <Text style={[s.loadStrong, {color: c}]}>{loadInfo.word}</Text> · {loadInfo.phrase}</Text>
            </Enter>
          );
        })()}

        {/* 핵심 지표 그리드 */}
        <Enter skip={skipAnim} delay={860} style={s.grid}>
          <GlassEdge glints={false} radius={RADIUS.lg} />
          <Stat label="시간" value={fmtDur(durationS)} />
          <Stat label="평균 페이스" value={fmtPace(km, durationS)} sub="/km" />
          {bpm > 0 && <Stat label="평균 심박" value={`${bpm}`} sub="bpm" />}
          <Stat label="칼로리" value={`${Math.round(calories)}`} sub="kcal" />
          {cadence > 0 && <Stat label="케이던스" value={`${Math.round(cadence)}`} sub="spm" />}
          <Stat label="상승 고도" value={`${Math.round(elevationM)}`} sub="m" />
        </Enter>
        {bpm === 0 && cadence === 0 && (
          <Text style={{color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, textAlign: 'center', marginTop: rv(10)}}>워치를 함께 쓰면 심박·심박존이 기록돼요</Text>
        )}

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
            <Enter skip={skipAnim} delay={940} style={s.plan} testID="recap-pace-plan">
              <GlassEdge glints={false} radius={RADIUS.lg} />
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
            </Enter>
          );
        })()}

        <Enter skip={skipAnim} delay={1020}>
          <RunSplits splits={splits} />
        </Enter>

        {/* 오늘의 한 컷 + 한 줄 메모(2026-07-05) — 기록이 이야기가 되는 자리.
            runId 없으면(비정상 경로) 섹션 자체를 숨긴다. 저장은 전부 비차단. */}
        {canMeta && (
          <Enter skip={skipAnim} delay={1100} style={s.metaCard} testID="recap-meta">
            <GlassEdge glints={false} radius={RADIUS.lg} />
              {photoUri ? (
              <View>
                <Image source={{uri: photoUri}} style={s.metaPhoto} resizeMode="cover" accessible accessibilityLabel="러닝 사진" />
                <Pressable onPress={removePhoto} accessibilityRole="button" accessibilityLabel="사진 제거" hitSlop={10}
                  style={({pressed}) => [s.metaPhotoRemove, pressed && {opacity: 0.8}]}>
                  <Ionicons name="close" size={ri(14)} color={T1} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={attachPhoto} accessibilityRole="button" accessibilityLabel="사진 추가" testID="recap-add-photo"
                style={({pressed}) => [s.metaPhotoAdd, pressed && {backgroundColor: CARD_HI}]}>
                <Ionicons name="camera-outline" size={ri(18)} color={T2} />
                <Text style={s.metaPhotoAddTxt}>오늘의 한 컷 남기기</Text>
              </Pressable>
            )}
            <Input
              variant="inline"
              value={memo}
              onChangeText={setMemo}
              onBlur={commitMemo}
              onSubmitEditing={commitMemo}
              placeholder="오늘의 러닝, 한 줄로"
              returnKeyType="done"
              maxLength={80}
              style={s.metaInput}
              accessibilityLabel="러닝 메모"
              testID="recap-memo-input"
            />
          </Enter>
        )}
      </ScrollView>

      {/* 공유 카드 선택기 — 공유 버튼으로 열린다. 오늘의 한 컷이 있으면 '사진' 배경도 제공. */}
      <ShareCardPicker visible={shareOpen} onClose={() => setShareOpen(false)} model={cardModel} route={routePoints} shareInput={shareInput} photoUri={photoUri} />

      <View style={[s.footer, s.footerRow, {paddingBottom: insets.bottom + 10}]}>
        <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="러닝 공유" testID="recap-share"
          style={({pressed}) => [s.shareBtn, pressed && {opacity: 0.85}]}>
          <Ionicons name="share-outline" size={ri(17)} color={T1} style={{marginRight: rs(8)}} />
          <Text style={s.doneTxt}>공유</Text>
        </Pressable>
        <Pressable onPress={closeWithMeta} accessibilityRole="button" accessibilityLabel="완료" testID="recap-done"
          style={({pressed}) => [s.doneBtn, pressed && {opacity: 0.85}]}>
          <Text style={s.doneTxt}>완료</Text>
        </Pressable>
      </View>

      {/* 세리머니 → 히어로 모프 클론 — 패딩 없는 absoluteFill 오버레이(좌표 기준점) 안에
          히어로 자리·크기로 두고, 세리머니 중심(화면 중앙) 델타에서 0 으로 이동+스케일
          정착. 도착 즉시 실제 히어로와 스왑. */}
      {morphActive && !morphDone && (
        <View ref={morphOverlayRef} style={StyleSheet.absoluteFill} pointerEvents="none">
          {morphGeo && (
            <Animated.Text
              style={[s.heroNum, s.morphClone, {
                left: morphGeo.left, top: morphGeo.top,
                transform: [
                  {translateX: morphT.interpolate({inputRange: [0, 1], outputRange: [morphGeo.dx, 0]})},
                  {translateY: morphT.interpolate({inputRange: [0, 1], outputRange: [morphGeo.dy, 0]})},
                  {scale: morphT.interpolate({inputRange: [0, 1], outputRange: [morphGeo.s, 1]})},
                ],
              }]}>
              {kmToDisplay(kmSafe, unit).toFixed(2)}
            </Animated.Text>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  // 기록 삭제(심사 #1) — 우상단 조용한 휴지통(축하 위계 침범 최소).
  deleteBtn: {position: 'absolute', right: GUTTER, zIndex: 10, width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center'},
  celebrate: {alignItems: 'center', gap: rv(6), marginTop: rv(12), marginBottom: rv(6)},
  celebrateTxt: {alignItems: 'center', gap: rv(6)},
  medal: {width: rs(52), height: rs(52), borderRadius: rs(26), alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(GOOD, 0.14)},
  title: {color: T1, fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.4},
  shoe: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  hero: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: rv(6), marginTop: rv(8), marginBottom: rv(14)},
  // tabular-nums — 카운트업 중 자릿수 폭이 튀지 않게(진입 시그니처 모션).
  // 세리머니 cer.dist(-1.5)와 '같은 숫자' 모프 — 자간 정합 + Jost 행간 규율 1.22×
  // (구 lineHeight 72=1.06×는 어센더 잘림 리스크, 2026-07-25 심사 #27).
  heroNum: {color: T1, fontFamily: NUM, fontSize: rf(68), fontWeight: '700', letterSpacing: -1.5, lineHeight: rf(83), includeFontPadding: false, fontVariant: ['tabular-nums']},
  // 모프 클론 — 윈도 좌표 절대 배치(리캡 루트=풀스크린이라 윈도 좌표 그대로 사용 가능).
  morphClone: {position: 'absolute'},
  heroUnit: {color: T2, fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '700', marginBottom: rv(10)},
  badges: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: rv(8), marginBottom: rv(16)},
  badge: {flexDirection: 'row', alignItems: 'center', gap: rv(4), paddingHorizontal: rs(12), minHeight: rs(30), borderRadius: RADIUS.pill, borderWidth: 1},
  badgeTxt: {fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700'},

  // 대회 완주 감지 배너(골드) — 완주 직후 러너가 메달을 남기고 싶은 순간.
  raceBanner: {marginTop: rv(14), padding: rs(16), borderRadius: rs(18), borderCurve: 'continuous', backgroundColor: withAlpha(HALL_GOLD, 0.08), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(HALL_GOLD, 0.35)},
  raceBannerHead: {flexDirection: 'row', alignItems: 'center', gap: rv(8)},
  raceBannerTitle: {flex: 1, color: HALL_GOLD, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: -0.2},
  raceBannerDesc: {color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, marginTop: rv(6), lineHeight: rf(18)},
  raceBannerBtns: {flexDirection: 'row', alignItems: 'center', gap: rv(8), marginTop: rv(14)},
  raceBannerPrimary: {flex: 1, height: rs(42), borderRadius: rs(12), alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(HALL_GOLD, 0.18), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(HALL_GOLD, 0.4)},
  raceBannerPrimaryT: {color: HALL_GOLD, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700'},
  raceBannerGhost: {height: rs(42), paddingHorizontal: rs(14), alignItems: 'center', justifyContent: 'center'},
  raceBannerGhostT: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500'},
  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  grid: {flexDirection: 'row', flexWrap: 'wrap', backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', paddingVertical: rv(6)},
  stat: {width: '50%', paddingVertical: rv(14), paddingHorizontal: rs(18), alignItems: 'flex-start'},
  statValue: {color: T1, fontFamily: DISPLAY, fontSize: TYPE.title1.fontSize, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums']},
  statLabel: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', marginTop: rv(3)},
  statSub: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500'},
  shoeCard: {flexDirection: 'row', alignItems: 'center', gap: rv(12), backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', paddingHorizontal: rs(14), paddingVertical: rv(12), marginBottom: rv(12)},
  shoeIcon: {width: rs(36), height: rs(36), borderRadius: rs(18), alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(ACCENT, 0.12)},
  shoeName: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: -0.2},
  shoeMeta: {color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', marginTop: rv(2)},
  shoeStrong: {color: T1, fontWeight: '700'},
  shoeDelta: {color: T3, fontWeight: '600'},
  load: {flexDirection: 'row', alignItems: 'center', gap: rv(8), marginBottom: rv(12), paddingHorizontal: rs(2)},
  loadDot: {width: rs(8), height: rs(8), borderRadius: rs(4)},
  loadTxt: {flex: 1, color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500'},
  loadStrong: {fontWeight: '700'},
  plan: {backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', paddingHorizontal: rs(16), paddingVertical: rv(12), marginTop: rv(12)},
  planHead: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: rv(8)},
  planTitle: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700'},
  planSummary: {fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700'},
  planRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: rv(8), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  planKm: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700', width: rs(42)},
  planTgt: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', flex: 1, fontVariant: ['tabular-nums']},
  planAct: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', width: rs(64), textAlign: 'right', fontVariant: ['tabular-nums']},
  planDelta: {fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700', width: rs(52), textAlign: 'right', fontVariant: ['tabular-nums']},
  // 푸터 = BG + 헤어라인(러닝 플로우 유일의 불투명 CARD_HI 바 폐지 — 2026-07-16).
  footer: {paddingHorizontal: GUTTER, paddingTop: rv(10), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP, backgroundColor: BG},
  // 투명 유리 CTA(홈 '러닝 시작'과 동일 문법) — 오렌지 필 폐지, 포인트 컬러는 지표에만.
  // 공유(보조)와 완료(주) — 같은 유리, 폭 비율로만 위계(공유 1 : 완료 1.6).
  footerRow: {flexDirection: 'row', gap: rv(10)},
  shareBtn: {flex: 1, minHeight: rs(52), borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: withAlpha(T1, 0.06), flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  doneBtn: {flex: 1.6, minHeight: rs(52), borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: withAlpha(T1, 0.1), alignItems: 'center', justifyContent: 'center'},
  doneTxt: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
  metaCard: {backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', padding: rs(14), marginTop: rv(12), gap: rv(12)},
  metaPhoto: {width: '100%', height: rs(180), borderRadius: RADIUS.md, borderCurve: 'continuous'},
  metaPhotoRemove: {position: 'absolute', top: 8, right: 8, width: rs(26), height: rs(26), borderRadius: rs(13), backgroundColor: withAlpha(BLACK, 0.55), alignItems: 'center', justifyContent: 'center'},
  metaPhotoAdd: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8), borderRadius: RADIUS.md, borderCurve: 'continuous', borderWidth: 1, borderColor: SEP, paddingVertical: rv(14)},
  metaPhotoAddTxt: {color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  // Input variant="inline" 채택(2026-07-25) — 표면·타이포는 프리미티브 소관, 여기선
  // 카드 안 밑줄 톤(SEP)과 여백만 조정.
  metaInput: {paddingVertical: rv(8), paddingHorizontal: rs(2), borderBottomColor: SEP},
});
