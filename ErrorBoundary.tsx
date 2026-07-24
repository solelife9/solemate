import React from 'react';
import { rf, rs, rv } from './lib/responsive';
import {View, StyleSheet} from 'react-native';
import {Text} from './lib/text';
import {BG, T1, T3, FONT as FP, DISPLAY as FH, TYPE} from './theme';
import {Button} from './primitives';
import {recordError} from './lib/crashlytics';

type Props = {
  children: React.ReactNode;
  // 재시도 시 부모가 상태를 초기화할 수 있는 선택 훅(예: 캐시/네비게이션 리셋).
  onReset?: () => void;
};
type State = {hasError: boolean};

// 렌더 트리에서 던진 예외를 가둬 "백스크린"(아무것도 안 그려진 흰/검은 빈 화면)을
// 막고, 한국어 폴백 + 재시도 버튼을 보여준다. React error boundary 는 클래스
// 컴포넌트로만 구현 가능하다(getDerivedStateFromError/componentDidCatch).
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = {hasError: false};

  static getDerivedStateFromError(): State {
    // 다음 렌더에서 폴백 UI를 그리도록 플래그를 세운다.
    return {hasError: true};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 크래시 대신 폴백을 띄우고, 그 예외를 Crashlytics 에 비치명으로 기록한다(원격
    // 관측성). recordError 는 graceful — 네이티브 부재/오류에서도 throw 하지 않는다.
    const stack = info?.componentStack ? `: ${info.componentStack.slice(0, 500)}` : '';
    recordError(error, `React render error${stack}`);
    if (__DEV__) {
      console.log('ErrorBoundary caught', error, info?.componentStack);
    }
  }

  handleRetry = () => {
    // 에러 상태를 해제하면 children 서브트리를 다시 마운트해 렌더를 재시도한다.
    this.setState({hasError: false});
    this.props.onReset?.();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.screen} testID="error-fallback">
          <Text style={styles.title}>문제가 발생했어요</Text>
          <Text style={styles.body}>
            앱에 일시적인 오류가 생겼어요.{'\n'}잠시 후 다시 시도해 주세요.
          </Text>
          {/* 수제 버튼 회수 → 단일 Button 프리미티브(글래스 CTA·RADIUS.btn·누름 표준). */}
          <Button label="다시 시도" onPress={this.handleRetry} testID="error-retry" />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(32),
  },
  // 스케일 밖 rf(25) → TYPE.title1(27) 수렴(타이포 단일 진실원).
  title: {color: T1, fontFamily: FH, ...TYPE.title1, marginBottom: rv(12)},
  body: {
    color: T3,
    fontFamily: FP,
    fontSize: rf(15),
    lineHeight: rf(21),
    textAlign: 'center',
    marginBottom: rv(28),
  },
});
