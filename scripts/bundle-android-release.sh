#!/usr/bin/env bash
# ============================================================================
# scripts/bundle-android-release.sh
# Android 릴리스 JS 번들(Hermes 바이트코드)을 미리 생성해
# android/app/src/main/assets/index.android.bundle 에 놓는다.
#
# WHY: in-Gradle 번들링 태스크(createBundle*ReleaseJsAndAssets)는
# android/app/build.gradle 에서 비활성화돼 있다(RNGP 0.85 + Gradle 9 의 엄격한
# implicit-dependency 검증이 sources=fileTree(projectRoot) 때문에 :app 태스크마다
# undeclared-input 을 무한 지적하는 문제 회피). 따라서 릴리스 빌드는 이 스크립트가
# 미리 만든 번들에 의존하고, mergeReleaseAssets 가 일반 소스 에셋으로 패키징한다.
#
# 사용: JS 가 바뀔 때마다 `./gradlew assembleRelease`(또는 bundleRelease) 전에 실행.
#   ./scripts/bundle-android-release.sh && (cd android && ./gradlew assembleRelease)
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # repo 루트

ASSETS="android/app/src/main/assets"
BUNDLE="$ASSETS/index.android.bundle"
RES="android/app/src/main/res"

# @expo/cli 는 hoist 상태에 따라 위치가 갈린다(중첩 설치 함정). 둘 다 대응.
CLI="node_modules/expo/node_modules/@expo/cli/build/bin/cli"
[ -f "$CLI" ] || CLI="node_modules/@expo/cli/build/bin/cli"

# hermesc: hermes-compiler(신) 또는 react-native/sdks(구). macOS(osx-bin) 기준.
HERMESC="node_modules/hermes-compiler/hermesc/osx-bin/hermesc"
[ -f "$HERMESC" ] || HERMESC="node_modules/react-native/sdks/hermesc/osx-bin/hermesc"

mkdir -p "$ASSETS"

echo "▶ Metro 번들(plain JS) 생성 …"
node "$CLI" export:embed \
  --platform android --dev false \
  --entry-file index.js \
  --bundle-output "$BUNDLE" \
  --assets-dest "$RES" \
  --minify false

echo "▶ Hermes 바이트코드로 컴파일 …"
chmod +x "$HERMESC" 2>/dev/null || true
"$HERMESC" -emit-binary -O -out "$BUNDLE.hbc" "$BUNDLE"
mv "$BUNDLE.hbc" "$BUNDLE"

echo "✅ 완료: $(file "$BUNDLE")"
