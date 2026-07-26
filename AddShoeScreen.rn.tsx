// ============================================================================
// AddShoeScreen.rn.tsx — register a new shoe.
// 2026-07-07: 등록 UX 를 온보딩과 통일 — 브랜드 칩 + 모델 검색 모달을 하나의
// '내 러닝화' 선택 필드 + 공용 2열 분할 피커(ShoePicker)로 대체한다(사용자 지시).
// 나머지(사진·교체 권장 거리·현재 누적 거리)는 그대로 유지한다.
// ============================================================================
import React, { useState } from 'react';
import { rs, ri, rv } from './lib/responsive';
import { View, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import {Text} from './lib/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD_HI, RING_ACCENT, DANGER, T1, T2, T3, FONT, DISPLAY, withAlpha, Shoe, TYPE, GLASS, RADIUS,
  GUTTER, MOTION,
  ICON,
} from './theme';
import { Button, GlassEdge, Input } from './primitives';
// 러닝화 모델 카탈로그·권장수명은 data/shoeModels(단일 소스)에서 가져온다.
import { getRecommendedLifespanKm } from './data/shoeModels';
// 러닝화 선택은 온보딩과 공유하는 2열 분할 피커(단일 소스).
import { ShoePicker, type PickedShoe } from './ShoePicker';
// maxKm 0 같은 비정상값을 제출 시 인라인으로 차단(빨강 헬퍼텍스트).
import { validateMaxKm } from './lib/inputMask';
// 영수증·박스 라벨 사진 → 브랜드/모델 자동 채우기(앞당김 #17). 인식기는 대회 기록증 OCR 과
// 같은 네이티브 모듈을 재사용한다 — 새 의존성 0. 인식기가 없으면 이 진입점은 아예 숨는다.
import { nativeRecognizer } from './lib/ocrNative';
import { extractShoeFromImage } from './lib/shoeReceipt';
import { pickPhotoFrom } from './lib/photo';
import { showToast } from './lib/toast';

export default function AddShoeScreen({
  onClose, onSave,
}: { onClose?: () => void; onSave?: (shoe: Shoe) => void }) {
  // 러닝화(브랜드+모델)는 공용 피커로 한 번에 고른다. 브랜드는 선택 결과에 따라온다.
  const [picked, setPicked] = useState<PickedShoe | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 권장 수명(km) — 모델 선택 시 자동 채워지며 사용자가 직접 수정 가능.
  const [max, setMax] = useState(0);
  const [used, setUsed] = useState('0');
  // maxKm 0/비정상값 인라인 차단 — 제출 시 검증해 필드 아래 빨강 헬퍼텍스트로 표시한다.
  const [maxErr, setMaxErr] = useState<string | undefined>(undefined);
  // 영수증 스캔 진행 상태(중복 실행 방지 + 버튼 문구).
  const [scanning, setScanning] = useState(false);

  // 모델만 있으면 등록 가능 — 검색창 직접 추가는 브랜드가 비어 있을 수 있다(온보딩과 동일).
  // '기타' 레일 직접 입력은 브랜드명을 받으므로 그 경로는 브랜드가 채워진다.
  const valid = !!picked && picked.model.trim().length > 0;

  // 현재 brand+model 기준 권장 수명. max가 이 값과 같으면 '권장'(자동값), 다르면 사용자 수정값.
  const recommendedKm = picked ? getRecommendedLifespanKm({ brand: picked.brand, model: picked.model }) : 0;
  const isRecommended = !!picked && max === recommendedKm;

  // 피커에서 러닝화를 고르면 권장 수명을 자동 채운다(사용자가 아래에서 수정 가능).
  const onPick = (p: PickedShoe) => {
    setPicked(p);
    setMax(getRecommendedLifespanKm({ brand: p.brand, model: p.model }));
    setMaxErr(undefined);
  };

  /**
   * 영수증·박스 라벨을 찍어 브랜드·모델·권장수명을 채운다.
   * 실패해도 폼은 그대로다 — 자동 채우기는 지름길일 뿐, 손으로 등록하는 길을 막지 않는다.
   * 못 찾았을 때 조용히 아무 일도 안 하면 고장으로 읽히므로 반드시 결과를 말한다.
   */
  const scanReceipt = async () => {
    if (scanning || !nativeRecognizer) return;
    setScanning(true);
    try {
      const photo = await pickPhotoFrom('camera');
      if (!photo?.uri) return;
      const found = await extractShoeFromImage(nativeRecognizer, photo.uri);
      if (found.model) {
        onPick({ brand: found.brand, model: found.model });
        showToast({ message: `${found.brand ? found.brand + ' ' : ''}${found.model} 로 채웠어요` });
      } else {
        showToast({ message: '러닝화를 못 찾았어요 — 직접 골라주세요' });
      }
    } catch {
      showToast({ message: '사진을 읽지 못했어요 — 직접 골라주세요' });
    } finally {
      setScanning(false);
    }
  };

  const save = () => {
    if (!valid || !picked) return;
    // maxKm 0 같은 비정상값을 인라인으로 차단한다(Alert 없이 필드 아래 빨강 헬퍼텍스트).
    const me = validateMaxKm(max);
    setMaxErr(me);
    if (me) return;
    onSave?.({
      brand: picked.brand.trim(),
      model: picked.model.trim(),
      max,
      used: Number(used) || 0,
    });
  };

  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* nav */}
      <View style={s.nav}>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기" style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}>
          <Ionicons name="close" size={ri(ICON.action)} color={T2} />
        </Pressable>
        <Text style={s.navTitle}>러닝화 등록</Text>
        <View style={{ width: rs(38) }} />
      </View>

      {/* 키보드가 입력칸·등록 버튼을 가리지 않게 폼+CTA를 KeyboardAvoidingView로 감싼다
          (iOS=padding, Android는 adjustResize에 맡겨 undefined). */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 8}>
      {/* 상단 시작(정본 — 콘텐츠 상단 정렬): 구 justifyContent center 폐지. */}
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: rv(18), paddingBottom: rv(20) }} keyboardShouldPersistTaps="handled">
        {/* 러닝화(브랜드+모델) — 탭하면 온보딩과 동일한 2열 분할 피커가 열린다 */}
        <Text style={s.label}>러닝화</Text>
        <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" accessibilityLabel={picked ? `러닝화 ${picked.brand} ${picked.model}, 눌러서 변경` : '러닝화 선택'} testID="add-shoe-select" style={({ pressed }) => [s.selector, pressed && s.pressed]}>
          <GlassEdge glints={false} radius={rs(16)} />
          <Ionicons name="search" size={ri(ICON.action)} color={T3} />
          <Text style={[s.selectorText, !picked && { color: T3 }]} numberOfLines={1}>
            {picked ? `${picked.brand ? `${picked.brand} · ` : ''}${picked.model}` : '브랜드·모델 선택'}
          </Text>
          <Ionicons name="chevron-down" size={ri(ICON.action)} color={T3} />
        </Pressable>

        {/* 영수증 스캔 — 피커 아래 보조 액션 한 줄(새 화면·새 언어 없이 지름길만 추가).
            OCR 네이티브가 없는 빌드에선 렌더하지 않는다 — 눌러도 안 되는 버튼은 두지 않는다. */}
        {!!nativeRecognizer && (
          <Pressable
            onPress={scanReceipt}
            disabled={scanning}
            accessibilityRole="button"
            accessibilityLabel="영수증이나 박스 사진으로 자동 입력"
            accessibilityState={{ disabled: scanning }}
            testID="add-shoe-scan"
            hitSlop={8}
            style={({ pressed }) => [s.scanRow, pressed && s.pressed]}>
            <Ionicons name="scan-outline" size={ri(ICON.inline)} color={T3} />
            <Text style={s.scanText}>{scanning ? '읽는 중…' : '영수증·박스 사진으로 자동 입력'}</Text>
          </Pressable>
        )}

        {/* 권장 교체 거리 — 쿠셔닝(성능) 기준 가이드. 자동 입력·수정 가능, 미수정 시 '권장' 배지 */}
        <View style={s.maxHead}>
          <Text style={[s.label, { paddingBottom: rv(0) }]}>교체 권장 거리</Text>
          {isRecommended && <Text style={s.recBadge}>권장</Text>}
        </View>
        {/* primitives.Input 표준 표면 + 필드 안 우측 km 단위 오버레이(터치 통과). */}
        <View>
          <Input
            value={max ? String(max) : ''}
            onChangeText={(v) => { setMax(Number(v.replace(/[^0-9]/g, '')) || 0); setMaxErr(undefined); }}
            keyboardType="number-pad"
            style={[s.numInput, !!maxErr && s.numInputErr]}
            accessibilityLabel="교체 권장 거리"
          />
          <View style={s.unitWrap} pointerEvents="none"><Text style={s.usedUnit}>km</Text></View>
        </View>
        {!!maxErr && <Text style={s.errText} accessibilityLabel="권장 거리 오류">{maxErr}</Text>}
        <Text style={s.hint}>
          쿠셔닝(성능)이 좋게 유지되는 교체 권장 거리예요. 더 신어도 되지만 충격 흡수는 점점 줄어요.
          모델 선택 시 자동 입력되며 직접 바꿀 수 있어요.
        </Text>

        {/* current mileage */}
        <Text style={[s.label, { marginTop: rv(22) }]}>현재 누적 거리</Text>
        <View>
          <Input
            value={used}
            onChangeText={(v) => setUsed(v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            accessibilityLabel="현재 누적 거리"
            style={s.numInput}
          />
          <View style={s.unitWrap} pointerEvents="none"><Text style={s.usedUnit}>km</Text></View>
        </View>
        <Text style={s.hint}>새 신발이면 0으로 두세요.</Text>
      </ScrollView>

      {/* CTA — 미선택 시 ghost 비활성. */}
      <View style={s.ctaWrap}>
        <Button label="러닝화 등록" onPress={save} disabled={!valid} />
      </View>
      </KeyboardAvoidingView>

      {/* 러닝화 선택 — 온보딩과 공유하는 2열 분할 피커(브랜드 레일 + 모델 알파벳순 + 검색). */}
      <ShoePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onPick}
        insetTop={insets.top}
        insetBottom={insets.bottom}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  // 누름 표준(MOTION.press) — 사설 0.85/0.98 폐지.
  pressed: { opacity: MOTION.press.opacity, transform: [{ scale: MOTION.press.scale }] },

  nav: { paddingTop: rv(12), paddingHorizontal: GUTTER, paddingBottom: rv(6), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: rs(38), height: rs(38), borderRadius: RADIUS.pill, backgroundColor: CARD_HI, borderWidth: 1, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },
  navTitle: { color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '500', letterSpacing: -0.2 },

  recBadge: { color: RING_ACCENT, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 0.2 },

  label: { color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: rs(4), paddingBottom: rv(10) },

  // 러닝화 선택 트리거(탭하면 2열 분할 피커). 입력칸처럼 보이되 누르면 모달이 열린다.
  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  selector: { backgroundColor: GLASS.fill, borderRadius: rs(16), borderCurve: 'continuous', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: rv(10), paddingHorizontal: rs(18), paddingVertical: rv(16) },
  selectorText: { flex: 1, color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '500', letterSpacing: -0.2 },

  maxHead: { marginTop: rv(22), flexDirection: 'row', alignItems: 'center', gap: rv(8), paddingHorizontal: rs(4), paddingBottom: rv(10) },

  scanRow: { flexDirection: 'row', alignItems: 'center', gap: rv(6), alignSelf: 'flex-start', paddingHorizontal: rs(4), paddingTop: rv(10), minHeight: rs(28) },
  scanText: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },
  hint: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, paddingHorizontal: rs(4), paddingTop: rv(8) },

  errText: { color: DANGER, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500', paddingHorizontal: rs(4), paddingTop: rv(8) },
  // primitives.Input 표준(유리 표면·RADIUS.input) 위에 큰 숫자 타이포 + 단위 오버레이 여백만.
  numInput: { fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, paddingRight: rs(48) },
  // 검증 실패 시 입력칸 테두리를 빨강으로 강조하고 아래 인라인 헬퍼텍스트를 띄운다.
  numInputErr: { borderWidth: 1, borderColor: DANGER },
  unitWrap: { position: 'absolute', right: rs(14), top: 0, bottom: 0, justifyContent: 'center' },
  usedUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize },

  ctaWrap: { paddingHorizontal: GUTTER, paddingTop: rv(6), paddingBottom: rv(34), backgroundColor: BG },
});
