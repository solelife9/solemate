// ============================================================================
// HistoryScreen.rn.tsx — 기록: period segment, period chart, recent runs + RunDetail
// (sample data removed — real summary/chart/runs are injected via props)
// ============================================================================
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD, ACCENT, T1, T2, T3, SEP, FONT, DISPLAY, Shoe, Run, SHOES,
} from './theme';
import { TabBar } from './primitives';
import { Unit, displayNum } from './lib/units';

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

  return (
    <View>
      <View style={{ height: H, position: 'relative' }}>
        {ticks.map((tk, i) => (
          <View key={i} style={{ position: 'absolute', left: 0, right: 0, bottom: (tk / niceMax) * H }}>
            <View style={{ position: 'absolute', left: 0, right: 42, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP }} />
            <Text style={{ position: 'absolute', right: 0, width: 42, textAlign: 'right', color: T3, fontFamily: DISPLAY, fontSize: 11, marginBottom: -7 }}>{tk === 0 ? '0' : `${fmtTick(tk)}${unit}`}</Text>
          </View>
        ))}
        <View style={{ position: 'absolute', left: 0, right: 42, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: dense ? 4 : 8 }}>
          {data.map((v, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ width: '100%', maxWidth: dense ? 12 : 18, height: v <= 0 ? 0 : Math.max(4, (v / niceMax) * H), borderRadius: 999, backgroundColor: ACCENT }} />
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: dense ? 4 : 8, marginTop: 8, paddingRight: 42 }}>
        {labels.map((l, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', color: T3, fontFamily: FONT, fontSize: dense ? 9 : 11, fontWeight: '600' }}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

// ── run detail ────────────────────────────────────────────────────────────────
function RunDetail({ run, shoe, onBack, unit }: { run: Run; shoe?: Shoe; onBack: () => void; unit: Unit }) {
  const dash = (n: number, u: string) => (n > 0 ? { v: String(n), u } : { v: '--', u: '' });
  const stats = [
    { l: '평균 페이스', v: run.pace, u: '/km' },
    { l: '시간', v: run.time, u: '' },
    { l: '칼로리', ...dash(run.cal, 'kcal') },
    { l: '케이던스', ...dash(run.cadence, 'spm') },
    { l: '평균 심박', ...dash(run.bpm, 'bpm') },
    { l: '고도 상승', ...dash(run.elev, 'm') },
  ];
  return (
    <View style={s.screen}>
      <View style={s.nav}>
        <Pressable onPress={onBack} style={s.iconBtn}><Ionicons name="chevron-back" size={20} color={T1} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 28 }}>
        <Text style={s.detailDate}>{run.date} {run.day}요일</Text>
        <View style={[s.baselineRow, { marginTop: 8 }]}>
          <Text style={s.detailDist}>{displayNum(run.dist, unit, 2)}</Text>
          <Text style={s.detailDistU}>{unit}</Text>
        </View>
        {!!shoe && (
          <View style={[s.card, { padding: 16, marginTop: 16 }]}>
            <Text style={s.detailBrand}>{shoe.brand}</Text>
            <Text style={s.detailModel}>{shoe.model}</Text>
          </View>
        )}
        <View style={s.statGrid}>
          {stats.map((x, i) => (
            <View key={i} style={s.statCell}>
              <Text style={s.statLabel}>{x.l}</Text>
              <Text style={s.statValue}>{x.v}{x.u ? <Text style={s.statUnit}> {x.u}</Text> : null}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ── history main ────────────────────────────────────────────────────────────
function RunRow({ run, shoes, onPress, last, unit }: { run: Run; shoes: Shoe[]; onPress: () => void; last: boolean; unit: Unit }) {
  const shoe = shoes[run.shoe];
  return (
    <Pressable onPress={onPress} style={[s.runRow, !last && s.runRowBorder]}>
      <View style={s.runDate}>
        <Text style={s.runDay}>{run.day}</Text>
        <Text style={s.runDateNum}>{run.dateNum}</Text>
      </View>
      <View style={s.runDivider} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.runBrand}>{shoe ? shoe.brand : '삭제된 신발'}</Text>
        <Text style={s.runModel} numberOfLines={1}>{shoe ? shoe.model : ''}</Text>
        <View style={s.runMetrics}>
          <View><View style={s.baselineRow}><Text style={s.runV}>{displayNum(run.dist, unit, 2)}</Text><Text style={s.runU}>{unit}</Text></View><Text style={s.runML}>거리</Text></View>
          <View><Text style={s.runV}>{run.pace}</Text><Text style={s.runML}>평균 페이스</Text></View>
          <View><Text style={s.runV}>{run.time}</Text><Text style={s.runML}>시간</Text></View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={T3} />
    </Pressable>
  );
}

export default function HistoryScreen({
  shoes = SHOES, runs = [], summary = {}, chart = {}, onTab, unit = 'km',
}: {
  shoes?: Shoe[];
  runs?: Run[];
  summary?: Record<string, PeriodSummary>;
  chart?: Record<string, PeriodChart>;
  onTab?: (i: number) => void;
  // 표시 단위(km|mi). 거리·차트 눈금이 이를 따른다(요약·차트 값은 App이 환산해 주입).
  unit?: Unit;
}) {
  const [period, setPeriod] = useState('월');
  const [detail, setDetail] = useState<Run | null>(null);

  const sum = summary[period] || EMPTY_SUMMARY;
  const ch = chart[period];
  const stats = [
    { l: '거리', v: sum.km, u: unit },
    { l: '횟수', v: String(sum.runs), u: '회' },
    { l: '페이스', v: sum.pace, u: '평균' },
    { l: '시간', v: sum.time, u: '총' },
  ];

  if (detail) return <RunDetail run={detail} shoe={shoes[detail.shoe]} onBack={() => setDetail(null)} unit={unit} />;

  return (
    <View style={s.screen}>
      <View style={s.header}><Text style={s.title}>기록</Text></View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 8, gap: 16 }}>
        {/* period segment */}
        <View style={s.segment}>
          {PERIODS.map((p) => {
            const on = p === period;
            return (
              <Pressable key={p} onPress={() => setPeriod(p)} style={[s.segItem, on && s.segItemOn]}>
                <Text style={[s.segText, { color: on ? '#000' : T3, fontWeight: on ? '700' : '500' }]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* stat grid */}
        <View style={s.summaryGrid}>
          {stats.map((x, i) => (
            <View key={i} style={s.summaryCell}>
              <Text style={s.summaryLabel}>{x.l}</Text>
              <Text style={s.summaryValue}>{x.v}</Text>
              <Text style={s.summaryUnit}>{x.u}</Text>
            </View>
          ))}
        </View>

        {/* chart (hidden for 전체) */}
        {ch && ch.data.length > 0 && (
          <View style={[s.card, { padding: 22 }]}>
            <Text style={s.cardTitle}>{ch.title}</Text>
            <View style={{ marginTop: 18 }}><PeriodChartView data={ch.data} labels={ch.labels} unit={unit} /></View>
          </View>
        )}

        {/* recent runs */}
        <Text style={s.sectionLabel}>최근 러닝</Text>
        {runs.length === 0 ? (
          <View style={[s.card, { padding: 28, alignItems: 'center' }]}>
            <Text style={{ color: T3, fontFamily: FONT, fontSize: 13.5 }}>아직 기록이 없어요</Text>
          </View>
        ) : (
          <View style={[s.card, { overflow: 'hidden' }]}>
            {runs.map((r, i) => (
              <RunRow key={r.id || i} run={r} shoes={shoes} onPress={() => setDetail(r)} last={i === runs.length - 1} unit={unit} />
            ))}
          </View>
        )}
      </ScrollView>
      <TabBar active={1} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },
  card: { backgroundColor: CARD, borderRadius: 22 },
  cardTitle: { color: T2, fontFamily: FONT, fontSize: 13.5, fontWeight: '500' },
  sectionLabel: { color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: 4 },

  header: { paddingTop: 60, paddingHorizontal: 22, paddingBottom: 8 },
  title: { color: T1, fontFamily: FONT, fontSize: 32, fontWeight: '500', letterSpacing: -0.8 },

  segment: { flexDirection: 'row', gap: 4, backgroundColor: '#2C2C2E', borderRadius: 14, padding: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  segItemOn: { backgroundColor: ACCENT },
  segText: { fontFamily: FONT, fontSize: 14 },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryCell: { width: '47.5%', flexGrow: 1, backgroundColor: CARD, borderRadius: 20, padding: 17 },
  summaryLabel: { color: ACCENT, fontFamily: FONT, fontSize: 12.5, fontWeight: '600', letterSpacing: 0.2 },
  summaryValue: { color: T1, fontFamily: DISPLAY, fontSize: 32, letterSpacing: 0.3, marginTop: 6 },
  summaryUnit: { color: T3, fontFamily: FONT, fontSize: 12, marginTop: 2 },

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
  runML: { color: T3, fontFamily: FONT, fontSize: 10.5, marginTop: 2 },

  // detail
  nav: { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 6 },
  iconBtn: { width: 38, height: 38, borderRadius: 999, backgroundColor: '#2C2C2E', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  detailDate: { color: T3, fontFamily: FONT, fontSize: 13 },
  detailDist: { color: T1, fontFamily: DISPLAY, fontSize: 56, letterSpacing: 0.5 },
  detailDistU: { color: T2, fontFamily: FONT, fontSize: 20, marginLeft: 6, marginBottom: 8 },
  detailBrand: { color: T3, fontFamily: FONT, fontSize: 10.5, fontWeight: '500', letterSpacing: 1.4 },
  detailModel: { color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '500', marginTop: 3 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  statCell: { width: '31.5%', flexGrow: 1, backgroundColor: CARD, borderRadius: 18, padding: 15 },
  statLabel: { color: T3, fontFamily: FONT, fontSize: 11 },
  statValue: { color: T1, fontFamily: DISPLAY, fontSize: 21, letterSpacing: 0.3, marginTop: 7 },
  statUnit: { color: T3, fontFamily: FONT, fontSize: 10.5 },
});
