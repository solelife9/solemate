// ============================================================================
// RetirementCardActions.tsx — 은퇴 카드 액션 바(이미지 저장 / 공유하기)
// ----------------------------------------------------------------------------
// 키프세이크 카드(RetirementCard) 아래에 놓이는 두 버튼. 카드 자체는 캡처용 순수 SVG 라
// 버튼을 섞지 않고(이미지에 버튼이 찍히지 않게) 분리한다. onSave/onShare 는 호출부가
// lib/progression/retirementShare 의 saveRetirementCardImage/shareRetirementCard 로
// 배선한다(여기선 프레젠테이션만 — 토큰/primitives, raw hex 0). 저장/공유는 비동기라
// 캡처가 진행 중인 동안 두 버튼을 잠가(busy) 빠른 연타로 인한 중복 트리거를 막는다.
// ============================================================================
import React, {useRef, useState} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {ACCENT, BG, T1, CARD_HI, RADIUS, SPACE, FONT} from './theme';

export interface RetirementCardActionsProps {
  /** "이미지 저장" 누름 → 갤러리 저장 핸들러(비동기 가능). */
  onSave: () => void | Promise<void>;
  /** "공유하기" 누름 → OS 공유 시트 핸들러(비동기 가능). */
  onShare: () => void | Promise<void>;
}

function RetirementCardActions({onSave, onShare}: RetirementCardActionsProps) {
  // 진행 중(in-flight) 동안 두 버튼 모두 잠근다. ref 는 즉시 차단(렌더 대기 없이 연타
  // 무시), state 는 시각적 비활성화를 위한 것.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = (fn: () => void | Promise<void>) => {
    if (busyRef.current) return; // 이미 진행 중 — 두 번째 누름 무시
    const result = fn();
    // 핸들러가 Promise 를 돌려줄 때만 잠근다(동기 핸들러는 중복 위험 없음).
    if (result && typeof (result as Promise<void>).then === 'function') {
      busyRef.current = true;
      setBusy(true);
      const release = () => {
        busyRef.current = false;
        setBusy(false);
      };
      (result as Promise<void>).then(release, release);
    }
  };

  return (
    <View style={s.row}>
      <Pressable
        onPress={() => run(onSave)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{disabled: busy}}
        accessibilityLabel="은퇴 카드 이미지 저장"
        testID="retire-card-save"
        style={({pressed}) => [s.btn, s.save, pressed && s.pressed, busy && s.busy]}>
        <Text style={[s.label, s.saveLabel]}>이미지 저장</Text>
      </Pressable>
      <Pressable
        onPress={() => run(onShare)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{disabled: busy}}
        accessibilityLabel="은퇴 카드 공유하기"
        testID="retire-card-share"
        style={({pressed}) => [s.btn, s.share, pressed && s.pressed, busy && s.busy]}>
        <Text style={[s.label, s.shareLabel]}>공유하기</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: {flexDirection: 'row', gap: SPACE.md},
  btn: {
    flex: 1,
    paddingVertical: SPACE.md + 2,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  save: {backgroundColor: CARD_HI},
  share: {backgroundColor: ACCENT},
  pressed: {opacity: 0.7},
  busy: {opacity: 0.5},
  label: {fontFamily: FONT, fontSize: 15, fontWeight: '700'},
  saveLabel: {color: T1},
  shareLabel: {color: BG},
});

export default RetirementCardActions;
