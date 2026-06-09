// ============================================================================
// RunGoalScreen.rn.tsx — 러닝 목표(키로수) 설정 · 목업 그대로 (standalone)
// `Keego Run Goal.html` 을 RN 으로 1:1. 외부 의존 없음(색·폰트·아이콘·그라데이션
// 전부 파일 내장). 의존성은 react-native-svg 뿐.
//
// 드롭인:  <RunGoalScreen onStart={(km)=>{}} onBack={()=>{}} />
//   - 파라미터 없이도 목업 기본 상태(거리 5.0km)로 바로 렌더됨.
//   - onStart(goalKm): goalKm=0 이면 자유 러닝.
//
// 폰트: 숫자=Barlow, 본문=Pretendard 패밀리명을 참조(프로젝트에 번들돼 있으면 그대로,
//       없으면 시스템 폰트로 폴백 — 레이아웃은 동일).
// ============================================================================

import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet,
  LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent, StatusBar,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

// ── 토큰(목업과 동일) ─────────────────────────────────────────────────────────
const C = {
  bg: '#000000', surface: '#0F0F10',
  accent: '#FF6500', sage: '#30D158', amber: '#FF9F0A', red: '#FF453A',
  t1: '#F4F4F6', t2: '#C2C2C8', t3: '#7E7E85', t4: '#54545b',
  hair: 'rgba(255,255,255,0.07)', hair2: 'rgba(255,255,255,0.045)',
};
const UI = 'PretendardVariable';
const DP = 'Barlow-Medium';

// ── SVG 아이콘(자체 그림 — vector-icons 의존 제거) ───────────────────────────
function Icon({ name, size = 22, color = C.t2, fill }: { name: string; size?: number; color?: string; fill?: string }) {
  const sw = 2;
  const p: Record<string, React.ReactNode> = {
    back: <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    forward: <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    play: <Path d="M7 5v14l11-7z" fill={fill || color} />,
    infinite: <Path d="M6 12c0-2.2 1.6-4 3.7-4 1.6 0 2.6 1 3.3 2 .7 1 1.7 2 3.3 2 2.1 0 3.7-1.8 3.7-4s-1.6-4-3.7-4c-1.6 0-2.6 1-3.3 2-.7 1-1.7 2-3.3 2-2.1 0-3.7-1.8-3.7-4" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24">{p[name]}</Svg>;
}

const SHOE_PATH =
  'M222-79q-32 0-61.5-12T108-127l-7-7q-9-8-11.5-20t2.5-23l194-495q8-20 27.5-30.5T354-708l58 11q17 4 32.5-2.5T471-717q14-15 18.5-31.5T489-782l-5-15q-5-16-1.5-32.5T498-858l43-43q17-18 42.5-18t42.5 17l181 184q22 23 22.5 54.5T809-609l19 19q11 11 11 28t-11 28q-12 11-28.5 11.5T772-531l-18-19-28 29 18 18q11 11 11 28t-11 28q-12 11-28.5 11.5T687-447l-18-17-112 114 17 16q12 12 12 28.5T574-277q-12 11-28.5 11.5T517-277l-16-17-28 29 16 16q11 11 11 28t-11 28q-12 11-28.5 11.5T432-193l-16-15-28 28 16 15q11 12 11 28.5T404-108q-12 11-28.5 11.5T347-108l-16-16q-23 23-50.5 34T222-79Z';
function ShoeGlyph({ color, size = 24 }: { color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 -960 960 960" style={{ transform: [{ scaleX: -1 }] }}><Path d={SHOE_PATH} fill={color} /></Svg>;
}

type Mode = 'km' | 'min' | 'free';
const CFG: Record<'km' | 'min', { min: number; max: number; step: number; major: number; minor: number; px: number; unit: string; def: number; presets: { label: string; v: number }[] }> = {
  km:  { min: 0, max: 42, step: 0.1, major: 1, minor: 0.2, px: 64, unit: 'km', def: 5,  presets: [{ label: '3km', v: 3 }, { label: '5km', v: 5 }, { label: '10km', v: 10 }, { label: '하프', v: 21.1 }] },
  min: { min: 0, max: 180, step: 1, major: 10, minor: 1, px: 6.2, unit: '분', def: 30, presets: [{ label: '20분', v: 20 }, { label: '30분', v: 30 }, { label: '45분', v: 45 }, { label: '60분', v: 60 }] },
};

export default function RunGoalScreen({
  shoeBrand = 'NIKE', shoeLabel = 'Alphafly 3', shoeCondition = '양호', remainKm = 382,
  onBack, onStart,
}: {
  shoeBrand?: string; shoeLabel?: string; shoeCondition?: '양호' | '주의' | '교체'; remainKm?: number;
  onBack?: () => void; onStart?: (goalKm: number) => void;
}) {
  const [mode, setMode] = useState<Mode>('km');
  const [val, setVal] = useState<number>(CFG.km.def);
  const [vpW, setVpW] = useState(0);
  const rulerRef = useRef<ScrollView>(null);
  const programmatic = useRef(false);
  const cfg = mode === 'free' ? null : CFG[mode];

  const ticks = useMemo(() => {
    if (!cfg) return [] as { v: number; major: boolean }[];
    const out: { v: number; major: boolean }[] = [];
    const steps = Math.round((cfg.max - cfg.min) / cfg.minor);
    for (let i = 0; i <= steps; i++) {
      const v = +(cfg.min + i * cfg.minor).toFixed(4);
      out.push({ v, major: Math.abs(v % cfg.major) < 1e-6 });
    }
    return out;
  }, [cfg]);

  const fmt = (v: number) => (mode === 'km' ? v.toFixed(1) : String(Math.round(v)));
  const estimate = useMemo(() => {
    if (mode === 'free' || !cfg) return '';
    if (val <= 0) return '목표를 정해주세요';
    return mode === 'km'
      ? `예상 시간 약 ${Math.round(val * 5)}분 · 약 ${Math.round(val * 64)} kcal`
      : `예상 거리 약 ${(val / 5).toFixed(1)}km · 약 ${Math.round(val * 12.8)} kcal`;
  }, [mode, val, cfg]);

  const scrollToVal = useCallback((v: number, animated: boolean) => {
    if (!cfg) return;
    programmatic.current = true;
    rulerRef.current?.scrollTo({ x: v * cfg.px, animated });
    setTimeout(() => { programmatic.current = false; }, animated ? 380 : 60);
  }, [cfg]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (programmatic.current || !cfg) return;
    let v = e.nativeEvent.contentOffset.x / cfg.px;
    v = Math.max(cfg.min, Math.min(cfg.max, v));
    v = Math.round(v / cfg.step) * cfg.step;
    v = +v.toFixed(cfg.step < 1 ? 1 : 0);
    setVal(prev => (Math.abs(prev - v) > 1e-9 ? v : prev));
  }, [cfg]);

  const onRulerLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w && w !== vpW) { setVpW(w); requestAnimationFrame(() => scrollToVal(val, false)); }
  };
  const pickMode = (m: Mode) => {
    setMode(m);
    if (m !== 'free') { const d = CFG[m].def; setVal(d); requestAnimationFrame(() => scrollToVal(d, false)); }
  };
  const pickPreset = (v: number) => { setVal(v); scrollToVal(v, true); };
  const condColor = shoeCondition === '교체' ? C.red : shoeCondition === '주의' ? C.amber : C.sage;
  const half = vpW / 2;

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" />
      {/* nav */}
      <View style={s.nav}>
        <Pressable onPress={onBack} hitSlop={8} style={s.navIc}><Icon name="back" size={24} color={C.t2} /></Pressable>
        <Text style={s.navTitle}>러닝 목표</Text>
        <View style={s.navIc} />
      </View>

      {/* segmented */}
      <View style={s.seg}>
        {([['km', '거리'], ['min', '시간'], ['free', '자유 러닝']] as [Mode, string][]).map(([m, label]) => {
          const on = mode === m;
          return (
            <Pressable key={m} onPress={() => pickMode(m)} style={[s.segBtn, on && s.segBtnOn]}>
              <Text style={[s.segText, on && s.segTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* center */}
      <View style={s.center}>
        {mode === 'free' ? (
          <View style={s.free}>
            <View style={s.freeGlyph}><Icon name="infinite" size={40} color={C.accent} /></View>
            <Text style={s.freeTitle}>목표 없이 자유롭게</Text>
            <Text style={s.freeSub}>거리·시간 제한 없이 달려요. 기록은 그대로 신발에 쌓입니다.</Text>
          </View>
        ) : (
          <>
            <View style={s.bigRow}>
              <Text style={s.bigVal}>{fmt(val)}</Text>
              <Text style={s.bigUnit}>{cfg!.unit}</Text>
            </View>
            <Text style={s.estimate}>{estimate}</Text>

            <View style={s.rulerWrap} onLayout={onRulerLayout}>
              <ScrollView
                ref={rulerRef} horizontal showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16} onScroll={onScroll} decelerationRate="fast"
                snapToInterval={cfg!.step * cfg!.px}
                contentContainerStyle={{ paddingHorizontal: half }}>
                <View style={{ width: cfg!.max * cfg!.px, height: 78 }}>
                  {ticks.map((t, i) => (
                    <View key={i} pointerEvents="none" style={[s.tick, t.major ? s.tickMajor : s.tickMinor, { left: t.v * cfg!.px - 1 }]} />
                  ))}
                  {ticks.filter(t => t.major).map((t, i) => (
                    <Text key={`l${i}`} pointerEvents="none" style={[s.tickLabel, { left: t.v * cfg!.px - 14 }]}>{Math.round(t.v)}</Text>
                  ))}
                </View>
              </ScrollView>
              <View pointerEvents="none" style={s.pointer} />
            </View>

            <View style={s.presets}>
              {cfg!.presets.map(p => {
                const on = Math.abs(p.v - val) < (mode === 'km' ? 0.05 : 0.5);
                return (
                  <Pressable key={p.label} onPress={() => pickPreset(p.v)} style={[s.preset, on && s.presetOn]}>
                    <Text style={[s.presetText, on && s.presetTextOn]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>

      {/* footer */}
      <View style={s.foot}>
        <Pressable style={s.shoeSel}>
          <View style={s.shoeThumb}><ShoeGlyph color={C.t2} size={24} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.shoeBrand}>{shoeBrand}</Text>
            <Text style={s.shoeModel} numberOfLines={1}>{shoeLabel}</Text>
            <View style={s.shoeCond}>
              <View style={[s.shoeDot, { backgroundColor: condColor }]} />
              <Text style={s.shoeCondText}>{shoeCondition}{remainKm != null ? ` · 남은 수명 ${Math.round(remainKm)}km` : ''}</Text>
            </View>
          </View>
          <Icon name="forward" size={20} color={C.t4} />
        </Pressable>

        <Pressable onPress={() => onStart?.(mode === 'free' ? 0 : val)} style={({ pressed }) => [s.cta, pressed && { opacity: 0.92 }]}>
          <Svg style={StyleSheet.absoluteFill}>
            <Defs><LinearGradient id="ctaGrad" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#FF7A2E" /><Stop offset="1" stopColor="#F25E00" /></LinearGradient></Defs>
            <Rect x="0" y="0" width="100%" height="100%" rx={18} ry={18} fill="url(#ctaGrad)" />
          </Svg>
          <View pointerEvents="none" style={s.ctaGloss} />
          <Icon name="play" size={22} color="#fff" fill="#fff" />
          <Text style={s.ctaText}>러닝 시작</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingTop: 54 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 44 },
  navIc: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle: { color: C.t1, fontFamily: DP, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },

  seg: { flexDirection: 'row', gap: 4, marginHorizontal: 22, marginTop: 14, padding: 4, borderRadius: 14, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hair },
  segBtn: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: 'rgba(255,101,0,0.16)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,101,0,0.28)' },
  segText: { color: C.t3, fontFamily: UI, fontSize: 13.5, fontWeight: '600' },
  segTextOn: { color: C.accent },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end' },
  bigVal: { color: C.t1, fontFamily: DP, fontSize: 104, fontWeight: '600', letterSpacing: -3, lineHeight: 104, includeFontPadding: false },
  bigUnit: { color: C.t2, fontFamily: UI, fontSize: 26, fontWeight: '600', marginLeft: 8, marginBottom: 12 },
  estimate: { color: C.t3, fontFamily: UI, fontSize: 13, fontWeight: '500', marginTop: 14 },

  rulerWrap: { width: '100%', height: 78, marginTop: 30, position: 'relative' },
  tick: { position: 'absolute', bottom: 26, width: 2, borderRadius: 2 },
  tickMinor: { height: 14, backgroundColor: 'rgba(255,255,255,0.18)' },
  tickMajor: { height: 26, backgroundColor: 'rgba(255,255,255,0.38)' },
  tickLabel: { position: 'absolute', bottom: 2, width: 28, textAlign: 'center', color: C.t3, fontFamily: DP, fontSize: 12, fontWeight: '500' },
  pointer: { position: 'absolute', left: '50%', marginLeft: -1.5, top: 2, bottom: 24, width: 3, borderRadius: 3, backgroundColor: C.accent },

  presets: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 26 },
  preset: { height: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.hair },
  presetOn: { backgroundColor: 'rgba(255,101,0,0.14)', borderColor: 'rgba(255,101,0,0.4)' },
  presetText: { color: C.t2, fontFamily: DP, fontSize: 13, fontWeight: '600' },
  presetTextOn: { color: C.accent },

  free: { alignItems: 'center', paddingHorizontal: 14 },
  freeGlyph: { width: 88, height: 88, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,101,0,0.1)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,101,0,0.26)', marginBottom: 22 },
  freeTitle: { color: C.t1, fontFamily: DP, fontSize: 24, fontWeight: '600', letterSpacing: -0.4, marginBottom: 10 },
  freeSub: { color: C.t3, fontFamily: UI, fontSize: 14, fontWeight: '500', lineHeight: 21, textAlign: 'center', maxWidth: 250 },

  foot: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 30 },
  shoeSel: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, borderRadius: 20, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hair },
  shoeThumb: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#161618', borderWidth: StyleSheet.hairlineWidth, borderColor: C.hair },
  shoeBrand: { color: C.t3, fontFamily: DP, fontSize: 10, fontWeight: '600', letterSpacing: 1.4 },
  shoeModel: { color: C.t1, fontFamily: UI, fontSize: 15, fontWeight: '600', letterSpacing: -0.2, marginTop: 2 },
  shoeCond: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  shoeDot: { width: 6, height: 6, borderRadius: 999 },
  shoeCondText: { color: C.t3, fontFamily: UI, fontSize: 11.5, fontWeight: '500' },

  cta: { marginTop: 14, height: 60, borderRadius: 18, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  ctaGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  ctaText: { color: '#fff', fontFamily: UI, fontSize: 16.5, fontWeight: '700', letterSpacing: 0.3 },
});
