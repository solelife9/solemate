// ============================================================================
// HistoryScreen.rn.tsx — 기록: period segment, period chart, recent runs + RunDetail
// (sample data removed — real summary/chart/runs are injected via props)
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import { View, ScrollView, FlatList, Pressable, StyleSheet, KeyboardAvoidingView, Platform, RefreshControl, Image } from 'react-native';
import { showDialog } from './lib/dialog';
import { showToast } from './lib/toast';
import {Text, FONT_SCALE_CAP_HERO} from './lib/text';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Rect as SvgRect, Path as SvgPath, Line as SvgLine } from 'react-native-svg';
import {
  BG, CARD_HI, GLASS, ACCENT, BRAND, DANGER, T1, T2, T3, SEP, FONT, DISPLAY, Shoe, Run, SHOES, withAlpha, RADIUS, GUTTER, MOTION, HERO, HR_ZONE_COLORS, TYPE,
  BAR,
  ICON,
} from './theme';
// 기간 탭 스트립 = SegmentedControl(md), 러닝 상세 2×3 메트릭 = StatGrid(sm) 프리미티브.
import { TabBar, TABBAR_CLEARANCE, Button, SegmentedControl, StatGrid, SwipeBack, Chip, AmbientBackdrop, EmptyGhostHeader, GhostStrong, GhostBar, Rise, GlassEdge, BottomSheet, Input } from './primitives';
import { Unit, displayNum, displayToKm } from './lib/units';
import { ymdLocal } from './lib/format';
import { sumKm, summaryOf, monthBuckets, weekBuckets, yearBuckets } from './lib/stats';
import { fitnessSummary, thresholdPaceSec } from './lib/analytics/fitness';
import { gradeAdjustedPaceSec, smoothElevation, resampleByDistance } from './lib/analytics/gap';
import { estimateMaxHR, timeInZones, hrSummary, zoneBoundaries, HR_ZONE_LABEL, type HRZone } from './lib/analytics/hrZones';
import { trimp, paceLoad, effortBand } from './lib/analytics/load';
import { getRunSurface, setRunSurface, type Surface } from './lib/wearModel';
import { parseRoute, LatLon } from './lib/route';
import { CourseMap } from './CourseMap';
import { RunSplits, Split } from './RunSplits';
import { buildSplits } from './lib/splits';
import { buildShareCardModel } from './lib/shareCard';
import { exportGpx } from './lib/gpx';
import { maskDuration, maskDate, validateRunForm, type RunFormErrors } from './lib/inputMask';
import ShareCardPicker from './ShareCardPicker';

// ── manual-run / edit form helpers ──────────────────────────────────────────
// 소요 시간 입력은 'MM:SS'·'H:MM:SS'(또는 분 단위 숫자)를 초로 변환한다. 빈 값/파싱 불가 → 0.
// 'H:MM:SS' 3분절도 받는 이유: 사용자가 시간 단위가 붙은 문자열(앱 전역 시간 표기와 동일한
// 형태)을 손으로 넣어도 라운드트립(문자열→초)이 깨지지 않게 하기 위함이다. 프리필 자체는
// MM:SS-total(fmtDurationInput)이라 보통 2분절 경로를 타며, 그 계산은 기존과 동일하다.
function parseDurationInput(text: string): number {
  const t = (text || '').trim();
  if (!t) return 0;
  if (t.includes(':')) {
    const parts = t.split(':');
    const n = (x: string) => { const v = parseInt(x, 10); return Number.isFinite(v) ? v : 0; };
    if (parts.length >= 3) {
      // H:MM:SS — fmtTime 시간 표기를 되돌려 읽는다.
      return Math.max(0, n(parts[0]) * 3600 + n(parts[1]) * 60 + n(parts[2]));
    }
    return Math.max(0, n(parts[0]) * 60 + n(parts[1]));
  }
  const mins = parseFloat(t);
  return Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : 0;
}
// 초 → 편집 폼 프리필 문자열 'MM:SS-total'(분 무패딩, 1시간↑는 분이 60 초과: 3900s→'65:00').
// fmtTime(H:MM:SS)으로 대체하지 않는다 — 입력 마스크(maskDuration)는 MM:SS(콜론 1개)만 다뤄
// 'H:MM:SS' 프리필을 편집 첫 타건에 collapse(예 '1:05:00'→'10:50')시켜 duration 을 손상시킨다.
// 이 MM:SS-total 표기는 maskDuration 과 왕복 안정(예 '65:00'→digits'6500'→'65:00')하다.
// 0 이하면 빈칸(프리필 없음). parseDurationInput 은 MM:SS·H:MM:SS 둘 다 되돌려 읽는다.
function fmtDurationInput(sec: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 노면(surface) 선택 옵션 — 실효 마모 보정용(트레일>로드, 트랙·트레드밀<로드). 기본
// road. 토큰화 칩 세그먼트로 고르고 AsyncStorage(surface_<runId>)에 영속한다(lib/wearModel).
const SURFACE_OPTIONS: { value: Surface; label: string }[] = [
  { value: 'road', label: '로드' },
  { value: 'trail', label: '트레일' },
  { value: 'track', label: '트랙' },
  { value: 'treadmill', label: '트레드밀' },
];

export type PeriodSummary = { km: string; runs: number; pace: string; time: string };
export type PeriodChart = { title: string; data: number[]; labels: string[] };

const PERIODS = ['주', '월', '년', '전체'];
const EMPTY_SUMMARY: PeriodSummary = { km: '0', runs: 0, pace: '--', time: '--' };
// 심박 곡선 접이식 선택 영속 키(심사 #19, 2026-07-22).
const HR_CURVE_OPEN_KEY = 'hr_curve_open_v1';

// ── bar chart with right-side km gridlines ────────────────────────────────────
export function PeriodChartView({ data, labels, unit }: { data: number[]; labels: string[]; unit: Unit }) {
  const H = 124;
  const max = Math.max(...data, 1);
  const niceStep = (mx: number) => {
    const rough = mx / 3, pow = Math.pow(10, Math.floor(Math.log10(rough))), n = rough / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  };
  const step = niceStep(max);
  const niceMax = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + 1e-6; v += step) ticks.push(v);
  const dense = data.length > 7;
  const fmtTick = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  // 평균(활동한 기간만) — Nike 식 점선 기준선. 빈 주/월은 평균을 끌어내리므로 제외한다.
  const active = data.filter((v) => v > 0);
  const avg = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
  const [sel, setSel] = useState<number | null>(null);

  return (
    <View>
      <View style={{ height: H, position: 'relative' }}>
        {ticks.map((tk, i) => (
          <View key={i} style={[s.chartGrid, { bottom: (tk / niceMax) * H }]}>
            <View style={s.chartGridLine} />
            <Text style={s.chartTick}>{tk === 0 ? '0' : `${fmtTick(tk)}${unit}`}</Text>
          </View>
        ))}
        <View style={[s.chartBars, { gap: dense ? 4 : 8 }]}>
          {data.map((v, i) => {
            const bh = v <= 0 ? 0 : Math.max(4, (v / niceMax) * H);
            const on = sel === i;
            const dim = sel != null && !on;
            return (
              <Pressable key={i} style={s.chartBarSlot} onPress={() => setSel(on ? null : i)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${labels[i]} ${fmtTick(v)}${unit}`}>
                {/* 값을 막대 위에 상시 표기 — 주·월·년 모두(년도 12칸도 표시). 둥근 막대라
                    몇 km 인지 헷갈리던 지적 해소. 촘촘하면 폰트만 줄여 겹침을 최소화. */}
                {v > 0 && (
                  <View style={[s.chartTipWrap, { bottom: bh + 3 }]} pointerEvents="none">
                    <Text style={[s.chartBarVal, dense && { fontSize: rf(9) }, on && { color: T1 }]}>{fmtTick(v)}</Text>
                  </View>
                )}
                {/* 막대: 윗모서리만 라운드(직사각형 — 값 읽기 쉽게). 아래는 각지게. */}
                <View style={[s.chartBar, { maxWidth: dense ? 12 : 18, height: bh, backgroundColor: dim ? withAlpha(BRAND, 0.28) : BRAND }]} />
              </Pressable>
            );
          })}
        </View>
        {/* 평균 점선(Nike 식) — 활동 기간 평균 거리. 오른쪽에 값.
            구현은 Svg strokeDasharray(심박 그래프 평균선과 동일 문법) — 구 View 한 변
            dashed 보더는 iOS 에서 기간별로 실선/점선이 오락가락했다(2026-07-25 민우님
            실기기 제보: 주·월 실선 vs 년 점선). */}
        {avg > 0 && (
          <View style={[s.chartAvgLine, { bottom: (avg / niceMax) * H }]} pointerEvents="none">
            <Svg style={{ flex: 1 }} height={2}>
              <SvgLine x1={0} y1={1} x2="100%" y2={1} stroke={withAlpha(T1, 0.4)} strokeWidth={1} strokeDasharray="4 5" />
            </Svg>
            <Text style={s.chartAvgVal}>{fmtTick(avg)}</Text>
          </View>
        )}
      </View>
      {/* 축 라벨은 T3(라벨·보조=회색 캔온) — 인라인 T1 승격이 값(막대·숫자)과 위계가
          뭉개지던 것 회수(검수 MED, 2026-07-16). */}
      <View style={[s.chartLabels, { gap: dense ? 4 : 8 }]}>
        {labels.map((l, i) => (
          <Text key={i} style={[s.chartLabel, { fontSize: dense ? 9 : 11 }]}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

// ── course map ────────────────────────────────────────────────────────────────
// 코스 지도는 공용 CourseMap 컴포넌트로 추출됨(러닝 완료 리캡과 공유) — CourseMap.tsx.

// ── manual-run input / run edit form ────────────────────────────────────────
// 한 폼으로 '수동 입력'(initial=null)과 '편집'(initial=Run)을 모두 처리한다. 거리는
// 표시 단위(km|mi)로 입력받아 displayToKm로 저장 표준 km으로 되돌리고, 시간은 'MM:SS'를
// 초로, 날짜는 'YYYY-MM-DD'로 받는다. 신발은 칩으로 고른다(편집 시 원래 신발이 프리필).
// 수동 추가/편집 폼. initial=null → 추가 모드. 외부 노출은 수용 테스트가 폼 자체(KeyboardAvoiding
// View·인라인 검증)를 직접 검증하기 위함(추가 진입 버튼은 e67930f 에서 제거됨 — 폼은 편집에 잔존).
export function RunForm({
  shoes, unit, initial, onCancel, onSubmit,
}: {
  shoes: Shoe[];
  unit: Unit;
  initial?: Run | null;
  onCancel: () => void;
  onSubmit: (v: { shoeId: string; km: number; date: string; durationSec: number; surface: Surface }) => void;
}) {
  const editing = !!initial;
  const initShoeId = editing && initial!.shoe >= 0 ? shoes[initial!.shoe]?.id : undefined;
  const [shoeId, setShoeId] = useState<string | undefined>(initShoeId ?? shoes[0]?.id);
  const [dist, setDist] = useState(editing ? String(displayNum(initial!.dist, unit, 2)) : '');
  const [dur, setDur] = useState(editing ? fmtDurationInput(initial!.durationS || 0) : '');
  const [date, setDate] = useState(editing ? (initial!.runDate || '') : ymdLocal(new Date()));
  // 검증 에러는 제출 시 채워지고 필드 아래 빨강 헬퍼텍스트로 표시된다(Alert 대체).
  // 해당 필드를 다시 건드리면 그 필드 에러만 즉시 지워 사용자 흐름을 막지 않는다.
  const [errors, setErrors] = useState<RunFormErrors>({});
  const clearError = (k: keyof RunFormErrors) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  // 노면 태그(실효 마모 보정). 편집 시 영속값을 프리필하고, 칩을 누르면 편집 런은 즉시
  // 영속(setRunSurface)한다. 수동 추가는 런 id가 아직 없으므로 제출 시 onSubmit으로
  // 올려 App이 새 런 id에 영속한다. 기본 road(미선택/미태그도 road로 동작 — 차단 아님).
  const editId = editing ? initial!.id : undefined;
  const [surface, setSurface] = useState<Surface>('road');
  useEffect(() => {
    let alive = true;
    if (editId) {
      getRunSurface(editId).then((s) => { if (alive) setSurface(s); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [editId]);
  const pickSurface = (s: Surface) => {
    setSurface(s);
    if (editId) void setRunSurface(editId, s); // 편집 런은 즉시 영속(추가 런은 제출 시)
  };

  // 제출 시 한 번에 검증한다. 에러가 있으면 Alert 대신 필드 아래 인라인 헬퍼텍스트로
  // 표시하고 멈춘다(거리 0/비정상값·날짜 형식 인라인 차단). 통과 시에만 onSubmit.
  const submit = () => {
    const errs = validateRunForm({ shoeId, dist, date });
    setErrors(errs);
    if (errs.shoe || errs.dist || errs.date) return;
    onSubmit({ shoeId: shoeId!, km: displayToKm(parseFloat(dist), unit), date, durationSec: parseDurationInput(dur), surface });
  };

  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <AmbientBackdrop />
      <View style={[s.nav, s.navRow]}>
        <Pressable onPress={onCancel} hitSlop={6} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}><Ionicons name="chevron-back" size={ri(ICON.action)} color={T1} /></Pressable>
        <Text style={s.formTitle}>{editing ? '러닝 편집' : '수동 기록 추가'}</Text>
        <View style={s.iconBtn} />
      </View>
      {/* 키보드가 입력칸·저장 버튼을 가리지 않게 폼 전체를 KeyboardAvoidingView로 감싼다
          (iOS=padding, Android는 windowSoftInputMode adjustResize에 맡겨 undefined). */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 8}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: rs(18), paddingBottom: rv(40), gap: rv(18) }} keyboardShouldPersistTaps="handled">
        {/* 신발 선택 */}
        <View>
          <Text style={s.formLabel}>신발</Text>
          {shoes.length === 0 ? (
            <Text style={s.formHint}>먼저 신발을 등록하세요</Text>
          ) : (
            <View style={s.chipWrap}>
              {shoes.map((sh, i) => {
                const on = sh.id === shoeId;
                return (
                  <Chip
                    key={sh.id || i}
                    label={`${sh.brand} ${sh.model}`}
                    selected={on}
                    onPress={() => { if (sh.id) { setShoeId(sh.id); clearError('shoe'); } }}
                  />
                );
              })}
            </View>
          )}
          {!!errors.shoe && <Text style={s.errText} accessibilityLabel="신발 오류">{errors.shoe}</Text>}
        </View>
        {/* 거리 */}
        <View>
          <Text style={s.formLabel}>거리 ({unit})</Text>
          <Input
            value={dist}
            onChangeText={(t) => { setDist(t); clearError('dist'); }}
            keyboardType="decimal-pad"
            placeholder={`예: 5.0`}
            style={!!errors.dist && s.inputErr}
            accessibilityLabel="거리"
          />
          {!!errors.dist && <Text style={s.errText} accessibilityLabel="거리 오류">{errors.dist}</Text>}
        </View>
        {/* 시간 — 숫자만 받아 MM:SS로 자동 마스킹(JS-only, 네이티브 피커 없음). */}
        <View>
          <Text style={s.formLabel}>시간 (MM:SS)</Text>
          <Input
            value={dur}
            onChangeText={(t) => setDur(maskDuration(t))}
            keyboardType="number-pad"
            placeholder="예: 30:00 (선택)"
            accessibilityLabel="시간"
          />
        </View>
        {/* 날짜 — 숫자만 받아 YYYY-MM-DD로 자동 하이픈 삽입(JS-only, 네이티브 피커 없음). */}
        <View>
          <Text style={s.formLabel}>날짜 (YYYY-MM-DD)</Text>
          <Input
            value={date}
            onChangeText={(t) => { setDate(maskDate(t)); clearError('date'); }}
            keyboardType="number-pad"
            placeholder="2026-06-01"
            style={!!errors.date && s.inputErr}
            accessibilityLabel="날짜"
          />
          {!!errors.date && <Text style={s.errText} accessibilityLabel="날짜 오류">{errors.date}</Text>}
        </View>
        {/* 노면 — 실효 마모 보정용 태그(기본 로드). 토큰화 칩 세그먼트. */}
        <View>
          <Text style={s.formLabel}>노면</Text>
          <View style={s.chipWrap}>
            {SURFACE_OPTIONS.map((opt) => {
              const on = opt.value === surface;
              return (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={on}
                  onPress={() => pickSurface(opt.value)}
                  accessibilityLabel={`노면 ${opt.label}`}
                />
              );
            })}
          </View>
        </View>
        <Button label={editing ? '저장하기' : '추가하기'} onPress={submit} style={s.saveBtn} />
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── run detail ────────────────────────────────────────────────────────────────
export function RunDetail({ run, shoe, onBack, unit, onDelete, onEdit, age = 0, sex = 'male', restHR = 0, thresholdPaceSec = 0 }: { run: Run; shoe?: Shoe; onBack: () => void; unit: Unit; onDelete?: (id: string) => void; onEdit?: (run: Run) => void; age?: number; sex?: 'male' | 'female'; restHR?: number; thresholdPaceSec?: number }) {
  // Load the recorded route for this run once. Missing/invalid blob → [] → map
  // stays hidden (graceful). route_<id> is written by App.addRun on save.
  const [route, setRoute] = useState<LatLon[]>([]);
  // 오늘의 한 컷(runphoto_<id> 사이드카 — 기기 로컬 전용, 결측 graceful).
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!run.id) { setPhotoUri(null); return; }
    AsyncStorage.getItem('runphoto_' + run.id)
      .then(u => { if (alive) setPhotoUri(u || null); })
      .catch(() => { if (alive) setPhotoUri(null); });
    return () => { alive = false; };
  }, [run.id]);
  useEffect(() => {
    let alive = true;
    if (!run.id) { setRoute([]); return; }
    // 사이드카(route_<id>)는 로컬 전용이라 클라우드 동기화로 옮겨지지 않는다 — 다른
    // 기기/재설치에서 지도가 사라지던 원인(2026-07-04 사용자 리포트). 레코드 안의
    // route(동기화됨)로 폴백해 어느 기기에서든 코스가 보인다.
    AsyncStorage.getItem('route_' + run.id)
      .then(raw => {
        if (!alive) return;
        const side = parseRoute(raw);
        setRoute(side.length >= 2 ? side : parseRoute((run as any).route));
      })
      .catch(() => { if (alive) setRoute(parseRoute((run as any).route)); });
    return () => { alive = false; };
    // route 는 run.id 로만 재로드 — 레코드는 id 기준 불변이라 (run as any).route 는 안정적.
    // 전체 run 을 dep 에 넣으면 매 렌더 재로드된다(의도적 granular dep).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);
  // 레코더가 1km 통과 시각으로 남긴 실측 구간 스플릿(splits_<id>, App.onSave가 영속).
  // 경로엔 타임스탬프가 없어 못 만들던 '실제' 구간 페이스다. 없으면 [] → RunSplits 자동 숨김.
  const [recordedSplits, setRecordedSplits] = useState<Split[]>([]);
  useEffect(() => {
    let alive = true;
    if (!run.id) { setRecordedSplits([]); return; }
    AsyncStorage.getItem('splits_' + run.id)
      .then(raw => {
        if (!alive) return;
        try {
          const arr = raw ? JSON.parse(raw) : [];
          setRecordedSplits(Array.isArray(arr) ? arr : []);
        } catch { setRecordedSplits([]); }
      })
      .catch(() => { if (alive) setRecordedSplits([]); });
    return () => { alive = false; };
  }, [run.id]);
  // 트랙 세션 마커(track_<id>, App.onSave가 영속) — {lapM, laps, lapTimes(랩 완료 경과초)}.
  // 있으면 이 런은 트랙 모드 → per-km 스플릿 대신 랩별 표를 보여준다(없으면 null → 일반 처리).
  const [trackMeta, setTrackMeta] = useState<{ lapM: number; laps: number; lapTimes: number[] } | null>(null);
  useEffect(() => {
    let alive = true;
    if (!run.id) { setTrackMeta(null); return; }
    AsyncStorage.getItem('track_' + run.id)
      .then(raw => {
        if (!alive) return;
        try {
          const o = raw ? JSON.parse(raw) : null;
          if (o && typeof o.lapM === 'number' && Array.isArray(o.lapTimes)) {
            setTrackMeta({ lapM: o.lapM, laps: typeof o.laps === 'number' ? o.laps : o.lapTimes.length, lapTimes: o.lapTimes });
          } else setTrackMeta(null);
        } catch { setTrackMeta(null); }
      })
      .catch(() => { if (alive) setTrackMeta(null); });
    return () => { alive = false; };
  }, [run.id]);
  // 랩별 스플릿 — 누적 랩시각을 구간(랩)시간으로 환산하고 랩거리로 km당 페이스를 낸다.
  const lapRows = useMemo(() => {
    if (!trackMeta) return [] as { lap: number; split: number; paceSec: number }[];
    const lm = trackMeta.lapM; const lt = trackMeta.lapTimes;
    const rows: { lap: number; split: number; paceSec: number }[] = [];
    let prev = 0;
    for (let i = 0; i < lt.length; i++) {
      const split = Math.max(0, lt[i] - prev); prev = lt[i];
      rows.push({ lap: i + 1, split, paceSec: lm > 0 ? split / (lm / 1000) : 0 });
    }
    return rows;
  }, [trackMeta]);
  // GAP(경사보정페이스)용 (거리,경과초,고도) 시계열(gapTrack_<id>, App.onSave가 영속). 있으면
  // 스무딩→지형스케일 빈평균→Minetti 로 평지 등가 페이스를 낸다. 없으면(옛 런/평지/고도無) null.
  const [gapTrack, setGapTrack] = useState<{ d: number; t: number; e: number }[]>([]);
  useEffect(() => {
    let alive = true;
    if (!run.id) { setGapTrack([]); return; }
    AsyncStorage.getItem('gapTrack_' + run.id)
      .then(raw => {
        if (!alive) return;
        try {
          const arr = raw ? JSON.parse(raw) : [];
          setGapTrack(Array.isArray(arr) ? arr : []);
        } catch { setGapTrack([]); }
      })
      .catch(() => { if (alive) setGapTrack([]); });
    return () => { alive = false; };
  }, [run.id]);
  // 정밀 GAP: 표본주파수 노이즈를 스무딩+빈평균으로 누른 뒤 경사보정. 고도변화 없으면 실제
  // 평균페이스와 같아(항등) 굳이 노출 안 함 — 실제 페이스(초/km)와 1초 이상 다를 때만 보여준다.
  const gapSec = useMemo(() => {
    if (gapTrack.length < 2) return null;
    const g = gradeAdjustedPaceSec(resampleByDistance(smoothElevation(gapTrack, 60), 0.1));
    if (g == null) return null;
    const actual = (run.durationS || 0) > 0 && run.dist > 0 ? (run.durationS || 0) / run.dist : 0;
    if (actual > 0 && Math.abs(g - actual) < 1) return null; // 평지(차이 미미)면 숨김
    return Math.round(g);
  }, [gapTrack, run.durationS, run.dist]);
  // 심박 시계열(hrTrack_<id>, App.onSave 가 워치 HR 을 영속). 있으면 HR존 분포·평균/최대·
  // 트레이닝효과(TRIMP)를 산출한다. 워치 미연동이면 빈값 → 카드 자동 숨김.
  const [hrTrack, setHrTrack] = useState<{ t: number; bpm: number }[]>([]);
  // 심박 곡선 접이식(심사 #19) — 기본 펼침, 사용자의 마지막 선택을 영속.
  const [hrCurveOpen, setHrCurveOpen] = useState(true);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(HR_CURVE_OPEN_KEY)
      .then(v => { if (alive && v === '0') setHrCurveOpen(false); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    if (!run.id) { setHrTrack([]); return; }
    AsyncStorage.getItem('hrTrack_' + run.id)
      .then(raw => {
        if (!alive) return;
        try {
          const arr = raw ? JSON.parse(raw) : [];
          setHrTrack(Array.isArray(arr) ? arr : []);
        } catch { setHrTrack([]); }
      })
      .catch(() => { if (alive) setHrTrack([]); });
    return () => { alive = false; };
  }, [run.id]);
  // 심박 분석 — 최대심박은 나이(Tanaka)로 추정(미설정이면 190 폴백), 안정심박 있으면 Karvonen.
  // 표본 2개 미만이면 null → 카드 숨김.
  const hr = useMemo(() => {
    if (hrTrack.length < 2) return null;
    const maxHR = estimateMaxHR(age);
    const rest = restHR > 0 ? restHR : undefined;
    const secs = timeInZones(hrTrack, maxHR, rest);
    const total = (Object.values(secs) as number[]).reduce((a, b) => a + b, 0);
    if (!(total > 0)) return null;
    const { avg, max } = hrSummary(hrTrack);
    // 트레이닝효과(TRIMP) — 안정심박이 있어야 여유심박 비율이 정확(없으면 미표시).
    const load = rest ? trimp(total, avg, maxHR, rest, sex) : 0;
    return { secs, total, avg, max, maxHR, rest, load, bounds: zoneBoundaries(maxHR, rest) };
  }, [hrTrack, age, restHR, sex]);
  // 이 러닝의 트레이닝 부하(스트라바 'Relative Effort') — 심박(안정심박 有)이면 TRIMP,
  // 아니면 페이스 기반 rTSS(임계페이스 기준). 둘 다 불가(타임·체력 없음)면 null → 카드 숨김.
  const effort = useMemo(() => {
    const hrLoad = hr && hr.load > 0 ? hr.load : 0;
    const score = hrLoad > 0 ? hrLoad : paceLoad(run.dist, run.durationS || 0, thresholdPaceSec);
    if (!(score > 0)) return null;
    return { score, band: effortBand(score), method: hrLoad > 0 ? 'HR' : 'pace' as const };
  }, [hr, run.dist, run.durationS, thresholdPaceSec]);

  // 공유 입력(텍스트·카드 폴백이 같은 필드를 쓰도록 단일 출처로 둔다).
  const shareInput = {
    distKm: run.dist,
    unit,
    pace: run.pace,
    time: run.time,
    durationS: run.durationS,
    shoeBrand: shoe?.brand,
    // 신발 객체가 없으면(삭제된 신발) run.shoeName(묘비 포함)을 그대로 카드 신발명으로 쓴다.
    shoeModel: shoe ? shoe.model : (run.shoeName || ''),
    date: `${run.date} ${run.day}요일`,
    // 6지표 카드용 — 칼로리·케이던스·심박(워치)·고도.
    calories: run.cal, cadence: run.cadence, bpm: run.bpm, elevM: run.elev,
  };
  // 공유 카드는 배경 없는 투명 PNG(스트라바 방식) — 사진앱에 저장 후, 인스타 스토리에서
  // 사용자가 자기 사진 위에 스티커로 얹는다. '공유 시트로'는 RN Share 폴백(캡처 실패 시 텍스트).
  const cardModel = buildShareCardModel(shareInput);
  // 공유 = 선택기 시트(여러 템플릿·포맷·배경·크기). 저장/공유는 선택기가 담당한다.
  const [shareOpen, setShareOpen] = useState(false);
  // GPX 내보내기(2026-07-05) — 경로가 있을 때만 옵션 노출. '내 데이터는 내 것'
  // (가민/스트라바 이관·아카이빙). exportGpx 는 no-throw — 사유만 안내한다.
  // GPX 내보내기(2026-07-05) — 감정적 공유(사진·완성본)와 데이터 이관은 서로 다른 의도라
  // 공유 시트에서 빼고 상세 하단의 조용한 진입점으로 옮겼다(2026-07-05 결정, 가민/스트라바
  // 문법: 공유는 SNS, GPX 내보내기는 설정/더보기). 경로 2점↑일 때만 노출.
  const exportRouteGpx = async () => {
    if (!run.id) return;
    const label = shoe ? `${shoe.brand} ${shoe.model}` : run.shoeName || 'Keego Run';
    const r = await exportGpx(run.id, route, { name: `${run.date} · ${label}`, timeISO: run.runDate || undefined });
    if (!r.ok && r.reason === 'no_route') showDialog('내보낼 코스가 없어요', 'GPS로 기록된 러닝만 GPX로 내보낼 수 있어요.');
    else if (!r.ok) showDialog('내보내지 못했어요', '잠시 후 다시 시도해 주세요.');
  };
  const onShareCard = () => setShareOpen(true);
  // 삭제는 확인 Alert로 보호한다(파괴 방지). 삭제 시 신발 사용거리도 줄어듦을 안내한다.
  const confirmDelete = () => {
    showDialog(
      '러닝 기록 삭제',
      `${run.date} ${displayNum(run.dist, unit, 2)}${unit} 기록을 삭제할까요?\n삭제하면 신발 사용 거리도 함께 줄어들어요.`,
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => { if (run.id) onDelete?.(run.id); onBack(); } },
      ],
    );
  };
  const dash = (n: number, u: string) => (n > 0 ? { v: String(n), u } : { v: '--', u: '' });
  // 메트릭 한 카드(디자인 11): 2x3 — 시간·평균페이스·칼로리 / 케이던스·누적고도·평균심박.
  // 평균 심박(bpm)은 사용자 요청으로 노출한다(데이터 있으면 값, 없으면 '--' — 칼로리/고도와
  // 동일 규약). BLE 심박 연동(Phase 3-2) 전엔 대부분 '--'지만 측정되면 자동 표시. 과거
  // spec #15 'HR UI 숨김'은 제품 결정으로 철회(데이터 보존 가드는 유지).
  const stats = [
    { l: '시간', v: run.time, u: '' },
    { l: '평균 페이스', v: run.pace, u: '/km' },
    { l: '칼로리', ...dash(run.cal, 'kcal') },
    { l: '케이던스', ...dash(run.cadence, 'spm') },
    { l: '상승 고도', ...dash(run.elev, 'm') },
    { l: '평균 심박', ...dash(run.bpm, 'bpm') },
  ];
  const insets = useSafeAreaInsets();
  return (
    // 엣지 스와이프 백 — 왼쪽 가장자리 우측 드래그로 기록 목록 복귀(iOS pop 제스처 대응).
    <SwipeBack onBack={onBack}>
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <AmbientBackdrop />
      <View style={[s.nav, s.navRow]}>
        <Pressable onPress={onBack} hitSlop={6} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}><Ionicons name="chevron-back" size={ri(ICON.action)} color={T1} /></Pressable>
        <View style={s.navActions}>
          <Pressable onPress={onShareCard} hitSlop={6} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="공유" testID="detail-share">
            <Ionicons name="share-outline" size={ri(ICON.action)} color={ACCENT} />
          </Pressable>
          {!!onEdit && !!run.id && (
            <Pressable onPress={() => onEdit(run)} hitSlop={6} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="편집" testID="detail-edit">
              <Ionicons name="create-outline" size={ri(ICON.action)} color={ACCENT} />
            </Pressable>
          )}
          {!!onDelete && (
            <Pressable onPress={confirmDelete} hitSlop={6} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="삭제">
              <Ionicons name="trash-outline" size={ri(ICON.action)} color={DANGER} />
            </Pressable>
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: rs(18), paddingBottom: rv(28) }}>
        {/* 신발(브랜드+모델)을 카드 없이 맨 위에 — 이 런의 '제목'처럼(사용자 요청). */}
        {shoe ? (
          <View style={{ marginBottom: rv(14) }}>
            <Text style={s.detailBrand}>{shoe.brand}</Text>
            <Text style={s.detailModel}>{shoe.model}</Text>
          </View>
        ) : (run.shoeName ? (
          // 삭제된 신발 — 목록 카드(RunCard)처럼 묘비 신발명을 제목으로 살려 런의 정체성을 보존한다.
          <View style={{ marginBottom: rv(14) }}>
            <Text style={s.detailBrand}>삭제된 신발</Text>
            <Text style={s.detailModel} numberOfLines={1}>{run.shoeName}</Text>
          </View>
        ) : null)}
        <Text style={[s.detailDate, { marginLeft: rs(8) }]}>{run.date} {run.day}요일</Text>
        <View style={[s.baselineRow, { marginTop: rv(8), marginLeft: rs(3) }]}>
          <Text maxFontSizeMultiplier={FONT_SCALE_CAP_HERO} style={s.detailDist}>{displayNum(run.dist, unit, 2)}</Text>
          <Text style={s.detailDistU}>{unit}</Text>
        </View>
        {/* 메트릭 한 카드(디자인 11): 2x3 그리드(값 위 · 라벨 아래, 좌측 정렬) — StatGrid.
            StatGrid 는 자식 삽입이 안 되므로 카드 래퍼가 헤어라인(GlassEdge)을 소유한다. */}
        <View style={[s.card, { marginTop: rv(16) }]}>
          <GlassEdge glints={false} radius={RADIUS.lg} />
          <StatGrid
            inset="card"
            columns={3}
            align="left"
            // 히어로 거리 아래 보조 그리드 → NUMERIC sm(사이트별 타이포 복원 prop 회수, 2026-07-25).
            size="sm"
            items={stats.map((x) => ({ value: x.v, unit: x.u ? ` ${x.u}` : undefined, label: x.l }))}
          />
        </View>
        {/* 이 러닝의 성격 — 트레이닝 부하 + 경사 보정 페이스를 한 카드 2행으로(간결화 A1,
            2026-07-26). 둘 다 '제목+설명 / 우측 큰 숫자'라는 같은 골격이라, 같은 모양의
            카드가 연달아 오면 위계가 아니라 반복으로 읽혔다. 각 행은 데이터가 있을 때만
            렌더하고(둘 다 없으면 카드 자체가 안 뜬다), 둘 다 있을 때만 헤어라인으로 나눈다. */}
        {(effort || gapSec != null) && (() => {
          const actual = (run.durationS || 0) > 0 && run.dist > 0 ? (run.durationS || 0) / run.dist : 0;
          const harder = gapSec != null && actual > 0 && gapSec < actual; // GAP 가 더 빠름 = 오르막 코스
          const fmtPace = (sec: number) => {
            let s = Math.round(sec % 60), m = Math.floor(sec / 60);
            if (s === 60) { s = 0; m += 1; }  // 자리올림 — 안 하면 "5'60\"" 표기(gapSec 는 소수)
            return `${m}'${String(s).padStart(2, '0')}"`;
          };
          return (
            <View style={[s.card, { paddingHorizontal: rs(16), paddingVertical: rv(14), marginTop: rv(12) }]}>
              <GlassEdge glints={false} radius={RADIUS.lg} />
              {/* 트레이닝 부하(스트라바 Relative Effort) — 이 러닝이 얼마나 힘들었나. 심박 있으면
                  TRIMP, 없으면 페이스 기반 rTSS. 타임·체력 정보가 없어 산출 불가면 숨김. */}
              {effort && (
                <View
                  style={s.effortRow}
                  accessible accessibilityLabel={`트레이닝 부하 ${effort.score}, ${effort.band}`}>
                  <View style={{ flex: 1, paddingRight: rs(12) }}>
                    <Text style={s.cardTitle}>트레이닝 부하</Text>
                    <Text style={{ color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(3) }}>
                      {effort.method === 'HR' ? '심박 기반 — 이 러닝의 체감 강도' : '페이스 기반 — 체력 대비 이 러닝의 강도'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '700' }}>{effort.score}</Text>
                    <Text style={{ color: ACCENT, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700' }}>{effort.band}</Text>
                  </View>
                </View>
              )}
              {effort && gapSec != null && <View style={s.effortDivider} />}
              {/* 경사 보정 페이스(GAP, Strava식) — 오르내림을 평지 등가로 환산. 고도 시계열이 있고
                  평지와 유의미하게 다를 때만 노출(평지면 실제 페이스와 같아 중복이라 숨김).
                  제목의 '(GAP)' 괄호는 뗐다 — 바로 아래 설명 줄이 이미 뜻을 말한다. */}
              {gapSec != null && (
                <View
                  style={s.effortRow}
                  accessible accessibilityLabel={`경사 보정 페이스 GAP, 킬로미터당 ${fmtPace(gapSec)}`}>
                  <View style={{ flex: 1, paddingRight: rs(12) }}>
                    <Text style={s.cardTitle}>경사 보정 페이스</Text>
                    <Text style={{ color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(3) }}>
                      {harder ? '오르막 코스 — 평지였다면 이 페이스' : '내리막 이득을 평지 기준으로 환산'}
                    </Text>
                  </View>
                  <Text style={{ color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '700' }}>
                    {fmtPace(gapSec)}<Text style={{ fontSize: TYPE.caption.fontSize, color: T3, fontWeight: '500' }}> /km</Text>
                  </Text>
                </View>
              )}
            </View>
          );
        })()}
        {/* 심박 존 — 워치 심박(hrTrack)이 있을 때만. 존별 구간시간 + 평균/최대 + 트레이닝효과(TRIMP).
            나이(최대심박 추정)·안정심박(Karvonen)이 있으면 더 정확. 없어도 190 폴백으로 동작. */}
        {hr && (() => {
          const fmtT = (sec: number) => { const m = Math.floor(sec / 60); const ss = Math.round(sec % 60); return `${m}:${String(ss).padStart(2, '0')}`; };
          return (
            <View
              style={[s.card, { paddingHorizontal: rs(16), paddingVertical: rv(16), marginTop: rv(12) }]}>
              <GlassEdge glints={false} radius={RADIUS.lg} />
              {/* accessible 붕괴 제거(2026-07-05 a11y): 카드를 한 요소로 묶으면 Z1~Z5
                  존별 체류 시간이 낭독 안 됐다. 제목·평균/최대·각 존 행이 텍스트라
                  개별 낭독되게 둔다(존 색은 Z{n} 라벨·시간 텍스트로 병기됨). */}
              {/* 헤더 탭 = 곡선 접기/펼치기(심사 #19, 2026-07-22) — 곡선과 존 막대가 한
                  데이터의 이중 표현이라, 밀도를 스스로 고를 수 있게 곡선을 접이식으로.
                  기본 펼침 + 선택 영속(다음 상세에서도 내 선택 유지). 존 막대는 항상 표시. */}
              <Pressable
                onPress={() => { const v = !hrCurveOpen; setHrCurveOpen(v); void AsyncStorage.setItem(HR_CURVE_OPEN_KEY, v ? '1' : '0').catch(() => {}); }}
                accessibilityRole="button"
                accessibilityLabel={hrCurveOpen ? '심박 그래프 접기' : '심박 그래프 펼치기'}
                accessibilityState={{ expanded: hrCurveOpen }}
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(4) }}>
                  <Text style={s.cardTitle}>심박 존</Text>
                  {hrTrack.length >= 2 && (
                    <Ionicons name={hrCurveOpen ? 'chevron-up' : 'chevron-down'} size={ri(ICON.tag)} color={T3} />
                  )}
                </View>
                <Text style={{ color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize }}>
                  평균 <Text style={{ color: T1, fontWeight: '700' }}>{hr.avg}</Text> · 최대 <Text style={{ color: T1, fontWeight: '700' }}>{hr.max}</Text> bpm
                </Text>
              </Pressable>
              {/* 심박 곡선(#7) — 존 색 밴드 위 흰 라인. 페이스 곡선과 달리 밴드라는 절대
                  기준이 배경에 깔려 '어느 존인가'가 색으로 즉답된다. hrTrack 2점 이상일 때만. */}
              {hrCurveOpen && hrTrack.length >= 2 && (() => {
                const W = 300, H = 116, L = 4, R = 4, TOP = 6, BOT = 16;
                const bpms = hrTrack.map(p => p.bpm).filter(b => b > 0);
                if (bpms.length < 2) return null;
                const tMax = Math.max(1, hrTrack[hrTrack.length - 1].t);
                const realMax = Math.max(...bpms), realMin = Math.min(...bpms);
                const yMin = Math.max(60, realMin - 8);
                const yMax = realMax + 8;
                const zb = hr.bounds; // {1..5} 하한 bpm
                const zones = [
                  { z: 5 as HRZone, lo: zb[5], hi: yMax }, { z: 4 as HRZone, lo: zb[4], hi: zb[5] },
                  { z: 3 as HRZone, lo: zb[3], hi: zb[4] }, { z: 2 as HRZone, lo: zb[2], hi: zb[3] },
                  { z: 1 as HRZone, lo: yMin, hi: zb[2] },
                ];
                const x = (t: number) => L + (t / tMax) * (W - L - R);
                const y = (b: number) => TOP + (yMax - b) / (yMax - yMin) * (H - TOP - BOT);
                const path = hrTrack.filter(p => p.bpm > 0)
                  .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.bpm).toFixed(1)}`).join('');
                // x축 km 눈금 — gapTrack(거리·시간)으로 각 km 통과 시각을 찾아 매핑. '몇 km에
                // 심박 몇'을 읽게 세로 그리드라인 + km 라벨. gapTrack 없으면(옛 런/평지) 생략.
                const totalKm = Math.floor(Number(run.dist) || 0);
                const kmTicks: { km: number; t: number; xPct: number }[] = [];
                if (gapTrack.length >= 2) {
                  for (let k = 1; k <= totalKm; k++) {
                    const pt = gapTrack.find(p => p.d >= k);
                    if (pt && pt.t > 0 && pt.t <= tMax) kmTicks.push({ km: k, t: pt.t, xPct: (x(pt.t) / W) * 100 });
                  }
                }
                // accessible 로 곡선 전체를 한 요소로 묶고 수치 요약을 낭독한다 —
                // 구 accessibilityElementsHidden 은 자식만 숨기고 자신은 요소가 아니라
                // 라벨이 영원히 안 읽혔다(심박 데이터 0% 전달, 2026-07-24 심사 P0 #6).
                return (
                  <View
                    style={{ marginTop: rv(12) }}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={`심박 곡선 그래프 — 평균 ${hr.avg}, 최고 ${hr.max} bpm`}>
                    <View style={{ position: 'relative', height: H }}>
                      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                        {zones.map(zn => {
                          const lo = Math.max(yMin, zn.lo), hi = Math.min(yMax, zn.hi);
                          if (hi <= yMin || lo >= yMax || hi <= lo) return null;
                          return <SvgRect key={zn.z} x={0} y={y(hi)} width={W} height={Math.max(0, y(lo) - y(hi))} fill={HR_ZONE_COLORS[zn.z]} opacity={0.11} />;
                        })}
                        {kmTicks.map(tk => (
                          <SvgLine key={tk.km} x1={x(tk.t)} y1={TOP} x2={x(tk.t)} y2={H - BOT} stroke={withAlpha(T1, 0.14)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                        ))}
                        {/* 평균 기준선 — 점선. 골짜기(신호 대기 등)가 축 확대 탓에 과장돼 읽히는 것을
                            평균이라는 앵커로 눌러준다(2026-07-18 실기기 피드백). */}
                        {hr.avg > yMin && hr.avg < yMax && (
                          <SvgLine x1={L} y1={y(hr.avg)} x2={W - R} y2={y(hr.avg)} stroke={withAlpha(T1, 0.5)} strokeWidth={1} strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
                        )}
                        <SvgPath d={path} fill="none" stroke={T1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                      </Svg>
                      {/* y축 bpm — 실제 최대(위)·최소(아래). 곡선 위에서도 읽히게 살짝 딤 배경. */}
                      {([[realMax, rv(1)], [realMin, y(realMin) - rv(7)]] as [number, number][]).map(([v, topPx], i) => (
                        <Text key={i} style={{ position: 'absolute', left: rs(2), top: topPx, color: T2, fontFamily: DISPLAY, fontSize: rf(10), fontWeight: '700', fontVariant: ['tabular-nums'], backgroundColor: withAlpha(BG, 0.55), paddingHorizontal: rs(3), borderRadius: rs(3), overflow: 'hidden' }}>{v}</Text>
                      ))}
                      {/* 평균 라벨 — 점선 우측 끝 위. */}
                      {hr.avg > yMin && hr.avg < yMax && (
                        <Text style={{ position: 'absolute', right: rs(2), top: y(hr.avg) - rv(13), color: T2, fontFamily: DISPLAY, fontSize: rf(10), fontWeight: '700', fontVariant: ['tabular-nums'], backgroundColor: withAlpha(BG, 0.55), paddingHorizontal: rs(3), borderRadius: rs(3), overflow: 'hidden' }}>평균 {hr.avg}</Text>
                      )}
                    </View>
                    {/* x축 km 라벨 — 그리드라인과 같은 위치. */}
                    {kmTicks.length > 0 && (
                      <View style={{ height: rv(14), marginTop: rv(2) }}>
                        {kmTicks.map(tk => (
                          <Text key={tk.km} style={{ position: 'absolute', left: `${tk.xPct}%`, marginLeft: rs(-4), color: T3, fontFamily: DISPLAY, fontSize: rf(10), fontVariant: ['tabular-nums'] }}>{tk.km}</Text>
                        ))}
                        <Text style={{ position: 'absolute', right: 0, color: withAlpha(T3, 0.7), fontFamily: FONT, fontSize: rf(10) }}>km</Text>
                      </View>
                    )}
                  </View>
                );
              })()}
              <View style={{ marginTop: rv(12), gap: rv(8) }}>
                {([5, 4, 3, 2, 1] as HRZone[]).map((z) => {
                  const sec = hr.secs[z];
                  const pct = hr.total > 0 ? sec / hr.total : 0;
                  return (
                    <View key={z} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ width: rs(60), color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600' }}>Z{z} {HR_ZONE_LABEL[z]}</Text>
                      <View style={{ flex: 1, height: rs(BAR.md), backgroundColor: withAlpha(T1, 0.06), borderRadius: RADIUS.pill, overflow: 'hidden', marginHorizontal: rs(8) }}>
                        <View style={{ width: `${Math.round(pct * 100)}%`, height: rs(BAR.md), backgroundColor: HR_ZONE_COLORS[z], borderRadius: RADIUS.pill }} />
                      </View>
                      <Text style={{ width: rs(44), textAlign: 'right', color: T2, fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '600' }}>{fmtT(sec)}</Text>
                    </View>
                  );
                })}
              </View>
              {/* TRIMP(트레이닝 부하)는 위 '트레이닝 부하' 카드가 밴드까지 붙여 보여주므로 여기선
                  중복 노출하지 않는다. 심박 존 카드는 '분포 + 평균/최대'에 집중. */}
              {!hr.rest && (
                <Text style={{ color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(8) }}>마이 탭에서 안정시심박을 설정하면 심박 존이 더 정확해져요</Text>
              )}
            </View>
          );
        })()}
        {/* 오늘의 한 컷 + 한 줄 메모(리캡에서 입력 — 2026-07-05). 없으면 자동 숨김. */}
        {!!photoUri && (
          <Image source={{ uri: photoUri }} style={s.runPhoto} resizeMode="cover" testID="run-photo" accessible accessibilityLabel="러닝 사진" />
        )}
        {!!run.memo && (
          <Text style={s.runMemo} testID="run-memo">“{run.memo}”</Text>
        )}
        {/* 달린 위치(경로) 지도 — route_<id> 가 있으면 SVG 코스맵으로 표시(없으면 자동 숨김). */}
        <CourseMap points={route} style={{ marginTop: rv(16) }} />
        {/* 트랙 세션이면 랩별 표(랩 · 페이스바 · km당 페이스 · 랩시간). 아니면 per-km 스플릿. */}
        {trackMeta && lapRows.length >= 1 ? (() => {
          const fmtP = (sec: number) => sec > 0 ? `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"` : '--';
          const fmtT = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
          const paces = lapRows.map(r => r.paceSec).filter(p => p > 0);
          const fastest = paces.length ? Math.min(...paces) : 0;
          return (
            <View style={s.trackCard} accessibilityLabel={`트랙 ${trackMeta.lapM}미터 ${trackMeta.laps}랩`}>
              <GlassEdge glints={false} radius={RADIUS.lg} />
              <View style={s.trackHead}>
                <Text style={s.trackTitle}>트랙 · {trackMeta.lapM}m × {trackMeta.laps}랩</Text>
                <Text style={s.trackSub}>{(trackMeta.laps * trackMeta.lapM / 1000).toFixed(2)}km</Text>
              </View>
              {lapRows.map(r => {
                const rel = fastest > 0 && r.paceSec > 0 ? fastest / r.paceSec : 1; // 빠를수록 1
                return (
                  <View key={r.lap} style={s.lapRow} accessibilityLabel={`${r.lap}랩, 페이스 킬로미터당 ${fmtP(r.paceSec)}, ${fmtT(r.split)}`}>
                    <Text style={s.lapNum}>{r.lap}</Text>
                    <View style={s.lapBarWrap}><View style={[s.lapBarFill, { width: `${Math.max(8, Math.round(rel * 100))}%` }]} /></View>
                    <Text style={s.lapPace}>{fmtP(r.paceSec)}<Text style={s.lapPaceU}> /km</Text></Text>
                    <Text style={s.lapTime}>{fmtT(r.split)}</Text>
                  </View>
                );
              })}
            </View>
          );
        })() : (
          /* 구간별 페이스 스플릿(km · 페이스 바 · 고도). 페이스 곡선(추세)은 개선 시도
             (평균선·눈금·스무딩) 후에도 '봐도 모르겠다'는 실사용 판정으로 제거 확정
             (2026-07-04) — 구간 정보는 이 표의 대비 강화된 막대가 담당한다. */
          <RunSplits splits={recordedSplits.length >= 2 ? recordedSplits : buildSplits(run, route)} />
        )}
        {/* 데이터 내보내기 — 조용한 하단 진입점. 경로가 있는(GPS) 런에서만. 감정적 공유(위
            공유 버튼)와 분리해, 가민/스트라바로 코스를 옮기려는 사람만 찾아 쓴다. */}
        {route.length >= 2 && (
          <Pressable
            onPress={exportRouteGpx}
            accessibilityRole="button"
            accessibilityLabel="GPX 파일로 내보내기, 다른 앱으로 코스 옮기기"
            style={({ pressed }) => [s.gpxRow, pressed && { transform: [{ scale: MOTION.press.scale }], opacity: MOTION.press.opacity }]}>
            <Ionicons name="download-outline" size={ri(ICON.inline)} color={T3} />
            <Text style={s.gpxTxt}>GPX 파일로 내보내기</Text>
            <Text style={s.gpxHint}>다른 앱으로 코스 옮기기</Text>
          </Pressable>
        )}
      </ScrollView>
      {/* 공유 카드 선택기 — 공유 버튼으로 열린다(여러 템플릿·포맷·배경·크기). */}
      <ShareCardPicker visible={shareOpen} onClose={() => setShareOpen(false)} model={cardModel} route={route} shareInput={shareInput} />
    </View>
    </SwipeBack>
  );
}

// ── drum column picker ────────────────────────────────────────────────────────
const DRUM_ITEM_H = 56;
const DRUM_H = DRUM_ITEM_H * 5;

function DrumColumn({ items, selectedIndex, onChange }: {
  items: string[]; selectedIndex: number; onChange: (i: number) => void;
}) {
  const ref = useRef<FlatList<string>>(null);
  const [active, setActive] = useState(selectedIndex);
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollToOffset({ offset: Math.max(0, selectedIndex) * DRUM_ITEM_H, animated: false });
    }, 60);
    return () => clearTimeout(t);
    // 마운트 시 1회 초기 위치로만 스크롤(selectedIndex 변화는 사용자 스크롤이 주도) — 의도된 mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const select = (i: number) => {
    setActive(i); onChange(i);
    ref.current?.scrollToOffset({ offset: i * DRUM_ITEM_H, animated: true });
  };
  return (
    // VoiceOver: 드럼을 adjustable 하나로 묶어 위/아래 스와이프로 값을 조절한다
    // (스크롤 제스처는 VoiceOver 에서 사실상 불가 — increment/decrement 가 유일 경로).
    <View
      style={{ flex: 1, height: DRUM_H }}
      accessible
      accessibilityRole="adjustable"
      accessibilityValue={{ text: items[active] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const dir = e.nativeEvent.actionName === 'increment' ? 1 : e.nativeEvent.actionName === 'decrement' ? -1 : 0;
        if (dir === 0) return;
        const next = Math.max(0, Math.min(items.length - 1, active + dir));
        if (next !== active) select(next);
      }}>
      <View pointerEvents="none" style={{
        position: 'absolute', top: DRUM_ITEM_H * 2, left: 10, right: 10,
        height: DRUM_ITEM_H, backgroundColor: CARD_HI, borderRadius: RADIUS.sm,
      }} />
      <FlatList
        ref={ref}
        data={items}
        keyExtractor={(_, i) => String(i)}
        getItemLayout={(_, i) => ({ length: DRUM_ITEM_H, offset: DRUM_ITEM_H * i, index: i })}
        snapToInterval={DRUM_ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: DRUM_ITEM_H * 2 }}
        extraData={active}
        onMomentumScrollEnd={(e) => {
          const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / DRUM_ITEM_H)));
          setActive(i); onChange(i);
        }}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => select(index)}
            style={{ height: DRUM_ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{
              fontFamily: FONT, fontSize: index === active ? TYPE.heading.fontSize : TYPE.label.fontSize,
              fontWeight: index === active ? '700' : '400',
              color: index === active ? T1 : T3,
            }}>{item}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

// ── history main ────────────────────────────────────────────────────────────
// 런 카드 — 목업 기록(10) 정합: 신발(브랜드/모델) + 날짜(우상단) + 거리·평균페이스·시간.
// 런마다 별도 카드 박스로 띄운다(한 카드 안 행 → 카드별).
export function RunCard({ run, shoes, onPress, unit, hideShoe }: { run: Run; shoes: Shoe[]; onPress?: () => void; unit: Unit; /** 신발 상세용 — 신발명 대신 날짜를 제목 자리에(반복 노이즈 제거). */ hideShoe?: boolean }) {
  const shoe = shoes[run.shoe];
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={`${run.date} ${shoe ? shoe.brand + ' ' + shoe.model : '삭제된 신발'} 기록`} style={({ pressed }) => [s.runCard, pressed && !!onPress && { transform: [{ scale: MOTION.press.scale }], opacity: MOTION.press.opacity }]}>
      <GlassEdge glints={false} radius={RADIUS.lg} />
      <View style={s.runCardTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.runCardBrand} numberOfLines={1}>{hideShoe ? `${run.day}요일` : (shoe ? shoe.brand : '삭제된 신발')}</Text>
          <Text style={s.runCardModel} numberOfLines={1}>{hideShoe ? run.date : (shoe ? shoe.model : '')}</Text>
        </View>
        {!hideShoe && <Text style={s.runCardDate}>{run.date} {run.day}요일</Text>}
      </View>
      <View style={s.runCardMetrics}>
        <View style={s.runCardMetric}><View style={s.baselineRow}><Text style={s.runV}>{displayNum(run.dist, unit, 2)}</Text><Text style={s.runU}>{unit}</Text></View><Text style={s.runML}>거리</Text></View>
        <View style={s.runCardMetric}><Text style={s.runV}>{run.pace}</Text><Text style={s.runML}>평균 페이스</Text></View>
        <View style={s.runCardMetric}><Text style={s.runV}>{run.time}</Text><Text style={s.runML}>시간</Text></View>
      </View>
    </Pressable>
  );
}

export default function HistoryScreen({
  shoes = SHOES, runs = [], summary = {}, chart = {}, onTab, unit = 'km',
  onAddRun, onEditRun, onDeleteRun, onRefresh,
  age = 0, sex = 'male', restHR = 0,
}: {
  shoes?: Shoe[];
  runs?: Run[];
  summary?: Record<string, PeriodSummary>;
  chart?: Record<string, PeriodChart>;
  onTab?: (i: number) => void;
  // 표시 단위(km|mi). 거리·차트 눈금이 이를 따른다(요약·차트 값은 App이 환산해 주입).
  unit?: Unit;
  // 수동 입력/편집/삭제 콜백(App이 백엔드 POST/PATCH/DELETE + 상태를 처리). 거리는 km.
  onAddRun?: (shoeId: string, km: number, date: string, durationSec: number, surface?: Surface) => void;
  onEditRun?: (id: string, fields: { shoe_id?: string; km?: number; run_date?: string; duration?: number }) => void;
  onDeleteRun?: (id: string) => void;
  // 당겨서 새로고침 — 서버 재fetch + pending flush 재시도(App 의 initUser/sync 재진입).
  // RN 내장 RefreshControl 만 사용한다(새 네이티브 0). 미주입이면 RefreshControl 미장착.
  onRefresh?: () => void | Promise<void>;
  // 신체지표(심박존용) — RunDetail 이 hrTrack 과 함께 HR존/평균·최대/트레이닝효과 산출.
  // 0/기본은 미설정(최대심박 190 폴백·%HRmax 모델). App 설정에서 주입.
  age?: number;
  sex?: 'male' | 'female';
  restHR?: number;
  // 오늘 날짜(YYYY-MM-DD) — 체력 트렌드(FitnessCard) VO2max/컨디션 계산 기준. App 이
  // today() 주입. 미주입이면 카드 숨김(표시 전용, 테스트 호환).
  todayISO?: string;
}) {
  const [period, setPeriod] = useState('월');
  // 기록 리스트는 최근 5개만 먼저 — 카드가 수십 개 쏟아지지 않게. '모든 기록'으로 펼친다.
  const [showAllRuns, setShowAllRuns] = useState(false);
  const now = new Date();
  // 월
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth());
  // 주 (0 = 이번 주)
  const [weekOffset, setWeekOffset] = useState(0);
  // 년
  const [selYearYear, setSelYearYear] = useState(now.getFullYear());
  // picker modal
  const [showPicker, setShowPicker] = useState(false);
  const [draftYear, setDraftYear] = useState(now.getFullYear());
  const [draftMonth, setDraftMonth] = useState(now.getMonth());
  const [draftWeekOffset, setDraftWeekOffset] = useState(0);
  const [draftYearYear, setDraftYearYear] = useState(now.getFullYear());
  const [detail, setDetail] = useState<Run | null>(null);
  const [form, setForm] = useState<null | { mode: 'add' } | { mode: 'edit'; run: Run }>(null);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    // 침묵 실패 금지(심사 #50): 오프라인이면 "새 데이터 없음"과 "실패"를 구별 못 하던 것 —
    // 한 줄 토스트로 정직하게. 기록 자체는 로컬-퍼스트라 그대로 보인다.
    try { await onRefresh(); } catch { showToast({message: '오프라인이에요 — 저장된 기록을 보여드려요'}); }
    finally { setRefreshing(false); }
  };
  const insets = useSafeAreaInsets();

  // run_date 를 10자(YYYY-MM-DD)로 정규화한다 — 백엔드/Firestore 가 시간 접미사
  // ('...T09:00:00')를 실으면 주간 범위 필터(d <= 일요일)가 그 날짜 런을 배제해(문자열
  // 비교상 'T..' 가 더 큼) 주간 뷰에서 누락된다. 슬라이스로 월/년 startsWith 경로와 통일.
  const rd = (r: Run) => String((r as any).run_date || r.runDate || '').slice(0, 10);
  // stats 함수는 { km, duration, run_date } 형태를 기대하지만
  // UI Run 객체는 { dist, durationS, runDate }를 쓴다. 두 필드를 모두 커버하도록 매핑.
  const toRow = (r: Run) => ({
    km: (r as any).km ?? r.dist,
    duration: (r as any).duration ?? r.durationS,
    run_date: rd(r),
  });

  // 주
  const getMondayAt = (offset: number) => {
    const d = new Date(now);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) - offset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const selWeekMonday = getMondayAt(weekOffset);
  const selWeekSunday = new Date(selWeekMonday); selWeekSunday.setDate(selWeekMonday.getDate() + 6);
  const selWeekRuns = runs.filter(r => { const d = rd(r); return d >= ymdLocal(selWeekMonday) && d <= ymdLocal(selWeekSunday); });
  const selWeekRows = selWeekRuns.map(toRow);
  const selWeekSummary: PeriodSummary = { ...summaryOf(selWeekRows), km: sumKm(selWeekRows).toFixed(1) };
  const selWeekBuckets = weekBuckets(selWeekRows, selWeekMonday);
  const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

  // 월
  const selMonthPrefix = `${selYear}-${String(selMonth + 1).padStart(2, '0')}`;
  const selMonthRuns = runs.filter(r => rd(r).startsWith(selMonthPrefix));
  const selMonthRows = selMonthRuns.map(toRow);
  const selMonthSummary: PeriodSummary = { ...summaryOf(selMonthRows), km: sumKm(selMonthRows).toFixed(1) };
  const selMonthChartData = monthBuckets(selMonthRows, selYear, selMonth);
  const selMonthWeekCount = selMonthChartData.length;

  // 년
  const selYearRuns = runs.filter(r => rd(r).startsWith(String(selYearYear)));
  const selYearRows = selYearRuns.map(toRow);
  const selYearSummary: PeriodSummary = { ...summaryOf(selYearRows), km: sumKm(selYearRows).toFixed(1) };
  const selYearBuckets = yearBuckets(selYearRows);
  const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

  // 전체 연도별 차트
  const allYearKeys = [...new Set(runs.map(r => rd(r).slice(0, 4)).filter(y => y.length === 4))].sort();
  const allYearsKm = allYearKeys.map(y => sumKm(runs.filter(r => rd(r).startsWith(y)).map(toRow)));
  const allYearsChart = allYearKeys.length > 0 ? { title: '연도별 거리', data: allYearsKm.map(v => displayNum(v, unit, 0)), labels: allYearKeys.map(y => `'${y.slice(2)}`) } : undefined;

  // 체력 트렌드(VO2max + 트레이닝 상태 CTL/ATL/TSB) — '현재 체력'은 기간 토글과 무관하므로
  // 전체 런으로 산출한다. PMC 는 첫 런~오늘 하루씩 도는 루프라 runs 가 바뀔 때만 재계산(useMemo).
  const todayIso = ymdLocal(now);
  const fitness = useMemo(
    () => fitnessSummary(
      runs.map(r => ({ km: (r as any).km ?? r.dist, durationS: (r as any).duration ?? r.durationS, runDate: rd(r) })),
      todayIso,
      { sex }, // 성별 TRIMP 계수 — 개별 런 상세(RunDetail)와 동일 기준(점검 #19 발견 수리)
    ),
    // runs 식별(길이+마지막 런 키)로 캐시 무효화 — 매 렌더 깊은 비교 회피.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs.length, runs[runs.length - 1]?.id, todayIso],
  );
  // 개인 임계페이스(초/km) — 체력(VDOT)에서 역산. per-run 트레이닝 부하(rTSS)의 강도 기준.
  // 타임 있는 노력 런이 없어 vo2max=0 이면 0(그땐 페이스 기반 부하 대신 HR 부하만 가능).
  const thresholdPace = thresholdPaceSec(fitness.vo2max);
  const sum = period === '주' ? selWeekSummary : period === '월' ? selMonthSummary : period === '년' ? selYearSummary : (summary['전체'] || EMPTY_SUMMARY);
  const ch = period === '주'
    ? (selWeekBuckets.some(v => v > 0) ? { title: '일별 거리', data: selWeekBuckets.map(v => displayNum(v, unit, 1)), labels: WEEKDAY_LABELS } : chart['주'])
    : period === '월'
    ? (selMonthChartData.length > 0 ? { title: '주간 거리', data: selMonthChartData.map(v => displayNum(v, unit, 1)), labels: Array.from({ length: selMonthWeekCount }, (_, i) => `${i+1}주`) } : undefined)
    : period === '년'
    ? (selYearBuckets.some(v => v > 0) ? { title: '월별 거리', data: selYearBuckets.map(v => displayNum(v, unit, 1)), labels: MONTH_LABELS } : chart['년'])
    : allYearsChart;

  const weekLabel = weekOffset === 0 ? '이번 주' : weekOffset === 1 ? '지난 주' : `${weekOffset}주 전`;
  const periodTitle = period === '주' ? weekLabel
    : period === '월' ? `${selYear}년 ${selMonth+1}월`
    : period === '년' ? `${selYearYear}년`
    : '전체 기간';

  const displayRuns = period === '주' ? selWeekRuns : period === '월' ? selMonthRuns : period === '년' ? selYearRuns : runs;
  // 최근 5개만 노출(펼치기 전). 기간을 바꾸면 다시 접힌다(아래 세그먼트 onChange).
  const RECENT_LIMIT = 5;
  const shownRuns = showAllRuns ? displayRuns : displayRuns.slice(0, RECENT_LIMIT);
  const hiddenCount = displayRuns.length - shownRuns.length;

  const MIN_YEAR = runs.length > 0
    ? Math.min(now.getFullYear(), ...runs.map(r => parseInt(rd(r).slice(0,4)) || now.getFullYear()))
    : now.getFullYear() - 3;
  const PICKER_YEARS = Array.from({ length: now.getFullYear() - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i);
  const MAX_WEEK_OFFSET = Math.min(52, runs.length > 0
    ? Math.ceil((now.getTime() - new Date(runs.reduce((a, r) => rd(r) < a ? rd(r) : a, rd(runs[0]) || ymdLocal(now)) + 'T00:00:00').getTime()) / (7*24*60*60*1000))
    : 0);

  const openPicker = () => { setDraftYear(selYear); setDraftMonth(selMonth); setDraftWeekOffset(weekOffset); setDraftYearYear(selYearYear); setShowPicker(true); };
  const confirmPicker = () => {
    if (period === '월') { setSelYear(draftYear); setSelMonth(Math.min(draftMonth, draftYear === now.getFullYear() ? now.getMonth() : 11)); }
    else if (period === '주') { setWeekOffset(draftWeekOffset); }
    else if (period === '년') { setSelYearYear(draftYearYear); }
    setShowPicker(false);
  };

  // 폼(추가/편집)이 열려 있으면 폼만 렌더. 제출 시 콜백을 호출하고 목록으로 복귀한다.
  if (form) {
    const initial = form.mode === 'edit' ? form.run : null;
    return (
      <RunForm
        shoes={shoes}
        unit={unit}
        initial={initial}
        onCancel={() => setForm(null)}
        onSubmit={({ shoeId, km, date, durationSec, surface }) => {
          if (form.mode === 'edit' && form.run.id) {
            // 노면은 칩 press 시 이미 setRunSurface로 영속됨(편집 런은 id가 있으므로).
            onEditRun?.(form.run.id, { shoe_id: shoeId, km, run_date: date, duration: durationSec });
          } else {
            // 수동 추가: 새 런 id가 App에서 생성되므로 surface를 함께 넘겨 거기서 영속한다.
            onAddRun?.(shoeId, km, date, durationSec, surface);
          }
          setForm(null);
          setDetail(null);
        }}
      />
    );
  }

  if (detail) {
    return (
      <RunDetail
        run={detail}
        shoe={shoes[detail.shoe]}
        onBack={() => setDetail(null)}
        unit={unit}
        onDelete={onDeleteRun}
        // 편집(연필) → 상세를 닫고 프리필된 편집 폼으로. 영속 콜백(onEditRun)이 있을 때만 노출.
        onEdit={onEditRun ? (r) => { setDetail(null); setForm({ mode: 'edit', run: r }); } : undefined}
        age={age}
        sex={sex}
        restHR={restHR}
        thresholdPaceSec={thresholdPace}
      />
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <AmbientBackdrop />
      <View style={[s.header, s.headerRow, { justifyContent: 'space-between' }]}>
        <Text style={s.title}>기록</Text>
        {/* 수동 기록 추가 — 앱 없이/기록 못한 러닝을 직접 넣는 진입점(라이브 GPS 외 보조 경로). */}
        {!!onAddRun && (
          <Pressable onPress={() => setForm({ mode: 'add' })} hitSlop={8} accessibilityRole="button" accessibilityLabel="기록 직접 추가" style={s.iconBtn}>
            <Ionicons name="add" size={ri(ICON.nav)} color={ACCENT} />
          </Pressable>
        )}
      </View>
      {/* recent runs 리스트는 FlatList 로 가상화한다(런이 수백 건이어도 보이는 행만 마운트).
          세그먼트·요약·차트·PR·섹션 라벨은 스크롤과 함께 움직이도록 ListHeaderComponent 로
          얹고, 빈 상태는 ListEmptyComponent 로 둔다. 당겨서 새로고침은 RN 내장 RefreshControl
          만 쓴다(새 네이티브 0) — onRefresh 가 있을 때만 단다. keyExtractor 는 안정 키(run.id,
          없으면 인덱스)로 리렌더 시 행 재사용을 보장한다. */}
      <Rise style={{ flex: 1 }}>
      <FlatList
        data={shownRuns}
        keyExtractor={(r, i) => r.id || String(i)}
        renderItem={({ item }) => (
          <RunCard run={item} shoes={shoes} onPress={() => setDetail(item)} unit={unit} />
        )}
        ListFooterComponent={
          hiddenCount > 0 ? (
            /* 불투명 CARD+수동 보더 → 유리 표면(GLASS.fill+GlassEdge) — 형제 카드·CTA 와
               같은 재질 문법으로 수렴(검수 MED, 2026-07-16). */
            <Pressable onPress={() => setShowAllRuns(true)} accessibilityRole="button" accessibilityLabel={`모든 기록 보기, ${displayRuns.length}개`}
              style={({ pressed }) => [{ marginTop: rv(4), paddingVertical: rv(14), borderRadius: RADIUS.md, backgroundColor: GLASS.fill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(6), overflow: 'hidden' }, pressed && { backgroundColor: GLASS.fillActive }]}>
              <GlassEdge glints={false} radius={RADIUS.md} />
              <Text style={{ color: T1, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' }}>모든 기록 {displayRuns.length}개 보기</Text>
              <Ionicons name="chevron-down" size={ri(ICON.inline)} color={T3} />
            </Pressable>
          ) : showAllRuns && displayRuns.length > RECENT_LIMIT ? (
            <Pressable onPress={() => setShowAllRuns(false)} accessibilityRole="button" accessibilityLabel="접기"
              style={{ marginTop: rv(4), paddingVertical: rv(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(6) }}>
              <Text style={{ color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' }}>접기</Text>
              <Ionicons name="chevron-up" size={ri(ICON.inline)} color={T3} />
            </Pressable>
          ) : null
        }
        contentContainerStyle={{ padding: rs(14), paddingHorizontal: GUTTER, paddingBottom: TABBAR_CLEARANCE, gap: rv(10) }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} colors={[ACCENT]} /> : undefined}
        ListHeaderComponent={
          <View style={{ gap: rv(10) }}>
            <SegmentedControl
              items={PERIODS.map((p) => ({ key: p, label: p }))}
              value={period}
              onChange={(p) => { setPeriod(p); setShowAllRuns(false); }}
            />
            {period !== '전체'
              ? (
                <Pressable onPress={openPicker} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: rv(4), paddingVertical: rv(4), paddingHorizontal: rs(10) }}>
                  <Text style={{ color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700' }}>{periodTitle}</Text>
                  <Ionicons name="chevron-down" size={ri(ICON.tag)} color={T3} />
                </Pressable>
              ) : (
                <View style={{ paddingVertical: rv(4), paddingHorizontal: rs(10) }}>
                  <Text style={{ color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700' }}>
                    {allYearKeys.length >= 2 ? `${allYearKeys[0]} — ${allYearKeys[allYearKeys.length - 1]}` : allYearKeys.length === 1 ? `${allYearKeys[0]}년` : '전체 기간'}
                  </Text>
                </View>
              )
            }
            <View style={[s.card, { paddingHorizontal: rs(16), paddingTop: rv(12), paddingBottom: rv(24) }]}>
              <GlassEdge glints={false} radius={RADIUS.lg} />
              <View style={[s.baselineRow, { marginTop: rv(0) }]}>
                <Text maxFontSizeMultiplier={FONT_SCALE_CAP_HERO} style={s.sumBigKm}>{sum.km}</Text><Text style={s.sumBigU}>{unit}</Text>
              </View>

              <View style={s.sumMetricRow}>
                <View style={s.sumMetric}><Text style={s.sumMetricV}>{sum.runs}<Text style={s.sumMetricU}> 회</Text></Text><Text style={s.sumMetricL}>횟수</Text></View>
                <View style={[s.sumMetric, { marginLeft: rs(16) }]}><Text style={s.sumMetricV}>{sum.pace}</Text><Text style={s.sumMetricL}>평균 페이스</Text></View>
                <View style={s.sumMetric}><Text style={s.sumMetricV}>{sum.time}</Text><Text style={s.sumMetricL}>총 시간</Text></View>
              </View>
              {/* '전체' 뷰의 연도 막대는 비교할 연도가 2개 이상일 때만(심사 #20, 2026-07-22)
                  — 데이터가 1년치뿐이면 막대 1개는 비교 정보가 0이라 합계 요약만 남긴다. */}
              {ch && ch.data.length > 0 && !(period === '전체' && ch.data.length < 2) && (
                <View style={{ marginTop: rv(20), paddingTop: rv(20), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP }}>
                  <Text style={[s.cardTitle, { color: T1 }]}>{ch.title}</Text>
                  <View style={{ marginTop: rv(18) }}><PeriodChartView data={ch.data} labels={ch.labels} unit={unit} /></View>
                </View>
              )}
            </View>
            {/* 심폐 체력(VO2max)은 마이 탭 '러너 스펙' 카드로 이관(2026-07-05) — 러너 정체성
                스펙(거리 PB·VO2max)을 한곳에 모은다. */}
            {/* 훈련 부하는 홈으로 이관(안 A, 2026-07-25 민우님 확정) — 소비 시점이 '러닝 전'
                이라 기록탭(사후 회고)이 아니라 홈이 맞다. HomeScreen 컴팩트 카드가 담당. */}
            <Text style={s.sectionLabel}>러닝 기록</Text>
          </View>
        }
        ListEmptyComponent={
          runs.length === 0 ? (
            // 첫 러닝 전 — 고스트 런카드(전역 빈 상태 표준): 채워질 기록의 실루엣 + 격려.
            <View>
              <EmptyGhostHeader
                title="아직 기록이 없어요"
                sub={<>가볍게 한 걸음부터 — 첫 러닝을 마치면 이 자리에 쌓여요.{'\n'}지난 러닝은 <GhostStrong>기록 추가</GhostStrong>로 직접 남길 수도 있어요.</>}
              />
              <View style={s.runCard}>
                <GlassEdge glints={false} radius={RADIUS.lg} />
                <GhostBar w="34%" />
                <GhostBar w="58%" dim />
                <View style={{ flexDirection: 'row', gap: rs(24), marginTop: rv(18) }}>
                  <GhostBar w={rs(56)} dim style={{ marginTop: 0 }} />
                  <GhostBar w={rs(56)} dim style={{ marginTop: 0 }} />
                  <GhostBar w={rs(56)} dim style={{ marginTop: 0 }} />
                </View>
              </View>
              <View style={[s.runCard, { opacity: 0.45, marginTop: rv(10) }]}>
                <GlassEdge glints={false} radius={RADIUS.lg} />
                <GhostBar w="28%" />
                <GhostBar w="50%" dim />
                <View style={{ flexDirection: 'row', gap: rs(24), marginTop: rv(18) }}>
                  <GhostBar w={rs(56)} dim style={{ marginTop: 0 }} />
                  <GhostBar w={rs(56)} dim style={{ marginTop: 0 }} />
                  <GhostBar w={rs(56)} dim style={{ marginTop: 0 }} />
                </View>
              </View>
              {!!onAddRun && (
                <Pressable onPress={() => setForm({ mode: 'add' })} accessibilityRole="button" accessibilityLabel="기록 직접 추가" hitSlop={6}
                  style={({ pressed }) => [{ marginTop: rv(16), alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: rv(4), paddingVertical: rv(8), paddingHorizontal: rs(16), borderRadius: RADIUS.pill, backgroundColor: CARD_HI }, pressed && { transform: [{ scale: MOTION.press.scale }], opacity: MOTION.press.opacity }]}>
                  <Ionicons name="add" size={ri(ICON.inline)} color={ACCENT} />
                  <Text style={{ color: T1, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' }}>기록 추가</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={[s.card, { padding: rs(28), alignItems: 'center' }]}>
              <GlassEdge glints={false} radius={RADIUS.lg} />
              <Text style={s.emptyHint}>이 기간엔 기록이 없어요</Text>
            </View>
          )
        }
      />
      </Rise>

      <BottomSheet
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        title={period === '주' ? '주 선택' : period === '월' ? '월 선택' : '연도 선택'}
        confirmLabel="확인"
        onConfirm={confirmPicker}>
          {period === '주' && (
            <View style={{ paddingHorizontal: rs(12), paddingBottom: rv(8), height: DRUM_H }}>
              <DrumColumn
                items={Array.from({ length: MAX_WEEK_OFFSET + 1 }, (_, i) =>
                  i === 0 ? '이번 주' : i === 1 ? '지난 주' : `${i}주 전`
                )}
                selectedIndex={draftWeekOffset}
                onChange={(i) => setDraftWeekOffset(i)}
              />
            </View>
          )}

          {period === '월' && (
            <View style={{ flexDirection: 'row', paddingHorizontal: rs(12), paddingBottom: rv(8) }}>
              <DrumColumn
                items={PICKER_YEARS.map(y => `${y}년`)}
                selectedIndex={Math.max(0, PICKER_YEARS.indexOf(draftYear))}
                onChange={(i) => setDraftYear(PICKER_YEARS[i])}
              />
              <DrumColumn
                items={['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']}
                selectedIndex={draftMonth}
                onChange={(i) => setDraftMonth(i)}
              />
            </View>
          )}

          {period === '년' && (
            <View style={{ paddingHorizontal: rs(12), paddingBottom: rv(8), height: DRUM_H }}>
              <DrumColumn
                items={[...PICKER_YEARS].reverse().map(y => `${y}년`)}
                selectedIndex={Math.max(0, [...PICKER_YEARS].reverse().indexOf(draftYearYear))}
                onChange={(i) => setDraftYearYear([...PICKER_YEARS].reverse()[i])}
              />
            </View>
          )}
      </BottomSheet>

      <TabBar active={2} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  // 공유 카드 캡처용: 화면 밖(좌측 far-off)으로 밀어 보이지 않게 하되 마운트는 유지.
  runPhoto: { width: '100%', height: rs(200), borderRadius: rs(16), borderCurve: 'continuous', marginTop: rv(16) },
  runMemo: { color: T2, fontFamily: FONT, fontSize: TYPE.body.fontSize, lineHeight: rf(21), marginTop: rv(12), fontStyle: 'italic' },
  // 트랙 랩 표 — 랩번호 · 상대페이스 바 · km당 페이스 · 랩시간.
  trackCard: { marginTop: rv(16), backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', paddingHorizontal: rs(16), paddingVertical: rv(14) },
  trackHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: rv(12) },
  trackTitle: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: -0.2 },
  trackSub: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },
  lapRow: { flexDirection: 'row', alignItems: 'center', gap: rv(10), minHeight: rs(34) },
  lapNum: { width: rs(22), color: T3, fontFamily: DISPLAY, fontSize: TYPE.label.fontSize, fontWeight: '700', textAlign: 'center' },
  lapBarWrap: { flex: 1, height: rs(BAR.md), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.06), overflow: 'hidden' },
  lapBarFill: { height: rs(BAR.md), borderRadius: RADIUS.pill, backgroundColor: ACCENT },
  lapPace: { width: rs(78), textAlign: 'right', color: T1, fontFamily: DISPLAY, fontSize: TYPE.body.fontSize, fontWeight: '600', fontVariant: ['tabular-nums'] },
  lapPaceU: { color: T3, fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '500' },
  lapTime: { width: rs(46), textAlign: 'right', color: T3, fontFamily: DISPLAY, fontSize: TYPE.label.fontSize, fontWeight: '500', fontVariant: ['tabular-nums'] },
  gpxRow: { flexDirection: 'row', alignItems: 'center', gap: rv(8), marginTop: rv(24), paddingVertical: rv(12), paddingHorizontal: rs(2), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP },
  gpxTxt: { color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },
  gpxHint: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginLeft: 'auto' },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },
  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  card: { backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden' },
  cardTitle: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },
  // 성과 카드(부하·GAP) 한 행 — 좌 제목/설명, 우 큰 숫자. 두 행이 같은 골격을 공유한다.
  effortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // 두 행 사이 구획 — 카드를 나누는 대신 헤어라인 하나로(표면 이중화 금지).
  effortDivider: { height: StyleSheet.hairlineWidth, backgroundColor: SEP, marginVertical: rv(14) },
  // 섹션 헤더 = SectionTitle 프리미티브와 동일 스펙(700) — 화면 간 헤더 무게 통일.
  sectionLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700', letterSpacing: 0.4, paddingHorizontal: rs(4) },
  // 요약 카드(큰 거리) — 목업 기록(10)
  sumBigKm: { color: T1, fontFamily: DISPLAY, fontSize: rf(42), fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'], marginLeft: rs(0) },
  sumBigU: { color: T3, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '500', marginLeft: rs(4), paddingBottom: rv(6) },
  sumMetricRow: { flexDirection: 'row', justifyContent: 'flex-start', gap: rv(28), marginTop: rv(14), paddingLeft: rs(2) },
  sumMetric: {},
  sumMetricV: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  sumMetricU: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600' },
  sumMetricL: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500', marginTop: rv(4), marginLeft: rs(1) },
  // 개인 기록(PR, 1-3) — 2x2 그리드(최장거리/최고페이스/최장시간/최장스트릭).
  // 런 카드 — 목업 기록(10): 신발+날짜 + 거리·평균페이스·시간
  runCard: { backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', padding: rs(16) },
  runCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: rv(10), marginBottom: rv(14) },
  runCardBrand: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '500', letterSpacing: 1.2 },
  runCardModel: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.2, marginTop: rv(2) },
  runCardDate: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', flexShrink: 0 },
  // 메트릭 3칸을 균등 1/3 폭으로 고정 — 거리 숫자 폭이 달라도 평균페이스·시간 열 위치가
  // 흔들리지 않아 카드끼리 세로로 정렬된다(사용자 요청: 자리 고정).
  runCardMetrics: { flexDirection: 'row' },
  runCardMetric: { flex: 1 },

  header: { paddingTop: rv(8), paddingHorizontal: GUTTER, paddingBottom: rv(6) },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: T1, fontFamily: FONT, ...TYPE.screenTitle },

  // 기간 세그먼트는 SegmentedControl(md 기본) 프리미티브로 이전 — 컨테이너/항목/선택칩
  // 토큰을 그쪽이 책임진다(과거 segment/segItem/segItemOn/segText 제거).

  // bar chart (right-side km gridlines · accent bars)
  chartGrid: { position: 'absolute', left: 0, right: 0 },
  chartGridLine: { position: 'absolute', left: 0, right: 42, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP },
  chartTick: { position: 'absolute', right: 0, width: rs(42), textAlign: 'right', color: T3, fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, marginBottom: rv(-7), fontVariant: ['tabular-nums'] },
  chartBars: { position: 'absolute', left: 0, right: 42, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end' },
  chartBarSlot: { flex: 1, alignItems: 'center' },
  chartBar: { width: '100%', borderTopLeftRadius: rs(4), borderTopRightRadius: rs(4), backgroundColor: BRAND },
  chartAvgLine: { position: 'absolute', left: 0, right: 42, flexDirection: 'row', alignItems: 'center', gap: rs(4) },
  chartAvgVal: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chartLabels: { flexDirection: 'row', marginTop: rv(8), paddingRight: rs(42) },
  chartLabel: { flex: 1, textAlign: 'center', color: T3, fontFamily: FONT, fontWeight: '600' },
  chartTipWrap: { position: 'absolute', left: -26, right: -26, alignItems: 'center', zIndex: 5 },
  chartBarVal: { fontFamily: DISPLAY, fontSize: TYPE.micro.fontSize, fontWeight: '600', color: T1, fontVariant: ['tabular-nums'] },

  // course map (recessed well, svg polyline)
  emptyHint: { color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, textAlign: 'center' },

  // 콤팩트: 요약 4칸(거리/횟수/페이스/시간)의 패딩·값 폰트·여백을 줄여 세로 높이를
  // 압축한다(정보는 그대로 유지 — 라벨/값/단위 모두 렌더). 리스트가 위로 올라온다.
  // 4열 요약 행(Screens Refined) — 카드 없이 헤어라인 구분.

  runV: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: 0.2, fontVariant: ['tabular-nums'] },
  runU: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginLeft: rs(3), marginBottom: rv(1) },
  // marginLeft 1 — 옵티컬 정렬: 타뷸러 숫자는 좌측 사이드베어링이 있고 한글 라벨은 꽉 차서,
  // 같은 x에서 라벨이 살짝 왼쪽으로 튀어나와 보인다(사용자 피드백 2026-07-07).
  runML: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500', marginTop: rv(3), marginLeft: rs(1) },

  // detail
  nav: { paddingTop: rv(12), paddingHorizontal: GUTTER, paddingBottom: rv(6) },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  iconBtn: { width: rs(38), height: rs(38), borderRadius: RADIUS.pill, backgroundColor: CARD_HI, borderWidth: 1, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },

  // manual-run / edit form
  formTitle: { color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '600' },
  formLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', marginBottom: rv(8), paddingHorizontal: rs(2) },
  formHint: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: rv(8) },
  // 검증 실패 시 입력칸 테두리를 빨강으로 강조하고, 아래에 인라인 헬퍼텍스트를 띄운다.
  inputErr: { borderColor: DANGER, borderWidth: 1 },
  errText: { color: DANGER, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', marginTop: rv(8), paddingHorizontal: rs(2) },
  // 저장/추가 CTA 는 단일 Button 프리미티브(그라데이션·글로우·radius 토큰). 화면
  // 고유 여백만 남긴다(과거 RADIUS.md 사각 ACCENT 버튼 제거).
  saveBtn: { marginTop: rv(6) },
  detailDate: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize },
  detailDist: { color: T1, fontFamily: DISPLAY, fontSize: HERO.heroLg, fontWeight: '700', letterSpacing: 0.5 },
  detailDistU: { color: T3, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '500', marginLeft: rs(6), marginBottom: rv(8) },
  detailBrand: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: 1.4 },
  detailModel: { color: T1, fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.4, marginTop: rv(4) },
  // 메트릭 한 카드(디자인 11) — 2x3 그리드. 칸 레이아웃·값/단위/라벨은 StatGrid
  // 프리미티브가 책임지고(columns=3·align=left), 여기선 카드 내부 여백만 얹는다.
  // marginTop 은 카드 래퍼(View[s.card])로 이동 — StatGrid 는 래퍼 안 내용물이 됐다.
  // (statGrid 삭제 — primitives.StatGrid inset="card" 로 수렴, 2026-07-26)
});
