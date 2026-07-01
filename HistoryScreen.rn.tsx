// ============================================================================
// HistoryScreen.rn.tsx — 기록: period segment, period chart, recent runs + RunDetail
// (sample data removed — real summary/chart/runs are injected via props)
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, FlatList, Pressable, StyleSheet, LayoutChangeEvent, TextInput, Alert, KeyboardAvoidingView, Platform, RefreshControl, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Circle } from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD, CARD_DIM, CARD_HI, ACCENT, DANGER, T1, T2, T3, T4, SEP, CARD_BORDER, FONT, DISPLAY, Shoe, Run, SHOES, withAlpha, RADIUS, GUTTER, HERO, SCRIM,
} from './theme';
// 기간 탭 스트립 = SegmentedControl(neutral), 러닝 상세 2×3 메트릭 = StatGrid 프리미티브.
import { TabBar, Button, SegmentedControl, StatGrid } from './primitives';
import { Unit, displayNum, displayToKm } from './lib/units';
import { ymdLocal } from './lib/format';
import { sumKm, summaryOf, monthBuckets, weekBuckets, yearBuckets } from './lib/stats';
import { fitnessSummary } from './lib/analytics/fitness';
import { gradeAdjustedPaceSec, smoothElevation, resampleByDistance, buildGapSeries } from './lib/analytics/gap';
import { getRunSurface, setRunSurface, type Surface } from './lib/wearModel';
import { parseRoute, projectRoute, LatLon } from './lib/route';
import { DARK_MAP_STYLE } from './lib/mapStyle';
import { RunSplits, Split } from './RunSplits';
import { PaceCurveChart } from './PaceCurveChart';
import { buildSplits, buildPaceSeries, PaceTrackPoint } from './lib/splits';
import { buildShareCardModel, shareRunCard, saveCardToLibrary, SvgCapturable } from './lib/shareCard';
import { maskDuration, maskDate, validateRunForm, type RunFormErrors } from './lib/inputMask';
import ShareCard from './ShareCard';

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

// ── bar chart with right-side km gridlines ────────────────────────────────────
function PeriodChartView({ data, labels, unit }: { data: number[]; labels: string[]; unit: Unit }) {
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
                {on && (
                  <View style={[s.chartTipWrap, { bottom: bh + 8 }]} pointerEvents="none">
                    <View style={s.chartTip}>
                      <Text style={s.chartTipVal}>{fmtTick(v)}<Text style={s.chartTipU}>{unit}</Text></Text>
                    </View>
                  </View>
                )}
                <View style={[s.chartBar, { maxWidth: dense ? 12 : 18, height: bh, backgroundColor: dim ? withAlpha(ACCENT, 0.28) : ACCENT }]} />
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={[s.chartLabels, { gap: dense ? 4 : 8 }]}>
        {labels.map((l, i) => (
          <Text key={i} style={[s.chartLabel, { fontSize: dense ? 9 : 11, color: sel === i ? T1 : T3 }]}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

// ── course map ────────────────────────────────────────────────────────────────
// 상세보기(러닝 종료 후, 보통 WiFi 환경)에서 기록된 GPS 경로(route_<id>, [{lat,lon}])를
// **진짜 지도(Google) 위 경로**로 보여준다. react-native-maps 가 네이티브에 링크 안 됐거나
// 옛 빌드면 SVG 폴리라인으로 자동 폴백(앱 안 죽음). 지도 타일은 네트워크가 필요하나,
// 상세보기는 보통 집(WiFi)에서 보므로 적합하다. (러닝 중 화면엔 지도를 두지 않는다.)
const MAP_H = 180;
const MAP_PAD = 16;

// 옵셔널 require — 미링크 빌드에서 top-level import 가 앱을 죽이지 않게 감싼다.
let MapView: any = null;
let MapPolyline: any = null;
let MapMarker: any = null;
let MAP_PROVIDER_GOOGLE: any = undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const maps = require('react-native-maps');
  MapView = maps.default ?? maps.MapView;
  MapPolyline = maps.Polyline;
  MapMarker = maps.Marker;
  MAP_PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
} catch {
  // 네이티브 미링크 — SVG 폴백.
}
const MAPS_AVAILABLE = !!MapView;

/** 경로 bbox → MapView region(중심 + 델타, 패딩 1.5배·최소 델타). */
function routeRegion(points: LatLon[]) {
  const lats = points.map(p => p.lat);
  const lons = points.map(p => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.003),
    longitudeDelta: Math.max((maxLon - minLon) * 1.5, 0.003),
  };
}

/** SVG 폴백(지도 네이티브 미링크 시) — 기존 순수 projectRoute 폴리라인. */
function SvgCourse({ points }: { points: LatLon[] }) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const proj = w > 0 ? projectRoute(points, { width: w, height: MAP_H, padding: MAP_PAD }) : null;
  const start = proj?.points[0];
  const end = proj?.points[proj.points.length - 1];
  return (
    <View style={s.mapWell} onLayout={onLayout}>
      {proj && proj.svgPoints !== '' && (
        <Svg width={w} height={MAP_H}>
          <Polyline
            points={proj.svgPoints}
            fill="none"
            stroke={ACCENT}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!!start && <Circle cx={start.x} cy={start.y} r={5} fill={ACCENT} />}
          {!!end && <Circle cx={end.x} cy={end.y} r={5} fill={T1} stroke={ACCENT} strokeWidth={2} />}
        </Svg>
      )}
    </View>
  );
}

function CourseMap({ points }: { points: LatLon[] }) {
  if (points.length < 2) return null;
  const coords = points.map(p => ({ latitude: p.lat, longitude: p.lon }));
  const start = coords[0];
  const end = coords[coords.length - 1];
  return (
    <View style={[s.card, { padding: 16, marginTop: 16 }]}>
      <Text style={s.detailBrand}>코스</Text>
      {MAPS_AVAILABLE ? (
        <View style={[s.mapWell, { overflow: 'hidden' }]}>
          <MapView
            provider={MAP_PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            customMapStyle={DARK_MAP_STYLE}
            initialRegion={routeRegion(points)}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            liteMode
          >
            <MapPolyline coordinates={coords} strokeColor={ACCENT} strokeWidth={4} lineCap="round" lineJoin="round" />
            <MapMarker coordinate={start} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={s.mapStartDot} />
            </MapMarker>
            <MapMarker coordinate={end} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={s.mapEndDot} />
            </MapMarker>
          </MapView>
        </View>
      ) : (
        <SvgCourse points={points} />
      )}
    </View>
  );
}

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
      <View style={[s.nav, s.navRow]}>
        <Pressable onPress={onCancel} hitSlop={6} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}><Ionicons name="chevron-back" size={20} color={T1} /></Pressable>
        <Text style={s.formTitle}>{editing ? '러닝 편집' : '수동 기록 추가'}</Text>
        <View style={s.iconBtn} />
      </View>
      {/* 키보드가 입력칸·저장 버튼을 가리지 않게 폼 전체를 KeyboardAvoidingView로 감싼다
          (iOS=padding, Android는 windowSoftInputMode adjustResize에 맡겨 undefined). */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 8}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, gap: 18 }} keyboardShouldPersistTaps="handled">
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
                  <Pressable
                    key={sh.id || i}
                    onPress={() => { if (sh.id) { setShoeId(sh.id); clearError('shoe'); } }}
                    style={[s.chip, on && s.chipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[s.chipTxt, { color: on ? BG : T2 }]} numberOfLines={1}>
                      {sh.brand} {sh.model}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {!!errors.shoe && <Text style={s.errText} accessibilityLabel="신발 오류">{errors.shoe}</Text>}
        </View>
        {/* 거리 */}
        <View>
          <Text style={s.formLabel}>거리 ({unit})</Text>
          <TextInput
            value={dist}
            onChangeText={(t) => { setDist(t); clearError('dist'); }}
            keyboardType="decimal-pad"
            placeholder={`예: 5.0`}
            placeholderTextColor={T3}
            style={[s.input, !!errors.dist && s.inputErr]}
            accessibilityLabel="거리"
          />
          {!!errors.dist && <Text style={s.errText} accessibilityLabel="거리 오류">{errors.dist}</Text>}
        </View>
        {/* 시간 — 숫자만 받아 MM:SS로 자동 마스킹(JS-only, 네이티브 피커 없음). */}
        <View>
          <Text style={s.formLabel}>시간 (MM:SS)</Text>
          <TextInput
            value={dur}
            onChangeText={(t) => setDur(maskDuration(t))}
            keyboardType="number-pad"
            placeholder="예: 30:00 (선택)"
            placeholderTextColor={T3}
            style={s.input}
            accessibilityLabel="시간"
          />
        </View>
        {/* 날짜 — 숫자만 받아 YYYY-MM-DD로 자동 하이픈 삽입(JS-only, 네이티브 피커 없음). */}
        <View>
          <Text style={s.formLabel}>날짜 (YYYY-MM-DD)</Text>
          <TextInput
            value={date}
            onChangeText={(t) => { setDate(maskDate(t)); clearError('date'); }}
            keyboardType="number-pad"
            placeholder="2026-06-01"
            placeholderTextColor={T3}
            style={[s.input, !!errors.date && s.inputErr]}
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
                <Pressable
                  key={opt.value}
                  onPress={() => pickSurface(opt.value)}
                  style={[s.chip, on && s.chipOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`노면 ${opt.label}`}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.chipTxt, { color: on ? BG : T2 }]}>{opt.label}</Text>
                </Pressable>
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
function RunDetail({ run, shoe, onBack, unit, onDelete }: { run: Run; shoe?: Shoe; onBack: () => void; unit: Unit; onDelete?: (id: string) => void }) {
  // Load the recorded route for this run once. Missing/invalid blob → [] → map
  // stays hidden (graceful). route_<id> is written by App.addRun on save.
  const [route, setRoute] = useState<LatLon[]>([]);
  useEffect(() => {
    let alive = true;
    if (!run.id) { setRoute([]); return; }
    AsyncStorage.getItem('route_' + run.id)
      .then(raw => { if (alive) setRoute(parseRoute(raw)); })
      .catch(() => { if (alive) setRoute([]); });
    return () => { alive = false; };
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
  // 곡선 전용 (거리,경과시간) 시계열(paceTrack_<id>, App.onSave가 영속). 있으면 per-km 보다
  // 훨씬 고운 페이스 곡선을 만든다. 없으면(옛 런/수동 입력) 스플릿 기반 곡선으로 폴백.
  const [paceTrack, setPaceTrack] = useState<PaceTrackPoint[]>([]);
  useEffect(() => {
    let alive = true;
    if (!run.id) { setPaceTrack([]); return; }
    AsyncStorage.getItem('paceTrack_' + run.id)
      .then(raw => {
        if (!alive) return;
        try {
          const arr = raw ? JSON.parse(raw) : [];
          setPaceTrack(Array.isArray(arr) ? arr : []);
        } catch { setPaceTrack([]); }
      })
      .catch(() => { if (alive) setPaceTrack([]); });
    return () => { alive = false; };
  }, [run.id]);
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
  // GAP 곡선(페이스곡선 오버레이용) — 집계 GAP 가 유의미할 때만(gapSec!=null) 스무딩 후 0.1km bin.
  const gapCurve = useMemo(
    () => (gapSec != null && gapTrack.length >= 2 ? buildGapSeries(smoothElevation(gapTrack, 60), 0.1) : undefined),
    [gapSec, gapTrack],
  );

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
  };
  // 공유 카드는 배경 없는 투명 PNG(스트라바 방식) — 사진앱에 저장 후, 인스타 스토리에서
  // 사용자가 자기 사진 위에 스티커로 얹는다. '공유 시트로'는 RN Share 폴백(캡처 실패 시 텍스트).
  const cardRef = useRef<SvgCapturable | null>(null);
  const cardModel = buildShareCardModel(shareInput);
  const doShare = () => shareRunCard(cardRef, shareInput);
  const saveCard = async () => {
    const r = await saveCardToLibrary(cardRef);
    if (r.ok) {
      Alert.alert('사진앱에 저장됐어요', '인스타 스토리에서 내 사진을 고른 뒤, 사진/스티커로 이 카드를 올리면 돼요.');
    } else if (r.reason === 'denied') {
      Alert.alert('권한 필요', '설정에서 사진 추가 권한을 허용해 주세요.');
    } else {
      Alert.alert('저장 실패', r.reason ?? '잠시 후 다시 시도해 주세요.');
    }
  };
  const onShareCard = () => {
    Alert.alert('러닝 카드', '투명 카드를 사진앱에 저장해, 인스타 스토리에서 내 사진 위에 올리세요.', [
      { text: '사진앱에 저장', onPress: saveCard },
      { text: '공유 시트로', onPress: doShare },
      { text: '취소', style: 'cancel' },
    ]);
  };
  // 삭제는 확인 Alert로 보호한다(파괴 방지). 삭제 시 신발 사용거리도 줄어듦을 안내한다.
  const confirmDelete = () => {
    Alert.alert(
      '러닝 기록 삭제',
      `${run.date} ${displayNum(run.dist, unit, 2)}${unit} 기록을 삭제할까요?\n삭제하면 신발 사용 거리도 함께 줄어듭니다.`,
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
    { l: '누적 고도', ...dash(run.elev, 'm') },
    { l: '평균 심박', ...dash(run.bpm, 'bpm') },
  ];
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={[s.nav, s.navRow]}>
        <Pressable onPress={onBack} hitSlop={6} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}><Ionicons name="chevron-back" size={20} color={T1} /></Pressable>
        <View style={s.navActions}>
          <Pressable onPress={onShareCard} hitSlop={6} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="공유">
            <Ionicons name="share-outline" size={18} color={ACCENT} />
          </Pressable>
          {!!onDelete && (
            <Pressable onPress={confirmDelete} hitSlop={6} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="삭제">
              <Ionicons name="trash-outline" size={18} color={DANGER} />
            </Pressable>
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 28 }}>
        {/* 신발(브랜드+모델)을 카드 없이 맨 위에 — 이 런의 '제목'처럼(사용자 요청). */}
        {!!shoe && (
          <View style={{ marginBottom: 14 }}>
            <Text style={s.detailBrand}>{shoe.brand}</Text>
            <Text style={s.detailModel}>{shoe.model}</Text>
          </View>
        )}
        <Text style={[s.detailDate, { marginLeft: 7 }]}>{run.date} {run.day}요일</Text>
        <View style={[s.baselineRow, { marginTop: 8, marginLeft: 3 }]}>
          <Text style={s.detailDist}>{displayNum(run.dist, unit, 2)}</Text>
          <Text style={s.detailDistU}>{unit}</Text>
        </View>
        {/* 메트릭 한 카드(디자인 11): 2x3 그리드(값 위 · 라벨 아래, 좌측 정렬) — StatGrid */}
        <StatGrid
          style={[s.card, s.statGrid]}
          columns={3}
          align="left"
          // 원본 statCell/Unit/Label 타이포 복원: unit 11.5/500, label 11.5/normal, 셀 세로패딩 6.
          unitSize={12}
          unitWeight="500"
          labelSize={12}
          labelWeight="normal"
          labelMarginTop={4}
          verticalPadding={6}
          items={stats.map((x) => ({ value: x.v, unit: x.u ? ` ${x.u}` : undefined, label: x.l }))}
        />
        {/* 경사 보정 페이스(GAP, Strava식) — 오르내림을 평지 등가로 환산. 고도 시계열이 있고
            평지와 유의미하게 다를 때만 노출(평지면 실제 페이스와 같아 중복이라 숨김). */}
        {gapSec != null && (() => {
          const actual = (run.durationS || 0) > 0 && run.dist > 0 ? (run.durationS || 0) / run.dist : 0;
          const harder = actual > 0 && gapSec < actual; // GAP 가 더 빠름 = 평지보다 힘든(오르막) 코스
          const fmtPace = (sec: number) => `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
          return (
            <View
              style={[s.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, marginTop: 12 }]}
              accessible accessibilityLabel={`경사 보정 페이스 GAP, 킬로미터당 ${fmtPace(gapSec)}`}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.cardTitle}>경사 보정 페이스 (GAP)</Text>
                <Text style={{ color: T3, fontFamily: FONT, fontSize: 11, marginTop: 3 }}>
                  {harder ? '오르막 코스 — 평지였다면 이 페이스' : '내리막 이득을 평지 기준으로 환산'}
                </Text>
              </View>
              <Text style={{ color: T1, fontFamily: DISPLAY, fontSize: 22, fontWeight: '800' }}>
                {fmtPace(gapSec)}<Text style={{ fontSize: 12, color: T3, fontWeight: '500' }}> /km</Text>
              </Text>
            </View>
          );
        })()}
        {/* 달린 위치(경로) 지도 — route_<id> 가 있으면 SVG 코스맵으로 표시(없으면 자동 숨김). */}
        <CourseMap points={route} />
        {/* 거리축 페이스 곡선(추세) + 구간별 페이스 스플릿(정확값). 같은 스플릿을 공유하고
            2구간 미만이면 둘 다 자동 숨김. 곡선은 한눈 추세, 표는 km별 정확한 페이스/고도. */}
        {(() => {
          const detailSplits = recordedSplits.length >= 2 ? recordedSplits : buildSplits(run, route);
          // 곡선은 (거리,경과시간) 시계열이 있으면 고운 페이스 곡선, 없으면 per-km 스플릿으로 폴백.
          // 표(RunSplits)는 항상 per-km 정확값을 유지한다.
          const curveSeries = paceTrack.length >= 2 ? buildPaceSeries(paceTrack) : detailSplits;
          return (
            <>
              <PaceCurveChart splits={curveSeries.length >= 2 ? curveSeries : detailSplits} unit={unit} gap={gapCurve} />
              <RunSplits splits={detailSplits} />
            </>
          );
        })()}
      </ScrollView>
      {/* 공유 카드: 화면 밖(off-screen)에 마운트해 toDataURL 캡처 대상으로만 쓴다.
          pointerEvents none + 음수 위치라 사용자에겐 보이지 않지만 레이아웃은 된다. */}
      <View style={s.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ShareCard ref={cardRef} model={cardModel} route={route} />
      </View>
    </View>
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
    <View style={{ flex: 1, height: DRUM_H }}>
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
              fontFamily: FONT, fontSize: index === active ? 19 : 15,
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
function RunCard({ run, shoes, onPress, unit }: { run: Run; shoes: Shoe[]; onPress: () => void; unit: Unit }) {
  const shoe = shoes[run.shoe];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${run.date} ${shoe ? shoe.brand + ' ' + shoe.model : '삭제된 신발'} 기록`} style={({ pressed }) => [s.runCard, pressed && { opacity: 0.85 }]}>
      <View style={s.runCardTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.runCardBrand} numberOfLines={1}>{shoe ? shoe.brand : '삭제된 신발'}</Text>
          <Text style={s.runCardModel} numberOfLines={1}>{shoe ? shoe.model : ''}</Text>
        </View>
        <Text style={s.runCardDate}>{run.date} {run.day}요일</Text>
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
}) {
  const [period, setPeriod] = useState('월');
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
    try { await onRefresh(); } catch {}
    finally { setRefreshing(false); }
  };
  const insets = useSafeAreaInsets();

  const rd = (r: Run) => String((r as any).run_date || r.runDate || '');
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
    ),
    // runs 식별(길이+마지막 런 키)로 캐시 무효화 — 매 렌더 깊은 비교 회피.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs.length, runs[runs.length - 1]?.id, todayIso],
  );

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
      />
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={[s.header, s.headerRow]}>
        <Text style={s.title}>기록</Text>
      </View>
      {/* recent runs 리스트는 FlatList 로 가상화한다(런이 수백 건이어도 보이는 행만 마운트).
          세그먼트·요약·차트·PR·섹션 라벨은 스크롤과 함께 움직이도록 ListHeaderComponent 로
          얹고, 빈 상태는 ListEmptyComponent 로 둔다. 당겨서 새로고침은 RN 내장 RefreshControl
          만 쓴다(새 네이티브 0) — onRefresh 가 있을 때만 단다. keyExtractor 는 안정 키(run.id,
          없으면 인덱스)로 리렌더 시 행 재사용을 보장한다. */}
      <FlatList
        data={displayRuns}
        keyExtractor={(r, i) => r.id || String(i)}
        renderItem={({ item }) => (
          <RunCard run={item} shoes={shoes} onPress={() => setDetail(item)} unit={unit} />
        )}
        contentContainerStyle={{ padding: 14, paddingBottom: 8, gap: 10 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} colors={[ACCENT]} /> : undefined}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <SegmentedControl
              variant="neutral"
              items={PERIODS.map((p) => ({ key: p, label: p }))}
              value={period}
              onChange={setPeriod}
            />
            {period !== '전체'
              ? (
                <Pressable onPress={openPicker} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 5, paddingVertical: 4, paddingHorizontal: 10 }}>
                  <Text style={{ color: T1, fontFamily: DISPLAY, fontSize: 16, fontWeight: '700' }}>{periodTitle}</Text>
                  <Ionicons name="chevron-down" size={14} color={T3} />
                </Pressable>
              ) : (
                <View style={{ paddingVertical: 4, paddingHorizontal: 10 }}>
                  <Text style={{ color: T1, fontFamily: DISPLAY, fontSize: 16, fontWeight: '700' }}>
                    {allYearKeys.length >= 2 ? `${allYearKeys[0]} — ${allYearKeys[allYearKeys.length - 1]}` : allYearKeys.length === 1 ? `${allYearKeys[0]}년` : '전체 기간'}
                  </Text>
                </View>
              )
            }
            <View style={[s.card, { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }]}>
              <View style={[s.baselineRow, { marginTop: 0 }]}>
                <Text style={s.sumBigKm}>{sum.km}</Text><Text style={s.sumBigU}>{unit}</Text>
              </View>

              <View style={s.sumMetricRow}>
                <View style={s.sumMetric}><Text style={s.sumMetricV}>{sum.runs}<Text style={s.sumMetricU}> 회</Text></Text><Text style={s.sumMetricL}>횟수</Text></View>
                <View style={[s.sumMetric, { marginLeft: 16 }]}><Text style={s.sumMetricV}>{sum.pace}</Text><Text style={s.sumMetricL}>평균 페이스</Text></View>
                <View style={s.sumMetric}><Text style={s.sumMetricV}>{sum.time}</Text><Text style={s.sumMetricL}>총 시간</Text></View>
              </View>
              {ch && ch.data.length > 0 && (
                <View style={{ marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' }}>
                  <Text style={s.cardTitle}>{ch.title}</Text>
                  <View style={{ marginTop: 18 }}><PeriodChartView data={ch.data} labels={ch.labels} unit={unit} /></View>
                </View>
              )}
            </View>
            {/* 체력 트렌드(VO2max + 트레이닝 상태) — 타임이 있는 노력 런이 하나라도 있어야
                VDOT/부하가 산다(없으면 숨김). 기간 토글과 무관한 '현재 체력' 단일 카드. */}
            {fitness.vo2max > 0 && (
              <View
                style={[s.card, { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 }]}
                accessible
                accessibilityLabel={`체력 트렌드. VO2max ${fitness.vo2max.toFixed(1)}, ${fitness.vo2maxLabel}. 폼 ${Math.round(fitness.tsb)}, ${fitness.tsbLabel}`}
              >
                <Text style={s.cardTitle}>체력 트렌드</Text>
                {/* VO2max — 최근 6주 최고 노력 기준(이지런 과소추정 보정). 가민 'VO2max'와 동일 개념. */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 }}>
                  <Text style={{ color: T1, fontFamily: DISPLAY, fontSize: 38, fontWeight: '800', letterSpacing: -0.5, lineHeight: 40 }}>{fitness.vo2max.toFixed(1)}</Text>
                  <View style={{ marginLeft: 10, paddingBottom: 4 }}>
                    <Text style={{ color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' }}>VO₂max</Text>
                    <Text style={{ color: ACCENT, fontFamily: FONT, fontSize: 13, fontWeight: '700', marginTop: 2 }}>{fitness.vo2maxLabel}</Text>
                  </View>
                </View>
                {/* 트레이닝 상태 — 체력(CTL)/피로(ATL)/폼(TSB). 폼 양수=신선(테이퍼), 음수=피로 누적. */}
                <View style={{ flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sumMetricV}>{Math.round(fitness.ctl)}</Text>
                    <Text style={s.sumMetricL}>체력</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sumMetricV}>{Math.round(fitness.atl)}</Text>
                    <Text style={s.sumMetricL}>피로</Text>
                  </View>
                  <View style={{ flex: 1.4 }}>
                    <Text style={[s.sumMetricV, { color: fitness.tsb >= 5 ? ACCENT : fitness.tsb <= -25 ? DANGER : T1 }]}>
                      {fitness.tsb > 0 ? '+' : ''}{Math.round(fitness.tsb)}
                    </Text>
                    <Text style={s.sumMetricL} numberOfLines={1}>폼 · {fitness.tsbLabel.split(' ')[0]}</Text>
                  </View>
                </View>
              </View>
            )}
            <Text style={s.sectionLabel}>러닝 기록</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={[s.card, { padding: 28, alignItems: 'center' }]}>
            <Text style={s.emptyHint}>이 기간엔 기록이 없어요</Text>
          </View>
        }
      />

      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={{ flex: 1, backgroundColor: SCRIM }} onPress={() => setShowPicker(false)} />
        <View style={{ backgroundColor: CARD, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, paddingBottom: insets.bottom + 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 }}>
            <Pressable onPress={() => setShowPicker(false)} hitSlop={8}>
              <Text style={{ color: T3, fontFamily: FONT, fontSize: 15 }}>취소</Text>
            </Pressable>
            <Text style={{ color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600' }}>
              {period === '주' ? '주 선택' : period === '월' ? '월 선택' : '연도 선택'}
            </Text>
            <Pressable onPress={confirmPicker} hitSlop={8}>
              <Text style={{ color: ACCENT, fontFamily: FONT, fontSize: 15, fontWeight: '700' }}>확인</Text>
            </Pressable>
          </View>

          {period === '주' && (
            <View style={{ paddingHorizontal: 12, paddingBottom: 8, height: DRUM_H }}>
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
            <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8 }}>
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
            <View style={{ paddingHorizontal: 12, paddingBottom: 8, height: DRUM_H }}>
              <DrumColumn
                items={[...PICKER_YEARS].reverse().map(y => `${y}년`)}
                selectedIndex={Math.max(0, [...PICKER_YEARS].reverse().indexOf(draftYearYear))}
                onChange={(i) => setDraftYearYear([...PICKER_YEARS].reverse()[i])}
              />
            </View>
          )}

        </View>
      </Modal>

      <TabBar active={2} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  // 공유 카드 캡처용: 화면 밖(좌측 far-off)으로 밀어 보이지 않게 하되 마운트는 유지.
  offscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },
  card: { backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER },
  cardTitle: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600' },
  sectionLabel: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: 0.4, paddingHorizontal: 4 },
  // 요약 카드(큰 거리) — 목업 기록(10)
  sumTitle: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  sumBigKm: { color: T1, fontFamily: DISPLAY, fontSize: 42, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'], marginLeft: 0 },
  sumBigU: { color: T3, fontFamily: FONT, fontSize: 17, fontWeight: '500', marginLeft: 4, paddingBottom: 6 },
  sumSub: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginTop: 2 },
  sumMetricRow: { flexDirection: 'row', justifyContent: 'flex-start', gap: 28, marginTop: 14, paddingLeft: 2 },
  sumMetric: {},
  sumMetricV: { color: T1, fontFamily: DISPLAY, fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  sumMetricU: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600' },
  sumMetricL: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500', marginTop: 4 },
  // 개인 기록(PR, 1-3) — 2x2 그리드(최장거리/최고페이스/최장시간/최장스트릭).
  prGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, rowGap: 18 },
  prCell: { width: '50%' },
  prV: { color: T1, fontFamily: DISPLAY, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  prU: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', marginLeft: 3 },
  prL: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500', marginTop: 5 },
  // 런 카드 — 목업 기록(10): 신발+날짜 + 거리·평균페이스·시간
  runCard: { backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER, padding: 18 },
  runCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  runCardBrand: { color: T3, fontFamily: DISPLAY, fontSize: 11, fontWeight: '500', letterSpacing: 1.2 },
  runCardModel: { color: T1, fontFamily: DISPLAY, fontSize: 16, fontWeight: '700', letterSpacing: -0.2, marginTop: 2 },
  runCardDate: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', flexShrink: 0 },
  // 메트릭 3칸을 균등 1/3 폭으로 고정 — 거리 숫자 폭이 달라도 평균페이스·시간 열 위치가
  // 흔들리지 않아 카드끼리 세로로 정렬된다(사용자 요청: 자리 고정).
  runCardMetrics: { flexDirection: 'row' },
  runCardMetric: { flex: 1 },

  header: { paddingTop: 8, paddingHorizontal: 22, paddingBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: T1, fontFamily: FONT, fontSize: 28, fontWeight: '500', letterSpacing: -0.8 },

  // 기간 세그먼트는 SegmentedControl(neutral) 프리미티브로 이전 — 컨테이너/항목/선택칩
  // 토큰을 그쪽이 책임진다(과거 segment/segItem/segItemOn/segText 제거, 시각 동등).

  // bar chart (right-side km gridlines · accent bars)
  chartGrid: { position: 'absolute', left: 0, right: 0 },
  chartGridLine: { position: 'absolute', left: 0, right: 42, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP },
  chartTick: { position: 'absolute', right: 0, width: 42, textAlign: 'right', color: T3, fontFamily: DISPLAY, fontSize: 11, marginBottom: -7 },
  chartBars: { position: 'absolute', left: 0, right: 42, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end' },
  chartBarSlot: { flex: 1, alignItems: 'center' },
  chartBar: { width: '100%', borderRadius: RADIUS.pill, backgroundColor: ACCENT },
  chartLabels: { flexDirection: 'row', marginTop: 8, paddingRight: 42 },
  chartLabel: { flex: 1, textAlign: 'center', color: T3, fontFamily: FONT, fontWeight: '600' },
  chartTipWrap: { position: 'absolute', left: -26, right: -26, alignItems: 'center', zIndex: 5 },
  chartTip: { backgroundColor: CARD_HI, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.14) },
  chartTipVal: { color: T1, fontFamily: DISPLAY, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  chartTipU: { color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '500' },

  // course map (recessed well, svg polyline)
  mapWell: { height: MAP_H, marginTop: 10, borderRadius: 14, overflow: 'hidden', backgroundColor: CARD_DIM, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  mapStartDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: ACCENT, borderWidth: 2, borderColor: T1 },
  mapEndDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: T1, borderWidth: 3, borderColor: ACCENT },
  emptyHint: { color: T3, fontFamily: FONT, fontSize: 14, textAlign: 'center' },

  // 콤팩트: 요약 4칸(거리/횟수/페이스/시간)의 패딩·값 폰트·여백을 줄여 세로 높이를
  // 압축한다(정보는 그대로 유지 — 라벨/값/단위 모두 렌더). 리스트가 위로 올라온다.
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryCell: { width: '47.5%', flexGrow: 1, backgroundColor: CARD_DIM, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, padding: 13 },
  // 4열 요약 행(Screens Refined) — 카드 없이 헤어라인 구분.
  sumRow: { flexDirection: 'row', marginTop: 6, marginBottom: 2 },
  sumCell: { flex: 1, paddingHorizontal: 2 },
  sumCellDiv: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: withAlpha(T1, 0.045), paddingLeft: 12 },
  sumValue: { color: T1, fontFamily: DISPLAY, fontSize: 22, fontWeight: '500', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  sumUnit: { color: T4, fontFamily: FONT, fontSize: 11, fontWeight: '500' },
  sumLabel: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500', marginTop: 5 },
  summaryLabel: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  summaryValue: { color: T1, fontFamily: DISPLAY, fontSize: 22, letterSpacing: 0.3, marginTop: 2 },
  summaryUnit: { color: T3, fontFamily: FONT, fontSize: 12, marginTop: 1 },

  runRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 18 },
  runRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEP },
  runDate: { width: 42, alignItems: 'center' },
  runDay: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500' },
  runDateNum: { color: T1, fontFamily: DISPLAY, fontSize: 17 },
  runDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: SEP, marginVertical: 2 },
  runBrand: { color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '500', letterSpacing: 1.3 },
  runModel: { color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '500', marginTop: 1 },
  runMetrics: { flexDirection: 'row', gap: 18, marginTop: 10 },
  runV: { color: T1, fontFamily: DISPLAY, fontSize: 20, letterSpacing: 0.2, fontVariant: ['tabular-nums'] },
  runU: { color: T3, fontFamily: FONT, fontSize: 12, marginLeft: 3, marginBottom: 1 },
  runML: { color: T2, fontFamily: FONT, fontSize: 11, fontWeight: '500', marginTop: 3 },

  // detail
  nav: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 6 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: RADIUS.pill, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },

  // manual-run / edit form
  formTitle: { color: T1, fontFamily: FONT, fontSize: 17, fontWeight: '600' },
  formLabel: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', marginBottom: 8, paddingHorizontal: 2 },
  formHint: { color: T3, fontFamily: FONT, fontSize: 13 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { maxWidth: '100%', backgroundColor: CARD_HI, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  chipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipTxt: { fontFamily: FONT, fontSize: 14, fontWeight: '600' },
  input: { backgroundColor: CARD, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, color: T1, fontFamily: FONT, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  // 검증 실패 시 입력칸 테두리를 빨강으로 강조하고, 아래에 인라인 헬퍼텍스트를 띄운다.
  inputErr: { borderColor: DANGER, borderWidth: 1 },
  errText: { color: DANGER, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginTop: 7, paddingHorizontal: 2 },
  // 저장/추가 CTA 는 단일 Button 프리미티브(그라데이션·글로우·radius 토큰). 화면
  // 고유 여백만 남긴다(과거 RADIUS.md 사각 ACCENT 버튼 제거).
  saveBtn: { marginTop: 6 },
  detailDate: { color: T3, fontFamily: FONT, fontSize: 13 },
  detailDist: { color: T1, fontFamily: DISPLAY, fontSize: HERO.heroLg, fontWeight: '700', letterSpacing: 0.5 },
  detailDistU: { color: T3, fontFamily: FONT, fontSize: 17, fontWeight: '500', marginLeft: 6, marginBottom: 8 },
  detailBrand: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 1.4 },
  detailModel: { color: T1, fontFamily: FONT, fontSize: 24, fontWeight: '700', letterSpacing: -0.4, marginTop: 4 },
  // 메트릭 한 카드(디자인 11) — 2x3 그리드. 칸 레이아웃·값/단위/라벨은 StatGrid
  // 프리미티브가 책임지고(columns=3·align=left), 여기선 카드 내부 여백만 얹는다.
  statGrid: { paddingVertical: 16, paddingHorizontal: GUTTER, rowGap: 18, marginTop: 16 },
});
