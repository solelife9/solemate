// ============================================================================
// RaceMedalScreen.rn.tsx — 대회 메달 기록 흐름 (완주 감지 배너 → 여기로)
// 1) 대회 선택(검색 + 러닝 날짜 근접순 + 직접 입력) — geo 감지면 프리셋으로 시작
// 2) 기록: 메달 원형 촬영 + 기록증 촬영(→ OCR 자동 채움) + 공식 기록/페이스/종목/BIB 확인
//    → 저장(addMedal 은 App). 정본 = 공식 기록(칩 타임); 앱 측정은 참고.
// OCR 인식기(recognizer)는 네이티브 모듈 주입 — 없거나 실패하면 직접 입력으로 폴백.
// ============================================================================
import React, {useMemo, useState} from 'react';
import {View, Text, ScrollView, Pressable, TextInput, Image, StyleSheet, ActivityIndicator} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BG, CARD, CARD_HI, ACCENT, GOOD, WARN, HALL_GOLD, T1, T2, T3, T4, SEP, CARD_BORDER, FONT, DISPLAY, withAlpha} from './theme';
import {Button, Chip} from './primitives';
import {captureCertPhoto} from './lib/photo';
import MedalCamera from './MedalCamera';
import {fmtTime} from './lib/format';
import {parseClock, extractCertFields, type TextRecognizer} from './lib/ocr';
import {
  racesByProximity, searchRaces, RACE_DISTANCE_LABEL,
  type RaceEvent, type RaceDistance,
} from './data/raceEvents';
import type {Medal} from './lib/medals';

const DISTS: RaceDistance[] = ['5k', '10k', 'half', 'full'];

function fmtPace(sec?: number): string {
  if (typeof sec !== 'number' || sec <= 0) return '';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

export default function RaceMedalScreen({
  runId,
  date,
  appTimeSec,
  appPaceSec,
  presetRaceId,
  presetDistance,
  races = [],
  recognizer,
  makeId,
  onSave,
  onClose,
}: {
  runId?: string;
  /** 러닝 날짜 YYYY-MM-DD — 대회 근접순 + 저장 날짜 기본값. */
  date: string;
  appTimeSec?: number;
  appPaceSec?: number;
  /** geo 감지된 대회 — 있으면 대회 선택을 건너뛰고 기록 단계로 시작. */
  presetRaceId?: string;
  presetDistance?: RaceDistance;
  races?: RaceEvent[];
  /** 네이티브 OCR 인식기 — 없으면 기록증 OCR 생략(직접 입력). */
  recognizer?: TextRecognizer;
  /** id 생성기(App 주입 — 테스트 결정성). 없으면 시간 기반. */
  makeId?: () => string;
  onSave: (medal: Medal) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const presetRace = presetRaceId ? races.find((r) => r.id === presetRaceId) : undefined;

  const [step, setStep] = useState<'race' | 'record'>(presetRace ? 'record' : 'race');
  const [query, setQuery] = useState('');
  // 선택된 대회(카탈로그) 또는 직접 입력명.
  const [race, setRace] = useState<RaceEvent | null>(presetRace ?? null);
  const [customName, setCustomName] = useState('');

  // 기록 단계 상태
  const [medalUri, setMedalUri] = useState<string | null>(null);
  const [certUri, setCertUri] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  // 기록증에서 값을 하나도 못 읽었을 때(엉뚱한 사진 등) 안내용. certUri 는 있으나 ocrDone=false.
  const [ocrEmpty, setOcrEmpty] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dist, setDist] = useState<RaceDistance>(presetDistance ?? 'half');
  const [officialStr, setOfficialStr] = useState(''); // "H:MM:SS"
  const [paceStr, setPaceStr] = useState('');          // "M:SS"
  const [bib, setBib] = useState('');

  const raceName = race ? race.name : customName.trim();

  const results = useMemo(() => {
    const base = query.trim() ? searchRaces(query, races) : racesByProximity(date, races);
    return base;
  }, [query, races, date]);

  // 메달 — 원형 가이드 카메라(자르기 단계 없음). 촬영 완료 시 원형 크롭 uri 반환.
  const onMedalCaptured = (uri: string) => { setMedalUri(uri); setCameraOpen(false); };

  const shotCert = async () => {
    try {
      const p = await captureCertPhoto(); // 편집/크롭 없이 즉시(OCR 원본)
      if (!p) return;
      setCertUri(p.uri);
      setOcrDone(false); setOcrEmpty(false);
      if (!recognizer) return; // 인식기 없으면 사진만 보관, 값은 직접 입력
      setOcrBusy(true);
      try {
        const f = await extractCertFields(recognizer, p.uri);
        if (f.officialTimeSec) setOfficialStr(fmtTime(f.officialTimeSec));
        if (f.paceSec) setPaceStr(fmtPace(f.paceSec));
        if (f.distance) setDist(f.distance);
        if (f.bib) setBib(f.bib);
        // '인식됨'은 실제로 기록/거리/페이스를 뽑았을 때만 — 엉뚱한 사진(음료수 등)엔 안 뜬다.
        const got = f.officialTimeSec != null || f.distance != null || f.paceSec != null;
        setOcrDone(got);
        setOcrEmpty(!got);
      } catch { setOcrEmpty(true); /* 인식 실패 → 직접 입력 폴백 */ }
      finally { setOcrBusy(false); }
    } catch { /* 비차단 */ }
  };

  const officialSec = parseClock(officialStr) ?? undefined;
  const paceSec = (() => { const s = parseClock(paceStr.includes(':') && paceStr.split(':').length === 2 ? `0:${paceStr}` : paceStr); return s ?? undefined; })();
  const canSave = raceName.length > 0;

  const save = () => {
    if (!canSave) return;
    const id = makeId ? makeId() : `medal_${Date.now()}`;
    const medal: Medal = {
      id,
      raceId: race?.id,
      raceName,
      region: race?.region,
      date: race?.date ?? date,
      distance: dist,
      officialTimeSec: officialSec,
      appTimeSec: appTimeSec,
      paceSec: paceSec ?? appPaceSec,
      bib: bib.trim() || undefined,
      medalPhotoUri: medalUri ?? undefined,
      certPhotoUri: certUri ?? undefined,
      runId,
      createdAt: new Date().toISOString(),
    };
    onSave(medal);
  };

  // ── 대회 선택 ──
  if (step === 'race') {
    return (
      <View style={[s.screen, {paddingTop: insets.top}]} testID="race-medal-select">
        <View style={s.nav}>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기" style={s.iconBtn}><Ionicons name="close" size={18} color={T2} /></Pressable>
          <Text style={s.navTitle}>어떤 대회였나요?</Text>
          <View style={{width: 36}} />
        </View>
        <View style={s.search}>
          <Ionicons name="search" size={16} color={T3} />
          <TextInput value={query} onChangeText={setQuery} placeholder="대회 이름 검색" placeholderTextColor={T4} style={s.searchInput} autoCorrect={false} testID="race-search" />
        </View>
        <ScrollView contentContainerStyle={{paddingHorizontal: 18, paddingBottom: insets.bottom + 20}} keyboardShouldPersistTaps="handled">
          <Text style={s.section}>{query.trim() ? '검색 결과' : '러닝 날짜 근처 대회'}</Text>
          {results.map((r) => (
            <Pressable key={r.id} onPress={() => { setRace(r); setDist(r.distances[0] ?? 'half'); setStep('record'); }}
              accessibilityRole="button" accessibilityLabel={`${r.name}, ${r.date}, ${r.region}`}
              style={({pressed}) => [s.raceRow, pressed && {opacity: 0.7}]}>
              <View style={{flex: 1, minWidth: 0}}>
                <Text style={s.raceName} numberOfLines={1}>{r.name}</Text>
                <Text style={s.raceMeta}>{r.date} · {r.region}</Text>
              </View>
              <View style={s.distPill}><Text style={s.distPillT}>{r.distances.map((d) => RACE_DISTANCE_LABEL[d]).join('·')}</Text></View>
            </Pressable>
          ))}
          {results.length === 0 && <Text style={s.noResult}>검색 결과가 없어요 — 아래에서 직접 입력하세요.</Text>}

          {/* 직접 입력 */}
          <View style={s.customBox}>
            <Text style={s.customLabel}>찾는 대회가 없나요?</Text>
            <TextInput value={customName} onChangeText={setCustomName} placeholder="대회 이름 직접 입력" placeholderTextColor={T4} style={s.customInput} autoCorrect={false} testID="race-custom" />
            <View style={{marginTop: 10}}>
              <Button label="이 대회로" disabled={!customName.trim()} onPress={() => { setRace(null); setStep('record'); }} />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── 기록(촬영 + OCR + 확인) ──
  return (
    <View style={[s.screen, {paddingTop: insets.top}]} testID="race-medal-record">
      <View style={s.nav}>
        <Pressable onPress={() => (presetRace ? onClose() : setStep('race'))} hitSlop={8} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}><Ionicons name={presetRace ? 'close' : 'chevron-back'} size={presetRace ? 18 : 20} color={T2} /></Pressable>
        <Text style={s.navTitle} numberOfLines={1}>{raceName || '대회 기록'}</Text>
        <View style={{width: 36}} />
      </View>
      <ScrollView contentContainerStyle={{paddingHorizontal: 18, paddingBottom: insets.bottom + 20}} keyboardShouldPersistTaps="handled">
        {/* 촬영 2슬롯 — 메달은 원형 가이드 카메라, 기록증은 즉시 촬영 → OCR */}
        <View style={s.shotRow}>
          <Pressable onPress={() => setCameraOpen(true)} accessibilityRole="button" accessibilityLabel="메달 촬영" style={({pressed}) => [s.shot, s.shotMedal, medalUri && s.shotDone, pressed && {opacity: 0.85}]}>
            {medalUri ? <Image source={{uri: medalUri}} style={s.shotImgRound} resizeMode="cover" /> : <><Ionicons name="medal-outline" size={26} color={HALL_GOLD} /><Text style={[s.shotT, {color: HALL_GOLD}]}>메달 촬영</Text><Text style={s.shotS}>원 안에 맞춰 찍어요</Text></>}
          </Pressable>
          <Pressable onPress={shotCert} accessibilityRole="button" accessibilityLabel="기록증 사진 찍기" style={({pressed}) => [s.shot, ocrDone && s.shotDoneGood, ocrEmpty && s.shotDoneWarn, pressed && {opacity: 0.85}]}>
            {ocrBusy ? <ActivityIndicator color={T2} /> : ocrDone ? <><Ionicons name="checkmark-circle" size={26} color={GOOD} /><Text style={[s.shotT, {color: GOOD}]}>기록증 인식됨</Text><Text style={s.shotS}>다시 찍기</Text></> : ocrEmpty ? <><Ionicons name="alert-circle-outline" size={26} color={WARN} /><Text style={[s.shotT, {color: WARN}]}>기록을 못 읽었어요</Text><Text style={s.shotS}>다시 찍거나 직접 입력</Text></> : certUri ? <><Ionicons name="document-text" size={26} color={T2} /><Text style={s.shotT}>기록증 저장됨</Text><Text style={s.shotS}>값은 아래 입력</Text></> : <><Ionicons name="document-text-outline" size={26} color={T3} /><Text style={s.shotT}>기록증 촬영</Text><Text style={s.shotS}>공식 기록 자동 인식</Text></>}
          </Pressable>
        </View>
        {ocrDone && <Text style={s.ocrNote}>기록증에서 자동으로 읽었어요 — 확인하고 저장하세요.</Text>}
        {ocrEmpty && <Text style={[s.ocrNote, {color: WARN}]}>기록을 못 읽었어요. 기록증을 또렷하게 다시 찍거나, 아래에 직접 입력하세요.</Text>}

        {/* 종목 */}
        <Text style={s.fieldLabel}>종목</Text>
        <View style={s.chipRow}>
          {DISTS.map((d) => <Chip key={d} label={RACE_DISTANCE_LABEL[d]} selected={dist === d} onPress={() => setDist(d)} />)}
        </View>

        {/* 공식 기록 */}
        <View style={s.fieldHead}>
          <Text style={s.fieldLabel}>공식 기록 (칩 타임)</Text>
          {ocrDone && !!officialStr && <View style={s.tag}><Text style={s.tagT}>인식됨</Text></View>}
        </View>
        <View style={s.inputRow}>
          <TextInput value={officialStr} onChangeText={setOfficialStr} placeholder="1:20:32" placeholderTextColor={T4} style={s.input} keyboardType="numbers-and-punctuation" accessibilityLabel="공식 기록" testID="official-input" />
        </View>
        {appTimeSec && officialSec && Math.abs(appTimeSec - officialSec) >= 2 && (
          <Text style={s.hint}>앱 측정 {fmtTime(appTimeSec)} — 기록증의 공식 기록이 정본으로 저장돼요.</Text>
        )}
        {!officialStr && appTimeSec && <Text style={s.hint}>비우면 앱 측정 {fmtTime(appTimeSec)}로 저장돼요.</Text>}

        {/* 평균 페이스 */}
        <View style={s.fieldHead}>
          <Text style={s.fieldLabel}>평균 페이스 (/km)</Text>
          {ocrDone && !!paceStr && <View style={s.tag}><Text style={s.tagT}>인식됨</Text></View>}
        </View>
        <View style={s.inputRow}><TextInput value={paceStr} onChangeText={setPaceStr} placeholder="5:36" placeholderTextColor={T4} style={s.input} keyboardType="numbers-and-punctuation" accessibilityLabel="평균 페이스" /></View>

        {/* BIB — 개인용(재조회 키). 비공개 저장, 공유 카드엔 절대 안 실림. */}
        <Text style={s.fieldLabel}>배번호 (선택 · 나만 보기)</Text>
        <View style={s.inputRow}><TextInput value={bib} onChangeText={setBib} placeholder="5224" placeholderTextColor={T4} style={s.input} keyboardType="number-pad" accessibilityLabel="배번호" /></View>
        <Text style={s.hint}>공식 기록 재조회용이에요. 내 아카이브에만 저장되고 공유엔 포함되지 않아요.</Text>
      </ScrollView>

      <View style={s.footer}>
        <Button label="아카이브에 저장" disabled={!canSave} onPress={save} testID="medal-save" />
      </View>

      {/* 메달 원형 가이드 카메라 — 전체화면 오버레이 */}
      {cameraOpen && <MedalCamera onCapture={onMedalCaptured} onCancel={() => setCameraOpen(false)} />}
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  nav: {paddingTop: 12, paddingHorizontal: 14, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  iconBtn: {width: 36, height: 36, borderRadius: 999, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center'},
  navTitle: {flex: 1, textAlign: 'center', color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '600', letterSpacing: -0.2, marginHorizontal: 8},

  search: {flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 18, marginTop: 4, marginBottom: 12, height: 46, paddingHorizontal: 14, borderRadius: 14, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.1)},
  searchInput: {flex: 1, color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '500', paddingVertical: 0},
  section: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 4},
  raceRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, marginBottom: 8},
  raceName: {color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600', letterSpacing: -0.2},
  raceMeta: {color: T3, fontFamily: FONT, fontSize: 12, marginTop: 2},
  distPill: {backgroundColor: withAlpha(HALL_GOLD, 0.12), borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4},
  distPillT: {color: HALL_GOLD, fontFamily: FONT, fontSize: 11, fontWeight: '700'},
  noResult: {color: T3, fontFamily: FONT, fontSize: 13, marginTop: 4, marginBottom: 6},
  customBox: {marginTop: 16, padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: withAlpha(T1, 0.16)},
  customLabel: {color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '600', marginBottom: 10},
  customInput: {height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.1), color: T1, fontFamily: FONT, fontSize: 15},

  shotRow: {flexDirection: 'row', gap: 10, marginTop: 8},
  shot: {flex: 1, height: 150, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: withAlpha(T1, 0.16), backgroundColor: withAlpha(T1, 0.02), alignItems: 'center', justifyContent: 'center', gap: 7, overflow: 'hidden', paddingHorizontal: 10},
  shotMedal: {borderColor: withAlpha(HALL_GOLD, 0.45), backgroundColor: withAlpha(HALL_GOLD, 0.05)},
  shotDone: {borderStyle: 'solid', borderColor: withAlpha(HALL_GOLD, 0.5)},
  shotDoneGood: {borderStyle: 'solid', borderColor: withAlpha(GOOD, 0.5), backgroundColor: withAlpha(GOOD, 0.06)},
  shotDoneWarn: {borderStyle: 'solid', borderColor: withAlpha(WARN, 0.5), backgroundColor: withAlpha(WARN, 0.06)},
  shotImgRound: {width: 110, height: 110, borderRadius: 55},
  shotT: {color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '600', textAlign: 'center'},
  shotS: {color: T3, fontFamily: FONT, fontSize: 11, textAlign: 'center'},
  ocrNote: {flexDirection: 'row', color: GOOD, fontFamily: FONT, fontSize: 12, fontWeight: '600', marginTop: 12},

  fieldLabel: {color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '600', marginTop: 20, marginBottom: 10, paddingHorizontal: 2},
  fieldHead: {flexDirection: 'row', alignItems: 'center', gap: 8},
  tag: {backgroundColor: withAlpha(GOOD, 0.14), borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 20, marginBottom: 10},
  tagT: {color: GOOD, fontFamily: FONT, fontSize: 10, fontWeight: '700', letterSpacing: 0.3},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  inputRow: {flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 16, borderRadius: 14, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.08)},
  input: {flex: 1, color: T1, fontFamily: DISPLAY, fontSize: 20, fontVariant: ['tabular-nums'], paddingVertical: 0},
  hint: {color: T3, fontFamily: FONT, fontSize: 12, marginTop: 8, paddingHorizontal: 2, lineHeight: 17},

  footer: {paddingHorizontal: 18, paddingTop: 8, paddingBottom: 30, backgroundColor: BG, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
});
