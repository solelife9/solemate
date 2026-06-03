// react-native-firebase 모듈은 RN 0.84+ "prebuilt(precompiled) React core" 와
// 함께 동작하려면 iOS 에서 정적 링크되어야 한다(비모듈 React 헤더 문제 회피).
// 사용 중인 모든 모듈(app/auth/firestore)을 forceStaticLinking 으로 등록한다.
// Android 에는 영향 없음(autolinking 그대로). iOS Podfile 의
// $RNFirebaseAsStaticFramework=true 와 함께 정적 프레임워크 구성을 보장한다.
const firebaseStaticIos = {platforms: {ios: {forceStaticLinking: true}}};

module.exports = {
  assets: ['./assets/fonts'],
  dependencies: {
    '@react-native-firebase/app': firebaseStaticIos,
    '@react-native-firebase/auth': firebaseStaticIos,
    '@react-native-firebase/firestore': firebaseStaticIos,
  },
};
