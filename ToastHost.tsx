// ToastHost — 화면 하단 스낵바 오버레이. RN 내장 Animated 만으로 슬라이드업+페이드.
//
// App 루트에 1회 마운트하고(<ToastHost/>), 앱 어디서든 lib/toast 의 showToast() 를 부르면
// 이 호스트가 구독으로 받아 그린다. 새 라이브러리 0(react-native-toast-message 등 금지) —
// Animated/View/Text/Pressable 만 사용한다. 다크(CARD_HI) 표면 + 흰(ACCENT) 액션 토큰.
//
// 동작: 토스트가 오면 아래에서 위로 슬라이드(+페이드 인), null 이 오면(자동/수동 dismiss)
// 아래로 슬라이드(+페이드 아웃)한 뒤 트리에서 제거한다. undo 는 actionLabel='실행취소'
// 액션 버튼 — 탭하면 runToastAction 이 onAction 을 부르고 토스트를 닫는다.

import React, {useEffect, useRef, useState} from 'react';
import { rs } from './lib/responsive';
import {AccessibilityInfo, Animated, Platform, StyleSheet, Pressable} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CARD_HI, ACCENT, T1, SEP, FONT, RADIUS, SPACE, TYPE, MOTION, SHADOW} from './theme';
import {
  subscribeToast, runToastAction, getCurrentToast, ToastEntry,
  subscribeToastClearance, getToastClearance,
} from './lib/toast';

// 모션 = MOTION 토큰(2026-07-25 — 구 사설 220/180ms 폐지, 코어가 자기 토큰을 지킨다).
const ENTER_MS = MOTION.dur.fast;
const EXIT_MS = MOTION.dur.fast;
const SLIDE_DP = 80; // 시작/종료 시 아래로 내려가 있는 거리(px)

export default function ToastHost() {
  const insets = useSafeAreaInsets();
  // 표시 중(또는 퇴장 애니 중)인 토스트. store 가 null 을 주면 퇴장 애니 후 비운다.
  const [toast, setToast] = useState<ToastEntry | null>(null);
  // 하단 클리어런스 — 플로팅 탭바 독이 떠 있으면 그 높이만큼 위에 그린다(P0 심사 #3).
  const [clearance, setClearance] = useState(getToastClearance());
  const translateY = useRef(new Animated.Value(SLIDE_DP)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => subscribeToastClearance(setClearance), []);

  useEffect(() => {
    const unsub = subscribeToast(next => {
      if (next) {
        // 입장: 먼저 트리에 올린 뒤(메시지 즉시 렌더) 슬라이드업+페이드인.
        setToast(next);
        // iOS VoiceOver 공지 — accessibilityLiveRegion 은 Android 전용 prop 이라
        // iOS 는 명시적으로 announce 해야 들린다(P0 심사 #4). Android 는 liveRegion 이
        // 이미 읽어 주므로 중복 공지하지 않는다.
        if (Platform.OS === 'ios') {
          const announce = next.actionLabel && next.actionLabel.trim()
            ? `${next.message}. ${next.actionLabel} 버튼이 있어요.`
            : next.message;
          AccessibilityInfo.announceForAccessibility(announce);
        }
        translateY.setValue(SLIDE_DP);
        opacity.setValue(0);
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 0,
            duration: ENTER_MS,
            easing: MOTION.ease.out,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: ENTER_MS,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        // 퇴장: 슬라이드다운+페이드아웃 후 트리에서 제거. 단, 퇴장 애니가 끝나는 시점에
        // 이미 새 토스트가 떠 있으면(store.current!=null) 그 새 토스트를 지우지 않는다 —
        // (a) 마운트 시 store 가 즉시 null 을 통지해 시작되는 무의미한 퇴장의 콜백이
        // 직후 showToast 로 띄운 토스트를 지우거나, (b) 자동 dismiss 퇴장 중 새 토스트가
        // 끼어들 때 옛 콜백이 새 토스트를 잘못 지우는 레이스를 막는다.
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: SLIDE_DP,
            duration: EXIT_MS,
            easing: MOTION.ease.in,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: EXIT_MS,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (getCurrentToast() == null) setToast(null);
        });
      }
    });
    return unsub;
    // 구독은 마운트 시 1회만 — Animated 값은 ref 라 stale 클로저 위험이 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!toast) return null;

  const hasAction = !!(toast.actionLabel && toast.actionLabel.trim());

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {bottom: (insets.bottom || 0) + SPACE.lg + clearance},
      ]}>
      <Animated.View
        style={[
          styles.bar,
          {opacity, transform: [{translateY}]},
        ]}
        accessibilityLiveRegion="polite"
        accessible
        accessibilityLabel={toast.message}>
        <Text style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>
        {hasAction && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.actionLabel}
            hitSlop={8}
            onPress={() => runToastAction(toast.id)}
            style={({pressed}) => [styles.action, pressed && styles.actionPressed]}>
            <Text style={styles.actionLabel}>{toast.actionLabel}</Text>
          </Pressable>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 하단 중앙 정렬 컨테이너. box-none 으로 토스트 막대 밖 영역의 터치는 통과시킨다.
  wrap: {
    position: 'absolute',
    left: SPACE.lg,
    right: SPACE.lg,
    alignItems: 'center',
  },
  // 다크 표면 막대(CARD_HI) + 미세 보더(SEP). 메시지와 액션을 한 줄에 배치.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: rs(560),
    width: '100%',
    backgroundColor: CARD_HI,
    borderRadius: RADIUS.md, borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: SEP,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    // 다크 위에 떠 보이도록 약한 그림자 — SHADOW.overlay 토큰(수제 그림자 폐지).
    ...SHADOW.overlay,
  },
  message: {
    flex: 1,
    color: T1,
    fontFamily: FONT,
    fontSize: TYPE.body.fontSize,
    fontWeight: TYPE.body.fontWeight,
    letterSpacing: TYPE.body.letterSpacing,
  },
  action: {
    marginLeft: SPACE.md,
    paddingVertical: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.sm, borderCurve: 'continuous',
  },
  actionPressed: {opacity: 0.6},
  // 액션 라벨 — ACCENT 가 흰이 된 뒤 메시지(T1)와 같은 색이라 굵기만으로는 '탭 가능'이
  // 안 읽혔다. 밑줄로 행동 유도를 복원한다(무채 절제 유지 — 색 추가 없음, 2026-07-16).
  actionLabel: {
    color: ACCENT,
    fontFamily: FONT,
    fontSize: TYPE.body.fontSize,
    fontWeight: '700',
    letterSpacing: TYPE.label.letterSpacing,
    textDecorationLine: 'underline',
  },
});
