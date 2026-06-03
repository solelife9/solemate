# expo SDK 56 native-builds on RN 0.85

type: knowledge
source_job: 9b31bb01-3013-48b3-8025-de7bdf1b0a8d
job_name: 백그라운드 트래킹 = expo-location 교체
confidence: implemented-and-tested
created: 2026-06-01T14:40:46.817Z

## Findings

- **compatibility**: expo ~56.0.0 (expo 56.0.8 / expo-modules-core 56.0.14) + expo-location ~56.0.15 + expo-task-manager ~56.0.16 + babel-preset-expo ~56.0.0 integrate into bare React Native 0.85.2 and produce a GREEN Android debug build.
- **evidence**: npx install-expo-modules wired android/settings.gradle (expo-root-project + expo-autolinking-settings plugins, useExpoModules/useExpoVersionCatalog), MainApplication.kt (ExpoReactHostFactory.getDefaultReactHost + ApplicationLifecycleDispatcher), android/build.gradle (apply plugin expo-root-project). `gradlew :app:assembleDebug` => BUILD SUCCESSFUL in 4m39s, app-debug.apk produced (~171MB).
- **peer_deps**: expo-modules-core peerDependencies are loose (react-native: '*'); react-native-worklets ^0.7.4||^0.8.0 listed but optional. No hard RN version block.
- **build_env**: JAVA_HOME must point at Android Studio JBR: C:\Program Files\Android\Android Studio\jbr. ANDROID_HOME=C:\Users\user\AppData\Local\Android\Sdk. Without JAVA_HOME gradlew exits 49 before any compatibility check.
- **caveat**: This verifies NATIVE BUILD only. Runtime GPS background behavior (TaskManager headless fixes, foreground service) still needs real-device confirmation per user directive. JS wiring of App.tsx to lib/runTracker.ts was NOT yet done by the stalled worker.
