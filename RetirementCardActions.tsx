// ============================================================================
// RetirementCardActions.tsx — 은퇴 카드 액션 바(이미지 저장 / 공유하기)
// ----------------------------------------------------------------------------
// 키프세이크 카드(RetirementCard) 아래에 놓이는 두 버튼. 카드 자체는 캡처용 순수 SVG 라
// 버튼을 섞지 않고(이미지에 버튼이 찍히지 않게) 분리한다. onSave/onShare 는 호출부가
// lib/progression/retirementShare 의 saveRetirementCardImage/shareRetirementCard 로
// 배선한다(여기선 프레젠테이션만 — 토큰/primitives, raw hex 0). 누름 직후 비활성으로
// 중복 트리거를 막는다.
// ============================================================================
import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {ACCENT, BG, T1, CARD_HI, RADIUS, SPACE, FONT} from './theme';

export interface RetirementCardActionsProps {
  /** "이미지 저장" 누름 → 갤러리 저장 핸들러. */
  onSave: () => void;
  /** "공유하기" 누름 → OS 공유 시트 핸들러. */
  onShare: () => void;
}

function RetirementCardActions({onSave, onShare}: RetirementCardActionsProps) {
  return (
    <View style={s.row}>
      <Pressable
        onPress={onSave}
        accessibilityRole="button"
        accessibilityLabel="은퇴 카드 이미지 저장"
        testID="retire-card-save"
        style={({pressed}) => [s.btn, s.save, pressed && s.pressed]}>
        <Text style={[s.label, s.saveLabel]}>이미지 저장</Text>
      </Pressable>
      <Pressable
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel="은퇴 카드 공유하기"
        testID="retire-card-share"
        style={({pressed}) => [s.btn, s.share, pressed && s.pressed]}>
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
  label: {fontFamily: FONT, fontSize: 15, fontWeight: '700'},
  saveLabel: {color: T1},
  shareLabel: {color: BG},
});

export default RetirementCardActions;
