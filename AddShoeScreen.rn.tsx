// ============================================================================
// AddShoeScreen.rn.tsx — register a new shoe.
// 2026-07-07: 등록 UX 를 온보딩과 통일 — 브랜드 칩 + 모델 검색 모달을 하나의
// '내 러닝화' 선택 필드 + 공용 2열 분할 피커(ShoePicker)로 대체한다(사용자 지시).
// 입력은 셋뿐이다: 러닝화 · 교체 권장 거리 · 현재 누적 거리.
// (구 주석은 '사진'도 유지한다고 적었지만 이 화면엔 사진 필드가 없다 — 스테일 주석 정리
//  2026-08-04. 신발 사진은 신발 상세에서 따로 등록한다.)
// ============================================================================
import React, { useState } from 'react';
import { rs, ri, rv } from './lib/responsive';
import {View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform} from 'react-native';
import {Text} from './lib/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD_HI, RING_ACCENT, DANGER, T1, T2, T3, FONT, DISPLAY, withAlpha, Shoe, TYPE, GLASS, RADIUS,
  GUTTER, MOTION,
  ICON,
} from './theme';
import { Button, GlassEdge, Input, SwipeBack, Tap} from './primitives';
// 러닝화 모델 카탈로그·권장수명은 data/shoeModels(단일 소스)에서 가져온다.
import { getRecommendedLifespanKm, LIFESPAN_BASIS_KO } from './data/shoeModels';
// 러닝화 선택은 온보딩과 공유하는 2열 분할 피커(단일 소스).
import { ShoePicker, type PickedShoe } from './ShoePicker';
// maxKm 0 같은 비정상값을 제출 시 인라인으로 차단(빨강 헬퍼텍스트).
import { validateMaxKm } from './lib/inputMask';
// 몸무게 보정 유효 수명 — 화면이 직접 계산하지 않고 단일 소스를 읽는다(UX 감사 ②).
import { effectiveMaxKm, baseMaxKmFromEffective, WEIGHT_WEAR_REASON_KO } from './lib/shoe';

export default function AddShoeScreen({
  onClose, onSave, weightKg = 0,
}: {
  onClose?: () => void; onSave?: (shoe: Shoe) => void;
  /**
   * 설정된 몸무게(kg). 여기 입력하는 '교체 권장 거리'는 **기저값**이고, 앱이 실제로 쓰는
   * 수명은 몸무게로 보정된 값이다(lib/shoe.effectiveMaxKm). 예전엔 그 사실을 아무도
   * 말하지 않아서, 650 을 입력한 사용자가 홈에서 621 을 보게 됐다(UX 감사 ②).
   * 0/미주입이면 보정이 없으므로 안내도 뜨지 않는다.
   */
  weightKg?: number;
}) {
  // 러닝화(브랜드+모델)는 공용 피커로 한 번에 고른다. 브랜드는 선택 결과에 따라온다.
  const [picked, setPicked] = useState<PickedShoe | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /**
   * 교체 권장 거리 — **내 몸무게 기준 값**(유효 수명)이다. 저장은 기저값으로 되돌린다.
   *
   * 왜(2026-08-04 민우님): 예전엔 카탈로그 권장 650 을 보여주고 앱은 621 로 계산해서
   * "권장은 650인데 621로 저장되네" 하는 **깎인 느낌**이 들었다. 처음부터 내 값 하나만
   * 보여주면 621 이 손해가 아니라 **내 권장거리**가 된다.
   * 저장을 기저로 되돌리는 이유는 lib/shoe.baseMaxKmFromEffective 주석 참조 —
   * 요약하면 **몸무게를 바꾸면 모든 신발이 실시간으로 따라와야** 하기 때문이다.
   */
  const [max, setMax] = useState(0);
  const [used, setUsed] = useState('0');
  // maxKm 0/비정상값 인라인 차단 — 제출 시 검증해 필드 아래 빨강 헬퍼텍스트로 표시한다.
  const [maxErr, setMaxErr] = useState<string | undefined>(undefined);

  // 모델만 있으면 등록 가능 — 검색창 직접 추가는 브랜드가 비어 있을 수 있다(온보딩과 동일).
  // '기타' 레일 직접 입력은 브랜드명을 받으므로 그 경로는 브랜드가 채워진다.
  const valid = !!picked && picked.model.trim().length > 0;

  // 이 신발의 권장 수명 — **내 몸무게 기준**. max 가 이 값과 같으면 '권장'(자동값).
  const recommendedKm = picked
    ? effectiveMaxKm(getRecommendedLifespanKm({ brand: picked.brand, model: picked.model }), weightKg)
    : 0;
  const isRecommended = !!picked && max === recommendedKm;
  // 몸무게 보정이 실제로 걸렸는가(= 카탈로그 값과 내 값이 다른가). 안내 노출 조건.
  const weightAdjusted = !!picked && weightKg > 0
    && getRecommendedLifespanKm({ brand: picked.brand, model: picked.model }) !== recommendedKm;

  // 피커에서 러닝화를 고르면 **내 몸무게 기준** 권장 수명을 자동 채운다(수정 가능).
  const onPick = (p: PickedShoe) => {
    setPicked(p);
    setMax(effectiveMaxKm(getRecommendedLifespanKm({ brand: p.brand, model: p.model }), weightKg));
    setMaxErr(undefined);
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
      // 화면은 내 몸무게 기준 값을 보여줬고, 저장은 **기저**다 — 그래야 나중에 몸무게가
      // 바뀌었을 때 이 신발도 같이 따라온다(저장값에 계수를 구우면 옛 몸무게에 갇힌다).
      max: baseMaxKmFromEffective(max, weightKg),
      used: Number(used) || 0,
    });
  };

  const insets = useSafeAreaInsets();
  return (
    <SwipeBack onBack={onClose}>
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* nav */}
      <View style={s.nav}>
        <Tap onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기" style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}>
          <Ionicons name="close" size={ri(ICON.action)} color={T2} />
        </Tap>
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
        <Tap onPress={() => setPickerOpen(true)} accessibilityRole="button" accessibilityLabel={picked ? `러닝화 ${picked.brand} ${picked.model}, 눌러서 변경` : '러닝화 선택'} testID="add-shoe-select" style={({ pressed }) => [s.selector, pressed && s.pressed]}>
          <GlassEdge glints={false} radius={rs(16)} />
          <Ionicons name="search" size={ri(ICON.action)} color={T3} />
          <Text style={[s.selectorText, !picked && { color: T3 }]} numberOfLines={1}>
            {picked ? `${picked.brand ? `${picked.brand} · ` : ''}${picked.model}` : '브랜드·모델 선택'}
          </Text>
          <Ionicons name="chevron-down" size={ri(ICON.action)} color={T3} />
        </Tap>

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
        {/* 캡션 규칙(민우님 2026-08-04 "설명글이 너무 길다" → 문단 → **한 줄에 한 사실**).
            줄 수보다 **줄바꿈과 만연체**가 문제였다. 각 줄이 사실 하나만 말하게 쪼갠다:
              ① 이 숫자가 뭔가        ② 어디서 온 값인가(⑩)   ③ 왜 내 숫자는 다른가(②)
            ③ 은 몸무게 보정이 걸릴 때만 뜬다. 뺀 것: "직접 바꿀 수 있어요"(입력칸이 이미
            말한다) · "더 신어도 되지만 충격 흡수는 줄어요"(등록이 아니라 **교체 권장이 뜰 때**
            할 말이고 거기 이미 있다 — lib/shoe.KEEP_GOING_REPLACE · InjuryBanner). */}
        <Text style={s.hint}>쿠셔닝이 살아 있는 거리예요</Text>
        <Text style={s.hint}>{LIFESPAN_BASIS_KO}</Text>
        {/* 보정이 걸렸을 때만 **왜 내 숫자가 남과 다른지**를 밝힌다. 숫자를 또 보여주지는
            않는다 — 위 입력칸이 이미 내 값이다(두 숫자를 나란히 두는 순간 '깎였다'로 읽힌다). */}
        {weightAdjusted && (
          <Text style={s.hint} testID="add-shoe-weight-note">
            {WEIGHT_WEAR_REASON_KO} · 내 몸무게 {weightKg}kg 반영
          </Text>
        )}

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
    </SwipeBack>
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
  // '선택' 배지는 무채(T3) — 강조가 아니라 '안 채워도 된다'는 안내다(액센트 절제).
  // (optBadge·labelRow 삭제 2026-08-04 — 소비처 0. 남겨 두면 '쓰는 데가 있다'는 거짓 신호다.)

  label: { color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: rs(4), paddingBottom: rv(10) },

  // 러닝화 선택 트리거(탭하면 2열 분할 피커). 입력칸처럼 보이되 누르면 모달이 열린다.
  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  selector: { backgroundColor: GLASS.fill, borderRadius: rs(16), borderCurve: 'continuous', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: rv(10), paddingHorizontal: rs(18), paddingVertical: rv(16) },
  selectorText: { flex: 1, color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '500', letterSpacing: -0.2 },

  maxHead: { marginTop: rv(22), flexDirection: 'row', alignItems: 'center', gap: rv(8), paddingHorizontal: rs(4), paddingBottom: rv(10) },

  hint: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, paddingHorizontal: rs(4), paddingTop: rv(8) },
  // 힌트 안에서 '앱이 실제로 쓸 숫자'만 한 단 밝게 — 이 줄의 요점이 그 숫자다.
  hintStrong: { color: T1, fontWeight: '700' },

  errText: { color: DANGER, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500', paddingHorizontal: rs(4), paddingTop: rv(8) },
  // primitives.Input 표준(유리 표면·RADIUS.input) 위에 큰 숫자 타이포 + 단위 오버레이 여백만.
  numInput: { fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, paddingRight: rs(48) },
  // 검증 실패 시 입력칸 테두리를 빨강으로 강조하고 아래 인라인 헬퍼텍스트를 띄운다.
  numInputErr: { borderWidth: 1, borderColor: DANGER },
  unitWrap: { position: 'absolute', right: rs(14), top: 0, bottom: 0, justifyContent: 'center' },
  usedUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize },

  ctaWrap: { paddingHorizontal: GUTTER, paddingTop: rv(6), paddingBottom: rv(34), backgroundColor: BG },
});
