import React from 'react';
import { rf, rs, rv } from './lib/responsive';
import {View, StyleSheet, Linking, Platform} from 'react-native';
import {Text} from './lib/text';
import {BG, T1, T3, FONT as FP, DISPLAY as FH, TYPE} from './theme';
import {Button} from './primitives';
import {reportIssue} from './lib/crashlytics';
import {SUPPORT_EMAIL, SUPPORT_URL} from './lib/legalLinks';

// 버전 단일 소스 = package.json(마이 탭 문의와 같은 출처 — 두 곳이 갈리면 안 된다).
const APP_VERSION: string = require('./package.json').version;

type Props = {
  children: React.ReactNode;
  // 재시도 시 부모가 상태를 초기화할 수 있는 선택 훅(예: 캐시/네비게이션 리셋).
  onReset?: () => void;
};
type State = {hasError: boolean; retries: number; errName: string};

// 렌더 트리에서 던진 예외를 가둬 "백스크린"(아무것도 안 그려진 흰/검은 빈 화면)을
// 막고, 한국어 폴백 + 재시도 버튼을 보여준다. React error boundary 는 클래스
// 컴포넌트로만 구현 가능하다(getDerivedStateFromError/componentDidCatch).
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = {hasError: false, retries: 0, errName: ''};

  static getDerivedStateFromError(): Partial<State> {
    // 다음 렌더에서 폴백 UI를 그리도록 플래그를 세운다. retries 는 건드리지 않는다 —
    // 재시도 횟수는 handleRetry 가 센다(아래 '반복 실패' 참조).
    return {hasError: true};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 크래시 대신 폴백을 띄우고, 그 예외를 Crashlytics 에 비치명으로 기록한다(원격
    // 관측성). recordError 는 graceful — 네이티브 부재/오류에서도 throw 하지 않는다.
    const stack = info?.componentStack ? `: ${info.componentStack.slice(0, 500)}` : '';
    // reportIssue = 원격 기록 + 개발 콘솔(릴리스에선 콘솔이 걷혀도 원격엔 남는다).
    reportIssue(`React render error${stack}`, error);
    // 오류 **종류**만 남긴다(문의 메일에 실을 값). 메시지 본문은 담지 않는다 —
    // 사용자 데이터가 섞여 들어올 수 있고, 상세는 이미 Crashlytics 에 통째로 갔다.
    this.setState({errName: String(error?.name || 'Error').slice(0, 40)});
  }

  handleRetry = () => {
    // 에러 상태를 해제하면 children 서브트리를 다시 마운트해 렌더를 재시도한다.
    this.setState(prev => ({hasError: false, retries: prev.retries + 1, errName: ''}));
    this.props.onReset?.();
  };

  // 문의 — 메일 앱을 우선 열고, 안 되면 지원 페이지로. 여기서 실패하면 사용자는 정말로
  // 갈 곳이 없으므로 두 경로 모두 조용히 죽지 않게 한다.
  handleSupport = () => {
    const subject = encodeURIComponent('[Keego] 오류 신고');
    // 진단 정보를 **우리가 채운다** — 마이 탭 문의와 같은 규약(L-04). 크래시 신고에서는
    // 더 중요하다: 버전·기기 없는 오류 제보는 재현이 사실상 불가능해 왕복이 최소 한 번 늘고,
    // 화면이 깨진 사용자는 그 왕복을 기다려 주지 않는다.
    //
    // 넣는 값은 기기 진단 최소치 + 오류 **종류**뿐이다. 오류 메시지 본문·계정·러닝 데이터는
    // 넣지 않는다 — 사용자가 적기로 선택하지 않은 것을 메일에 미리 채우면 유출에 가깝다
    // (처리방침 §2 '기기·오류 정보' 범위와 일치). 상세는 이미 Crashlytics 로 갔다.
    const diag = [
      `앱 버전: ${APP_VERSION}`,
      `기기: ${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS} ${String(Platform.Version)}`,
      `오류: ${this.state.errName || '알 수 없음'}`,
      // 반복 횟수는 "한 번 튄 것"과 "계속 죽는 것"을 가른다 — 우선순위 판단에 바로 쓰인다.
      `재시도: ${this.state.retries}회`,
    ].join('\n');
    const body = encodeURIComponent(
      `\n\n\n————————\n앱에서 오류 화면이 떴습니다.\n어떤 화면에서 무엇을 하셨을 때인지 적어주시면 큰 도움이 됩니다.\n\n${diag}\n`,
    );
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() => {
      Linking.openURL(SUPPORT_URL).catch(() => {
        /* 둘 다 실패하면 화면에 적힌 주소가 마지막 안내다 */
      });
    });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      // 반복 실패(재시도를 2번 넘게 눌렀다)면 같은 원인이 계속 터지는 것이다. 그때는
      // "잠시 후 다시"가 거짓말이 되므로 말을 바꾸고 문의를 주행동으로 올린다
      // (2026-08-04 출시 운영 감사 L-03). 무한히 실패하는 버튼만 남겨두면 사용자는
      // 앱을 지우거나 리뷰에 별 하나를 남긴다 — 둘 다 되돌릴 수 없다.
      const stuck = this.state.retries >= 2;
      return (
        <View style={styles.screen} testID="error-fallback">
          <Text style={styles.title}>{stuck ? '오류가 계속되고 있어요' : '문제가 발생했어요'}</Text>
          <Text style={styles.body}>
            {stuck
              ? '같은 오류가 반복되고 있어요.\n알려주시면 바로 확인해서 고칠게요.'
              : '앱에 일시적인 오류가 생겼어요.\n잠시 후 다시 시도해 주세요.'}
          </Text>
          {/* 수제 버튼 회수 → 단일 Button 프리미티브(글래스 CTA·RADIUS.btn·누름 표준). */}
          {stuck ? (
            <>
              <Button label="문의하기" onPress={this.handleSupport} testID="error-support" />
              <View style={styles.gap} />
              <Button label="다시 시도" variant="ghost" onPress={this.handleRetry} testID="error-retry" />
            </>
          ) : (
            <>
              <Button label="다시 시도" onPress={this.handleRetry} testID="error-retry" />
              <View style={styles.gap} />
              <Button label="문의하기" variant="ghost" onPress={this.handleSupport} testID="error-support" />
            </>
          )}
          {/* 메일 앱도 브라우저도 못 여는 최악의 경우를 위한 마지막 줄. 읽어서 옮겨 적을 수 있다. */}
          <Text style={styles.addr}>{SUPPORT_EMAIL}</Text>
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
  // 두 CTA 사이 간격 — 버튼끼리 붙어 오터치 나는 것을 막는다.
  gap: {height: rv(10)},
  // 마지막 안내(주소). 보조 정보이므로 T3·작은 글자로 눌러 둔다.
  addr: {color: T3, fontFamily: FP, fontSize: rf(12), marginTop: rv(20)},
});
