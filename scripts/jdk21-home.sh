#!/bin/sh
# ============================================================================
# scripts/jdk21-home.sh — JDK 21+ 홈 경로를 표준출력으로 낸다.
# ----------------------------------------------------------------------------
# 왜 필요한가: firebase-tools 15+ 의 에뮬레이터는 JDK 21 이상을 요구한다. 그런데 이
# 프로젝트의 Android Gradle 빌드는 JDK 17 에 묶여 있어서 **전역 java 를 21 로 바꾸면
# 안 된다**(brew link 금지). 그래서 규칙 테스트(`npm run test:rules`)에만 JAVA_HOME 을
# 주입하는 용도로 이 스크립트를 쓴다.
#
#   JAVA_HOME="$(scripts/jdk21-home.sh)" firebase emulators:exec ...
#
# 탐색 순서: macOS java_home(21) → Homebrew keg(openjdk@21, openjdk) → JAVA21_HOME 환경변수.
# 못 찾으면 설치 방법을 stderr 로 안내하고 1 로 종료한다(조용히 실패하지 않는다).
# ============================================================================
set -e

# 0) 사용자가 직접 지정한 경우 최우선.
if [ -n "$JAVA21_HOME" ] && [ -x "$JAVA21_HOME/bin/java" ]; then
  printf '%s' "$JAVA21_HOME"
  exit 0
fi

# 1) macOS 표준 조회(JDK 가 /Library/Java/JavaVirtualMachines 에 등록된 경우).
if [ -x /usr/libexec/java_home ]; then
  for v in 21 22 23 24 25; do
    if home=$(/usr/libexec/java_home -v "$v" 2>/dev/null); then
      printf '%s' "$home"
      exit 0
    fi
  done
fi

# 2) Homebrew keg(link 하지 않아도 경로로 직접 쓸 수 있다).
for formula in openjdk@21 openjdk@22 openjdk@23 openjdk@24 openjdk@25 openjdk; do
  if prefix=$(brew --prefix "$formula" 2>/dev/null) && [ -n "$prefix" ]; then
    home="$prefix/libexec/openjdk.jdk/Contents/Home"
    if [ -x "$home/bin/java" ]; then
      # openjdk(무버전)는 최신이지만 21 미만일 수도 있어 버전을 확인한다.
      major=$("$home/bin/java" -version 2>&1 | head -1 | sed -E 's/.*version "?([0-9]+).*/\1/')
      case "$major" in
        ''|*[!0-9]*) ;;
        *) if [ "$major" -ge 21 ]; then printf '%s' "$home"; exit 0; fi ;;
      esac
    fi
  fi
done

echo "JDK 21+ 를 찾지 못했습니다. Firestore 에뮬레이터(firebase-tools 15+)에 필요합니다." >&2
echo "  brew install openjdk@21     # 전역 link 는 하지 마세요 — Android 빌드는 JDK 17 을 씁니다" >&2
echo "  또는 JAVA21_HOME=<경로> 환경변수로 직접 지정" >&2
exit 1
