// ============================================================================
// RunActiveScreen.tsx — 러닝 중 화면 (v2 디자인 통파일)
// App.tsx 안에 인라인으로 박혀 있던 러닝 중 UI를 독립 컴포넌트로 분리한 버전.
// 디자인: 큰 거리 링(목표 달성률 center) + 시간·페이스 히어로 2칸 + 케이던스·칼로리·
//        고도 보조 3칸 + 안전 컨트롤(달리는 중=큰 일시정지 하나 / 일시정지=종료(롱프레스)+재개)
//        + 읽기 쉬운 GPS 신호바.
//
// ── 적용(App.tsx) ───────────────────────────────────────────────────────────
// 기존 인라인 "러닝 중" JSX 블록을 아래 한 줄로 교체:
//   <RunActiveScreen
//     shoeLabel={activeShoe.model}
//     distanceKm={liveDistanceKm}
//     goalKm={runGoalKm}
//     timeLabel={fmtClock(elapsedSec)}     // "28:14"
//     paceLabel={fmtPace(avgPaceSec)}      // "5'02""
//     cadence={cadence} calories={kcal} elevationM={elevM}
//     gpsLevel={gpsLevel}                  // 0~3 (신호 세기)
//     paused={paused}
//     onPause={() => setPaused(p => !p)}
//     onStop={finishRun}                   // 롱프레스로만 호출됨
//   />
// fmtClock/fmtPace 는 기존 App 유틸을 쓰거나 아래 동봉본을 사용한다.
// 의존성 추가 없음(RN 내장 + react-native-svg + 기존 primitives Ring).
// ============================================================================

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';
import { BG, ACCENT, GOOD, WARN, DANGER, T1, T2, T3, T4, SEP, FONT, DISPLAY, withAlpha } from './theme';
import { Ring } from './primitives';
import { GradientCircleButton } from './RunControlButton';

const SHOE_PATH =
  'M222-79q-32 0-61.5-12T108-127l-7-7q-9-8-11.5-20t2.5-23l194-495q8-20 27.5-30.5T354-708l58 11q17 4 32.5-2.5T471-717q14-15 18.5-31.5T489-782l-5-15q-5-16-1.5-32.5T498-858l43-43q17-18 42.5-18t42.5 17l181 184q22 23 22.5 54.5T809-609l19 19q6 7 10.5 14.5T843-560q0 7-3 14t-11 15q-12 11-28.5 11.5T772-531l-18-19-28 29 18 18q11 11 11 28t-11 28q-12 11-28.5 11.5T687-447l-18-17-112 114 17 16q12 12 12 28.5T574-277q-12 11-28.5 11.5T517-277l-16-17-28 29 16 16q11 11 11 28t-11 28q-12 11-28.5 11.5T432-193l-16-15-28 28 16 15q11 12 11 28.5T404-108q-12 11-28.5 11.5T347-108l-16-16q-23 23-50.5 34T222-79Z';

function ShoeGlyph({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960" style={{ transform: [{ scaleX: -1 }] }}>
      <Path d={SHOE_PATH} fill={color} />
    </Svg>
  );
}

// GPS 신호바 — 세기(0~3)에 따라 1~3칸을 신호 색으로 채운다(흔들리는 화면에서도 한눈에).
function GpsBars({ level }: { level: number }) {
  const col = level >= 3 ? GOOD : level === 2 ? WARN : level <= 0 ? T4 : DANGER;
  return (
    <View style={g.bars}>
      {[10, 14, 18].map((h, i) => (
        <View key={i} style={{ width: 3.5, height: h, borderRadius: 2, backgroundColor: i < level ? col : withAlpha(T1, 0.14) }} />
      ))}
    </View>
  );
}
const gpsText = (level: number) =>
  level >= 3 ? 'GPS 신호 좋음' : level === 2 ? 'GPS 신호 보통' : level <= 0 ? 'GPS 검색 중…' : 'GPS 신호 약함';
const gpsColor = (level: number) => (level >= 3 ? GOOD : level === 2 ? WARN : level <= 0 ? T3 : DANGER);

export default function RunActiveScreen({
  shoeLabel, distanceKm, goalKm, timeLabel, paceLabel,
  cadence, calories, elevationM, gpsLevel = 3, paused = false, onPause, onStop,
  permLost = false, onOpenSettings, statusLabel,
}: {
  shoeLabel: string;
  distanceKm: number;
  goalKm?: number;
  timeLabel: string;
  paceLabel: string;
  cadence?: number;
  calories?: number;
  elevationM?: number;
  gpsLevel?: number;
  paused?: boolean;
  onPause?: () => void;
  onStop?: () => void;
  // 위치 권한이 런 도중 회수되면(permLost) 거리 기록이 멈춘다 — 탭하면 설정으로 보내
  // 다시 허용하게 하는 복구 배너를 띄운다(중요: 권한 회수에서 빠져나오는 유일 경로).
  permLost?: boolean;
  onOpenSettings?: () => void;
  // 라이브 상태 라벨('러닝 중'/'일시정지'/'자동 일시정지'). 미전달 시 paused 로 폴백.
  statusLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const pct = goalKm && goalKm > 0 ? Math.min(1, distanceKm / goalKm) : 0;
  const remain = goalKm ? Math.max(0, goalKm - distanceKm) : 0;
  const sub = [
    { v: cadence && cadence > 0 ? String(cadence) : '--', l: '케이던스', u: '' },
    { v: calories && calories > 0 ? String(calories) : '--', l: '칼로리', u: 'kcal' },
    { v: elevationM != null ? String(elevationM) : '--', l: '고도', u: 'm' },
  ];

  return (
    <View style={[r.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      {/* top: live + shoe */}
      <View style={r.top}>
        <View style={r.live}>
          <View style={r.liveDot} />
          <Text style={r.liveText}>{statusLabel ?? (paused ? '일시정지' : '러닝 중')}</Text>
        </View>
        <View style={r.shoeChip}>
          <ShoeGlyph color={T3} />
          <Text style={r.shoeText}>{shoeLabel}</Text>
        </View>
      </View>

      {/* gps */}
      <View style={r.gpsRow}>
        <GpsBars level={gpsLevel} />
        <Text style={[r.gpsLabel, { color: gpsColor(gpsLevel) }]}>{gpsText(gpsLevel)}</Text>
      </View>

      {/* 권한 회수 복구 배너 — 위치 권한이 꺼지면 탭해서 설정에서 다시 허용. */}
      {permLost && (
        <Pressable onPress={onOpenSettings} accessibilityRole="button" accessibilityLabel="위치 권한 다시 허용" style={r.permBanner}>
          <Ionicons name="alert-circle" size={15} color={DANGER} />
          <Text style={r.permBannerText}>위치 권한이 꺼져 거리 기록을 멈췄어요. 눌러서 다시 허용하세요.</Text>
        </Pressable>
      )}

      {/* big ring */}
      <View style={r.ringWrap}>
        <Ring size={264} stroke={16} progress={pct} color={ACCENT}>
          <View style={{ alignItems: 'center' }}>
            {!!goalKm && <Text style={r.goal}>목표 {goalKm}km · {Math.round(pct * 100)}%</Text>}
            <Text style={r.bigDist}>{distanceKm.toFixed(2)}</Text>
            <Text style={r.bigUnit}>{goalKm ? `${remain.toFixed(2)}km 남음` : 'km'}</Text>
          </View>
        </Ring>
      </View>

      {/* hero metrics: 시간 · 페이스 */}
      <View style={r.heroMetrics}>
        <View style={r.hm}><Text style={r.hmV}>{timeLabel}</Text><Text style={r.hmL}>시간</Text></View>
        <View style={[r.hm, r.hmDivider]}><Text style={r.hmV}>{paceLabel}</Text><Text style={r.hmL}>평균 페이스</Text></View>
      </View>

      {/* sub metrics */}
      <View style={r.subMetrics}>
        {sub.map((m, i) => (
          <View key={i} style={r.sm}>
            <Text style={r.smV}>{m.v}{m.u ? <Text style={r.smU}> {m.u}</Text> : null}</Text>
            <Text style={r.smL}>{m.l}</Text>
          </View>
        ))}
      </View>

      <View style={{ flex: 1 }} />

      {/* controls */}
      <View style={r.controls}>
        {!paused ? (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <GradientCircleButton size={96} onPress={onPause} accessibilityLabel="일시정지">
              <Ionicons name="pause" size={40} color="#fff" />
            </GradientCircleButton>
            <Text style={r.ctrlHint}>일시정지</Text>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Pressable
                onLongPress={onStop}
                delayLongPress={600}
                accessibilityRole="button"
                accessibilityLabel="길게 눌러 종료"
                style={({ pressed }) => [r.stopBtn, pressed && { backgroundColor: withAlpha(DANGER, 0.18) }]}>
                <Ionicons name="stop" size={26} color={DANGER} />
              </Pressable>
              <Text style={r.ctrlHint}>길게 눌러 종료</Text>
            </View>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <GradientCircleButton size={76} onPress={onPause} accessibilityLabel="재개">
                <Ionicons name="play" size={34} color="#fff" />
              </GradientCircleButton>
              <Text style={r.ctrlHint}>재개</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const g = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2.5, height: 18 },
});

const r = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, paddingHorizontal: 24 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: DANGER },
  liveText: { color: T1, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  shoeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: withAlpha(T1, 0.05), borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  shoeText: { color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500' },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, justifyContent: 'center' },
  gpsLabel: { fontFamily: FONT, fontSize: 13, fontWeight: '600' },
  permBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: DANGER, backgroundColor: withAlpha(DANGER, 0.14) },
  permBannerText: { flex: 1, color: T1, fontFamily: FONT, fontSize: 13, fontWeight: '500', lineHeight: 17 },

  ringWrap: { alignItems: 'center', marginTop: 26 },
  goal: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginBottom: 10 },
  bigDist: { color: T1, fontFamily: DISPLAY, fontSize: 76, fontWeight: '600', letterSpacing: -2, lineHeight: 78 },
  bigUnit: { color: T3, fontFamily: FONT, fontSize: 14, fontWeight: '500', marginTop: 4 },

  heroMetrics: { flexDirection: 'row', marginTop: 30, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEP },
  hm: { flex: 1, alignItems: 'center' },
  hmDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP },
  hmV: { color: T1, fontFamily: DISPLAY, fontSize: 34, fontWeight: '600', letterSpacing: -1 },
  hmL: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500', marginTop: 5 },

  subMetrics: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16 },
  sm: { alignItems: 'center' },
  smV: { color: T2, fontFamily: DISPLAY, fontSize: 16, fontWeight: '500' },
  smU: { color: T4, fontFamily: FONT, fontSize: 10 },
  smL: { color: T4, fontFamily: FONT, fontSize: 11, fontWeight: '500', marginTop: 3 },

  controls: { flexDirection: 'row', justifyContent: 'center', gap: 40, paddingBottom: 8 },
  primaryLg: { width: 96, height: 96, borderRadius: 999, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  primary: { width: 76, height: 76, borderRadius: 999, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  stopBtn: { width: 76, height: 76, borderRadius: 999, backgroundColor: withAlpha(DANGER, 0.08), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(DANGER, 0.5), alignItems: 'center', justifyContent: 'center' },
  ctrlHint: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' },
});
