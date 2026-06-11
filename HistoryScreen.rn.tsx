// ============================================================================
// HistoryScreen.rn.tsx — 기록: period segment, period chart, recent runs + RunDetail
// (sample data removed — real summary/chart/runs are injected via props)
// ============================================================================
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, LayoutChangeEvent, Share, TextInput, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Circle } from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD, CARD_DIM, CARD_HI, ACCENT, DANGER, T1, T2, T3, T4, SEP, FONT, DISPLAY, Shoe, Run, SHOES, withAlpha,
} from './theme';
import { TabBar } from './primitives';
import { Unit, displayNum, displayToKm } from './lib/units';
import { ymdLocal, fmtPace } from './lib/format';
import { durationLabel } from './lib/stats';
import { personalRecords } from './lib/records';
import { getRunSurface, setRunSurface, type Surface } from './lib/wearModel';
import { parseRoute, projectRoute, LatLon } from './lib/route';
import { RunSplits, Split } from './RunSplits';
import { buildSplits } from './lib/splits';
import { buildRunShareText } from './lib/share';
import { buildShareCardModel, shareRunCard, SvgCapturable } from './lib/shareCard';
import ShareCard from './ShareCard';

// ── manual-run / edit form helpers ──────────────────────────────────────────
// 소요 시간 입력은 'MM:SS'(또는 분 단위 숫자)를 초로 변환한다. 빈 값/파싱 불가 → 0.
function parseDurationInput(text: string): number {
  const t = (text || '').trim();
  if (!t) return 0;
  if (t.includes(':')) {
    const [m, sec] = t.split(':');
    const mm = parseInt(m, 10);
    const ss = parseInt(sec, 10);
    return Math.max(0, (Number.isFinite(mm) ? mm : 0) * 60 + (Number.isFinite(ss) ? ss : 0));
  }
  const mins = parseFloat(t);
  return Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : 0;
}
// 초 → 'M:SS' (프리필용). 0 이하면 빈 문자열.
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
// Renders the recorded GPS route (AsyncStorage `route_<id>`, [{lat,lon}]) as a
// single react-native-svg polyline. Native deps: 0 (svg only). The map sizes to
// the card width (measured on layout) at a fixed height, and projection is the
// pure projectRoute() so the visual is fully unit-tested. An empty/invalid route
// renders nothing — the caller hides the whole card on `points.length < 2`.
const MAP_H = 180;
const MAP_PAD = 16;

function CourseMap({ points }: { points: LatLon[] }) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  if (points.length < 2) return null;
  const proj = w > 0 ? projectRoute(points, { width: w, height: MAP_H, padding: MAP_PAD }) : null;
  const start = proj?.points[0];
  const end = proj?.points[proj.points.length - 1];
  return (
    <View style={[s.card, { padding: 16, marginTop: 16 }]}>
      <Text style={s.detailBrand}>코스</Text>
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
    </View>
  );
}

// ── manual-run input / run edit form ────────────────────────────────────────
// 한 폼으로 '수동 입력'(initial=null)과 '편집'(initial=Run)을 모두 처리한다. 거리는
// 표시 단위(km|mi)로 입력받아 displayToKm로 저장 표준 km으로 되돌리고, 시간은 'MM:SS'를
// 초로, 날짜는 'YYYY-MM-DD'로 받는다. 신발은 칩으로 고른다(편집 시 원래 신발이 프리필).
function RunForm({
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

  const submit = () => {
    const dispKm = parseFloat(dist);
    if (!shoeId) { Alert.alert('알림', '신발을 선택하세요'); return; }
    if (!Number.isFinite(dispKm) || dispKm <= 0) { Alert.alert('알림', '거리를 0보다 크게 입력하세요'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert('알림', '날짜는 YYYY-MM-DD 형식으로 입력하세요'); return; }
    onSubmit({ shoeId, km: displayToKm(dispKm, unit), date, durationSec: parseDurationInput(dur), surface });
  };

  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={[s.nav, s.navRow]}>
        <Pressable onPress={onCancel} hitSlop={6} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}><Ionicons name="chevron-back" size={20} color={T1} /></Pressable>
        <Text style={s.formTitle}>{editing ? '러닝 편집' : '수동 기록 추가'}</Text>
        <View style={s.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, gap: 18 }}>
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
                    onPress={() => sh.id && setShoeId(sh.id)}
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
        </View>
        {/* 거리 */}
        <View>
          <Text style={s.formLabel}>거리 ({unit})</Text>
          <TextInput
            value={dist}
            onChangeText={setDist}
            keyboardType="decimal-pad"
            placeholder={`예: 5.0`}
            placeholderTextColor={T3}
            style={s.input}
            accessibilityLabel="거리"
          />
        </View>
        {/* 시간 */}
        <View>
          <Text style={s.formLabel}>시간 (MM:SS)</Text>
          <TextInput
            value={dur}
            onChangeText={setDur}
            placeholder="예: 30:00 (선택)"
            placeholderTextColor={T3}
            style={s.input}
            accessibilityLabel="시간"
          />
        </View>
        {/* 날짜 */}
        <View>
          <Text style={s.formLabel}>날짜 (YYYY-MM-DD)</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="2026-06-01"
            placeholderTextColor={T3}
            style={s.input}
            accessibilityLabel="날짜"
          />
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
        <Pressable onPress={submit} style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button">
          <Text style={s.saveBtnTxt}>{editing ? '저장하기' : '추가하기'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ── run detail ────────────────────────────────────────────────────────────────
function RunDetail({ run, shoe, onBack, unit, onEdit, onDelete }: { run: Run; shoe?: Shoe; onBack: () => void; unit: Unit; onEdit?: () => void; onDelete?: (id: string) => void }) {
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
  // 공유 입력(텍스트·카드 폴백이 같은 필드를 쓰도록 단일 출처로 둔다).
  const shareInput = {
    distKm: run.dist,
    unit,
    pace: run.pace,
    time: run.time,
    shoeBrand: shoe?.brand,
    shoeModel: shoe?.model,
    date: `${run.date} ${run.day}요일`,
  };
  // 거리/페이스/시간/신발명을 keep-going 톤 한국어 요약으로 만들어 RN Share API로
  // 내보낸다(네이티브 추가 0). 사용자가 공유 시트를 닫거나 실패해도 조용히 무시.
  const onShare = () => {
    Share.share({ message: buildRunShareText(shareInput) }).catch(() => {});
  };
  // 이미지 카드 공유: 화면 밖에 마운트된 <ShareCard>의 Svg ref.toDataURL()로 PNG
  // dataURL을 만들어 RN Share로 내보낸다. 새 네이티브 의존 없이 react-native-svg만
  // 사용. 캡처 실패 시 텍스트 공유로 조용히 폴백한다(shareRunCard 내부 처리).
  const cardRef = useRef<SvgCapturable | null>(null);
  const cardModel = buildShareCardModel(shareInput);
  const onShareCard = () => {
    shareRunCard(cardRef, shareInput);
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
          {!!onEdit && (
            <Pressable onPress={onEdit} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="편집">
              <Ionicons name="create-outline" size={18} color={T1} />
            </Pressable>
          )}
          <Pressable onPress={onShareCard} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="카드 공유">
            <Ionicons name="image-outline" size={18} color={ACCENT} />
          </Pressable>
          <Pressable onPress={onShare} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="공유">
            <Ionicons name="share-outline" size={18} color={T1} />
          </Pressable>
          {!!onDelete && (
            <Pressable onPress={confirmDelete} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="삭제">
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
        <Text style={s.detailDate}>{run.date} {run.day}요일</Text>
        <View style={[s.baselineRow, { marginTop: 8 }]}>
          <Text style={s.detailDist}>{displayNum(run.dist, unit, 2)}</Text>
          <Text style={s.detailDistU}>{unit}</Text>
        </View>
        {/* 메트릭 한 카드(디자인 11): 2x3 그리드(값 위 · 라벨 아래, 좌측 정렬). */}
        <View style={[s.card, s.statGrid]}>
          {stats.map((x, i) => (
            <View key={i} style={s.statCell}>
              <Text style={s.statValue}>{x.v}{x.u ? <Text style={s.statUnit}> {x.u}</Text> : null}</Text>
              <Text style={s.statLabel}>{x.l}</Text>
            </View>
          ))}
        </View>
        {/* 달린 위치(경로) 지도 — route_<id> 가 있으면 SVG 코스맵으로 표시(없으면 자동 숨김). */}
        <CourseMap points={route} />
        {/* 구간별 페이스 스플릿 — run.splits(구간 데이터)가 있을 때만 표시(없으면 자동 숨김) */}
        <RunSplits splits={recordedSplits.length >= 2 ? recordedSplits : buildSplits(run, route)} />
      </ScrollView>
      {/* 공유 카드: 화면 밖(off-screen)에 마운트해 toDataURL 캡처 대상으로만 쓴다.
          pointerEvents none + 음수 위치라 사용자에겐 보이지 않지만 레이아웃은 된다. */}
      <View style={s.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ShareCard ref={cardRef} model={cardModel} route={route} />
      </View>
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
          <Text style={s.runCardBrand}>{shoe ? shoe.brand : '삭제된 신발'}</Text>
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
  onAddRun, onEditRun, onDeleteRun,
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
}) {
  const [period, setPeriod] = useState('월');
  const [detail, setDetail] = useState<Run | null>(null);
  // 폼 상태: 'add'(수동 입력) | {edit, run}(편집). null이면 목록 화면.
  const [form, setForm] = useState<null | { mode: 'add' } | { mode: 'edit'; run: Run }>(null);
  const insets = useSafeAreaInsets();

  const sum = summary[period] || EMPTY_SUMMARY;
  const ch = chart[period];
  // 개인 기록(PR, 1-3) — 전체 런 기준 올타임 기록(기간 탭과 무관). 동기부여 카드.
  const pr = personalRecords(runs);
  // 기간 제목(요약 카드) — 목업 TITLES 정합.
  const periodTitle = period === '주' ? '이번 주' : period === '월' ? '이번 달' : period === '년' ? '올해' : '전체 기간';

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
        onEdit={onEditRun ? () => setForm({ mode: 'edit', run: detail }) : undefined}
        onDelete={onDeleteRun}
      />
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={[s.header, s.headerRow]}>
        <Text style={s.title}>기록</Text>
        {!!onAddRun && (
          <Pressable onPress={() => setForm({ mode: 'add' })} hitSlop={8} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="수동 기록 추가">
            <Ionicons name="add" size={22} color={T1} />
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 8, gap: 10 }}>
        {/* period segment */}
        <View style={s.segment}>
          {PERIODS.map((p) => {
            const on = p === period;
            return (
              <Pressable key={p} onPress={() => setPeriod(p)} accessibilityRole="button" accessibilityLabel={p} accessibilityState={{ selected: on }} style={({ pressed }) => [s.segItem, on && s.segItemOn, pressed && !on && { opacity: 0.7 }]}>
                <Text style={[s.segText, { color: on ? T1 : T3, fontWeight: on ? '700' : '500' }]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* 요약 카드 — 목업 기록(10): 기간 제목 + 큰 거리 + 'N번 달렸어요' + 횟수·평균페이스·총시간 */}
        <View style={[s.card, { padding: 20 }]}>
          <Text style={s.sumTitle}>{periodTitle}</Text>
          <View style={[s.baselineRow, { marginTop: 6 }]}>
            <Text style={s.sumBigKm}>{sum.km}</Text><Text style={s.sumBigU}>{unit}</Text>
          </View>
          <Text style={s.sumSub}>{periodTitle} {sum.runs}번 달렸어요</Text>
          <View style={s.sumMetricRow}>
            <View style={s.sumMetric}><Text style={s.sumMetricV}>{sum.runs}<Text style={s.sumMetricU}> 회</Text></Text><Text style={s.sumMetricL}>횟수</Text></View>
            <View style={s.sumMetric}><Text style={s.sumMetricV}>{sum.pace}</Text><Text style={s.sumMetricL}>평균 페이스</Text></View>
            <View style={s.sumMetric}><Text style={s.sumMetricV}>{sum.time}</Text><Text style={s.sumMetricL}>총 시간</Text></View>
          </View>
        </View>

        {/* chart (hidden for 전체) */}
        {ch && ch.data.length > 0 && (
          <View style={[s.card, { padding: 22 }]}>
            <Text style={s.cardTitle}>{ch.title}</Text>
            <View style={{ marginTop: 18 }}><PeriodChartView data={ch.data} labels={ch.labels} unit={unit} /></View>
          </View>
        )}

        {/* 개인 기록(PR, 1-3) — 올타임 최장거리·최고페이스·최장시간·최장 스트릭. 동기부여. */}
        {pr.count > 0 && (
          <View style={[s.card, { padding: 20 }]}>
            <Text style={s.cardTitle}>개인 기록</Text>
            <View style={s.prGrid}>
              <View style={s.prCell}>
                <View style={s.baselineRow}>
                  <Text style={s.prV}>{displayNum(pr.longestKm, unit, 1)}</Text>
                  <Text style={s.prU}>{unit}</Text>
                </View>
                <Text style={s.prL}>최장 거리</Text>
              </View>
              <View style={s.prCell}>
                <Text style={s.prV}>{pr.fastestPaceSec != null ? fmtPace(1, pr.fastestPaceSec) : '--'}</Text>
                <Text style={s.prL}>최고 페이스</Text>
              </View>
              <View style={s.prCell}>
                <Text style={s.prV}>{pr.longestDurationS > 0 ? durationLabel(pr.longestDurationS) : '--'}</Text>
                <Text style={s.prL}>최장 시간</Text>
              </View>
              <View style={s.prCell}>
                <View style={s.baselineRow}>
                  <Text style={s.prV}>{pr.longestStreakDays}</Text>
                  <Text style={s.prU}>일</Text>
                </View>
                <Text style={s.prL}>최장 스트릭</Text>
              </View>
            </View>
          </View>
        )}

        {/* recent runs — 런마다 별도 카드(목업 정합) */}
        <Text style={s.sectionLabel}>최근 러닝</Text>
        {runs.length === 0 ? (
          <View style={[s.card, { padding: 28, alignItems: 'center' }]}>
            <Text style={s.emptyHint}>아직 기록이 없어요 — 첫 러닝이 여기 쌓여요</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {runs.map((r, i) => (
              <RunCard key={r.id || i} run={r} shoes={shoes} onPress={() => setDetail(r)} unit={unit} />
            ))}
          </View>
        )}
      </ScrollView>
      <TabBar active={2} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  // 공유 카드 캡처용: 화면 밖(좌측 far-off)으로 밀어 보이지 않게 하되 마운트는 유지.
  offscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },
  card: { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: SEP },
  cardTitle: { color: T2, fontFamily: FONT, fontSize: 13.5, fontWeight: '500' },
  sectionLabel: { color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: 4 },
  // 요약 카드(큰 거리) — 목업 기록(10)
  sumTitle: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  sumBigKm: { color: T1, fontFamily: DISPLAY, fontSize: 42, fontWeight: '800', letterSpacing: -1 },
  sumBigU: { color: T3, fontFamily: FONT, fontSize: 18, fontWeight: '600', marginLeft: 4 },
  sumSub: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginTop: 2 },
  sumMetricRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP },
  sumMetric: {},
  sumMetricV: { color: T1, fontFamily: DISPLAY, fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  sumMetricU: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600' },
  sumMetricL: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500', marginTop: 4 },
  // 개인 기록(PR, 1-3) — 2x2 그리드(최장거리/최고페이스/최장시간/최장스트릭).
  prGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, rowGap: 18 },
  prCell: { width: '50%' },
  prV: { color: T1, fontFamily: DISPLAY, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  prU: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', marginLeft: 3 },
  prL: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500', marginTop: 5 },
  // 런 카드 — 목업 기록(10): 신발+날짜 + 거리·평균페이스·시간
  runCard: { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: SEP, padding: 18 },
  runCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  runCardBrand: { color: T3, fontFamily: DISPLAY, fontSize: 11, fontWeight: '500', letterSpacing: 1.2 },
  runCardModel: { color: T1, fontFamily: DISPLAY, fontSize: 16, fontWeight: '700', letterSpacing: -0.2, marginTop: 2 },
  runCardDate: { color: T3, fontFamily: FONT, fontSize: 12.5, fontWeight: '500', flexShrink: 0 },
  // 메트릭 3칸을 균등 1/3 폭으로 고정 — 거리 숫자 폭이 달라도 평균페이스·시간 열 위치가
  // 흔들리지 않아 카드끼리 세로로 정렬된다(사용자 요청: 자리 고정).
  runCardMetrics: { flexDirection: 'row' },
  runCardMetric: { flex: 1 },

  header: { paddingTop: 8, paddingHorizontal: 22, paddingBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: T1, fontFamily: FONT, fontSize: 28, fontWeight: '500', letterSpacing: -0.8 },

  // 콤팩트: 세그먼트 컨테이너 패딩·항목 내부 패딩·폰트를 줄여 세로를 압축한다.
  // 단, 터치 타깃은 접근성(≥44pt)을 위해 minHeight 44 를 유지한다(폴리시 회귀 가드).
  segment: { flexDirection: 'row', gap: 3, backgroundColor: withAlpha(T1, 0.035), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.07), borderRadius: 13, padding: 3 },
  segItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 10 },
  segItemOn: { backgroundColor: withAlpha(T1, 0.09) },
  segText: { fontFamily: FONT, fontSize: 13.5 },

  // bar chart (right-side km gridlines · accent bars)
  chartGrid: { position: 'absolute', left: 0, right: 0 },
  chartGridLine: { position: 'absolute', left: 0, right: 42, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP },
  chartTick: { position: 'absolute', right: 0, width: 42, textAlign: 'right', color: T3, fontFamily: DISPLAY, fontSize: 11, marginBottom: -7 },
  chartBars: { position: 'absolute', left: 0, right: 42, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end' },
  chartBarSlot: { flex: 1, alignItems: 'center' },
  chartBar: { width: '100%', borderRadius: 999, backgroundColor: ACCENT },
  chartLabels: { flexDirection: 'row', marginTop: 8, paddingRight: 42 },
  chartLabel: { flex: 1, textAlign: 'center', color: T3, fontFamily: FONT, fontWeight: '600' },
  chartTipWrap: { position: 'absolute', left: -26, right: -26, alignItems: 'center', zIndex: 5 },
  chartTip: { backgroundColor: CARD_HI, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.14) },
  chartTipVal: { color: T1, fontFamily: DISPLAY, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  chartTipU: { color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '500' },

  // course map (recessed well, svg polyline)
  mapWell: { height: MAP_H, marginTop: 10, borderRadius: 14, overflow: 'hidden', backgroundColor: CARD_DIM, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  emptyHint: { color: T3, fontFamily: FONT, fontSize: 13.5, textAlign: 'center' },

  // 콤팩트: 요약 4칸(거리/횟수/페이스/시간)의 패딩·값 폰트·여백을 줄여 세로 높이를
  // 압축한다(정보는 그대로 유지 — 라벨/값/단위 모두 렌더). 리스트가 위로 올라온다.
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryCell: { width: '47.5%', flexGrow: 1, backgroundColor: CARD_DIM, borderRadius: 16, borderWidth: 1, borderColor: SEP, padding: 13 },
  // 4열 요약 행(Screens Refined) — 카드 없이 헤어라인 구분.
  sumRow: { flexDirection: 'row', marginTop: 6, marginBottom: 2 },
  sumCell: { flex: 1, paddingHorizontal: 2 },
  sumCellDiv: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: withAlpha(T1, 0.045), paddingLeft: 12 },
  sumValue: { color: T1, fontFamily: DISPLAY, fontSize: 22, fontWeight: '500', letterSpacing: -0.4 },
  sumUnit: { color: T4, fontFamily: FONT, fontSize: 10.5, fontWeight: '500' },
  sumLabel: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500', marginTop: 5 },
  summaryLabel: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  summaryValue: { color: T1, fontFamily: DISPLAY, fontSize: 22, letterSpacing: 0.3, marginTop: 2 },
  summaryUnit: { color: T3, fontFamily: FONT, fontSize: 11.5, marginTop: 1 },

  runRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 18 },
  runRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEP },
  runDate: { width: 42, alignItems: 'center' },
  runDay: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500' },
  runDateNum: { color: T1, fontFamily: DISPLAY, fontSize: 17 },
  runDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: SEP, marginVertical: 2 },
  runBrand: { color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '500', letterSpacing: 1.3 },
  runModel: { color: T1, fontFamily: FONT, fontSize: 13.5, fontWeight: '500', marginTop: 1 },
  runMetrics: { flexDirection: 'row', gap: 18, marginTop: 10 },
  runV: { color: T1, fontFamily: DISPLAY, fontSize: 20, letterSpacing: 0.2 },
  runU: { color: T3, fontFamily: FONT, fontSize: 11.5, marginLeft: 3, marginBottom: 1 },
  runML: { color: T2, fontFamily: FONT, fontSize: 11, fontWeight: '500', marginTop: 3 },

  // detail
  nav: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 6 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 999, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },

  // manual-run / edit form
  formTitle: { color: T1, fontFamily: FONT, fontSize: 17, fontWeight: '600' },
  formLabel: { color: T2, fontFamily: FONT, fontSize: 13.5, fontWeight: '600', marginBottom: 8, paddingHorizontal: 2 },
  formHint: { color: T3, fontFamily: FONT, fontSize: 13 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { maxWidth: '100%', backgroundColor: CARD_HI, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  chipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipTxt: { fontFamily: FONT, fontSize: 13.5, fontWeight: '600' },
  input: { backgroundColor: CARD, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, color: T1, fontFamily: FONT, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  saveBtn: { backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  saveBtnTxt: { color: BG, fontFamily: FONT, fontSize: 16, fontWeight: '700' },
  detailDate: { color: T3, fontFamily: FONT, fontSize: 13 },
  detailDist: { color: T1, fontFamily: DISPLAY, fontSize: 56, letterSpacing: 0.5 },
  detailDistU: { color: T2, fontFamily: FONT, fontSize: 20, marginLeft: 6, marginBottom: 8 },
  detailBrand: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 1.4 },
  detailModel: { color: T1, fontFamily: FONT, fontSize: 24, fontWeight: '700', letterSpacing: -0.4, marginTop: 4 },
  // 메트릭 한 카드(디자인 11) — 2x3 그리드. 값(위)·라벨(아래) 좌측 정렬, 칸마다 별도
  // 박스 없이 한 카드 안에 균등 1/3 폭으로 배치(이전 칸별 카드 → 한 카드).
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 16, paddingHorizontal: 20, rowGap: 18, marginTop: 16 },
  statCell: { width: '33.33%', paddingVertical: 6 },
  statValue: { color: T1, fontFamily: DISPLAY, fontSize: 21, fontWeight: '700', letterSpacing: 0.2 },
  statUnit: { color: T3, fontFamily: FONT, fontSize: 11.5, fontWeight: '500' },
  statLabel: { color: T3, fontFamily: FONT, fontSize: 11.5, marginTop: 4 },
});
