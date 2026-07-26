/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { activateAppCheck } from './lib/appCheck';

// App Check 는 **다른 Firebase 사용보다 먼저** 켜야 이후 요청에 증명 토큰이 붙는다
// (2026-07-26 출시 심사 B-07). 그래서 App 컴포넌트 안이 아니라 진입점에서 부른다.
// 비동기지만 기다리지 않는다 — 초기화가 늦거나 실패해도 앱은 그대로 떠야 한다
// (콘솔에서 적용(enforce)을 켜기 전까지는 미검증 요청도 서버가 받는다).
void activateAppCheck(__DEV__);

AppRegistry.registerComponent(appName, () => App);
