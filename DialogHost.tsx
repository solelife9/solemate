// DialogHost — 커스텀 다이얼로그 표시(A안 '시스템 정합', 2026-07-25 민우님 확정).
//
// App 루트에 1회 마운트하고, 앱 어디서든 lib/dialog 의 showDialog() 를 부르면 여기서
// 그린다(ToastHost 와 동일한 전역 pub/sub 구조). 시각 = 목업 A안 그대로: 중앙 좁은
// 카드(CARD 표면 · RADIUS.lg · 헤어라인) + 중앙 정렬 타이틀/본문 + 세로 버튼 스택
// (SEP 구분선, destructive=DANGER 700). 파괴적 액션은 빨간 '면'이 아니라 라벨 색만 —
// 색은 의미에만(DESIGN §1).
//
// 모션: 스크림 페이드 + 카드 1.04→1 스케일 다운(MOTION.dur.fast · ease.out — iOS 얼럿
// 등장 감각). reduce-motion/jest 에선 무전환. 스크림 탭은 닫지 않는다(얼럿 시맨틱),
// Android back 은 cancel 버튼으로 위임(cancelDialog).

import React, {useEffect, useRef, useState} from 'react';
import {Animated, Modal, StyleSheet, Pressable, View} from 'react-native';
import {Text} from './lib/text';
import {rs, rv} from './lib/responsive';
import {
  CARD, SCRIM, SEP, T1, T3, DANGER, FONT, RADIUS, GUTTER, MOTION, LEADING, TYPE, withAlpha,
} from './theme';
import {subscribeDialog, pressDialogButton, cancelDialog, DialogEntry, DialogButton} from './lib/dialog';
import {useReduceMotion} from './primitives';

const TEST = !!(typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID);

function buttonTextStyle(b: DialogButton) {
  if (b.style === 'destructive') return st.btnDestructive;
  return st.btnDefault;
}

export default function DialogHost() {
  const [dialog, setDialog] = useState<DialogEntry | null>(null);
  const v = useRef(new Animated.Value(0)).current;
  const rm = useReduceMotion();
  const skip = rm || TEST;

  useEffect(() => {
    return subscribeDialog(next => {
      // 얼럿은 등장만 애니메이션(퇴장은 즉시 — 선택 즉시 소멸이 iOS 감각).
      setDialog(next);
      if (next) {
        if (skip) {
          v.setValue(1);
        } else {
          v.setValue(0);
          Animated.timing(v, {toValue: 1, duration: MOTION.dur.fast, easing: MOTION.ease.out, useNativeDriver: true}).start();
        }
      }
    });
    // v 는 ref, skip 변화는 다음 표시부터 반영되면 충분.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!dialog) return null;

  const scale = v.interpolate({inputRange: [0, 1], outputRange: [1.04, 1]});
  return (
    <Modal visible transparent animationType="none" onRequestClose={cancelDialog} testID="dialog-host">
      {/* 스크림 — 탭해도 닫히지 않는다(명시적 선택 강제, iOS 얼럿 동일). */}
      <Animated.View style={[StyleSheet.absoluteFill, st.scrimWrap, {opacity: v}]}>
        <Animated.View
          style={[st.card, {transform: [{scale}]}]}
          accessible={false}
          accessibilityViewIsModal
          accessibilityRole="alert">
          <View style={st.body}>
            <Text style={st.title} maxFontSizeMultiplier={1.3}>{dialog.title}</Text>
            {dialog.message ? <Text style={st.msg}>{dialog.message}</Text> : null}
          </View>
          <View style={st.btns}>
            {dialog.buttons.map((b, i) => (
              <Pressable
                key={`${i}-${b.text}`}
                onPress={() => pressDialogButton(i)}
                accessibilityRole="button"
                accessibilityLabel={b.text}
                testID={`dialog-btn-${i}`}
                style={({pressed}) => [st.btn, i > 0 && st.btnDivider, pressed && st.btnPressed]}>
                <Text style={[st.btnTxt, buttonTextStyle(b)]}>{b.text}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  scrimWrap: {backgroundColor: SCRIM, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER * 2},
  // A안 카드 — 중앙 좁은 폭(iOS 얼럿 관용 ~270pt), CARD 표면 + 헤어라인 20%.
  card: {
    width: '100%', maxWidth: rs(300),
    backgroundColor: CARD,
    borderRadius: RADIUS.lg, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.2),
    overflow: 'hidden',
  },
  body: {paddingTop: rv(22), paddingBottom: rv(16), paddingHorizontal: rs(18), alignItems: 'center'},
  title: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: TYPE.body.letterSpacing, textAlign: 'center'},
  msg: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, letterSpacing: TYPE.caption.letterSpacing, lineHeight: Math.round(TYPE.caption.fontSize * LEADING.body), textAlign: 'center', marginTop: rv(6)},
  btns: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  btn: {paddingVertical: rv(13), alignItems: 'center', justifyContent: 'center', minHeight: rs(44)},
  btnDivider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  btnPressed: {backgroundColor: withAlpha(T1, 0.06)},
  btnTxt: {fontFamily: FONT, fontSize: TYPE.body.fontSize, letterSpacing: TYPE.body.letterSpacing},
  btnDefault: {color: T1, fontWeight: '500'},
  btnDestructive: {color: DANGER, fontWeight: '700'},
});
