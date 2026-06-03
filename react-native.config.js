// 벡터 아이콘 폰트를 네이티브로 링크하기 위한 에셋 경로.
// (react-native-vector-icons / Expo 폰트 자산)
//
// 참고: @react-native-firebase 의 iOS 정적 링크는 Podfile 의
// `$RNFirebaseAsStaticFramework = true` 플래그가 담당한다.
// @react-native-community/cli 20.1.0 의 config 스키마에는
// `dependencies.*.platforms.ios.forceStaticLinking` 키가 존재하지 않아,
// 그 블록을 두면 Metro(`react-native start`)/`run-android` 의
// parseUserConfig 검증이 즉시 실패한다. 따라서 여기서는 에셋만 선언하고
// iOS 정적 프레임워크는 Podfile 플래그에만 의존한다.
module.exports = {
  assets: ['./assets/fonts'],
};
