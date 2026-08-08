#!/usr/bin/env bash
# ============================================================================
# scripts/e2e.sh — Maestro E2E 실행기
# ============================================================================
# 사용: npm run e2e                     (안드로이드 실기기, 전체)
#       npm run e2e -- ios              (아이폰 시뮬레이터, 전체)
#       npm run e2e -- 02               (이름에 '02' 가 든 흐름만)
#       npm run e2e -- ios 02           (둘 다)
#
# **왜 스크립트인가 — 흐름을 한 번에 하나씩 돌려야 한다.**
# `maestro test .maestro/flows/` 로 디렉터리를 통째로 넘기면 흐름들이 같은 앱을 두고
# 서로 밟는다(2026-08-07 실측: 5개가 동시에 뒤엉켜 전부 실패). 흐름 하나가 남긴 상태가
# 다음 흐름의 전제를 깨는 것도 막아야 한다 — 그래서 순서를 여기서 고정한다.
#
# 기기도 명시한다. adb/simctl 에 여러 기기가 붙어 있으면 maestro 는 그냥 멈춘다.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

PLATFORM=android
FILTER=""
for a in "$@"; do
  case "$a" in
    ios|iOS|IOS)          PLATFORM=ios ;;
    android|Android)      PLATFORM=android ;;
    *)                    FILTER="$a" ;;
  esac
done

if [ "$PLATFORM" = "ios" ]; then
  # 부팅된 시뮬레이터를 쓴다. 없으면 켜라고 알린다 — 아무거나 골라 켜면
  # 로그인 안 된 시뮬레이터를 잡아서 전부 실패한다(아래 '한계' 참조).
  DEVICE="${KEEGO_E2E_DEVICE:-$(xcrun simctl list devices booted -j 2>/dev/null \
    | python3 -c 'import json,sys;d=json.load(sys.stdin)["devices"];print(next((x["udid"] for v in d.values() for x in v),""))')}"
  if [ -z "$DEVICE" ]; then
    echo "✗ 부팅된 iOS 시뮬레이터가 없다." >&2
    echo "  xcrun simctl boot 'iPhone 17 Pro' && open -a Simulator" >&2
    exit 1
  fi
else
  DEVICE="${KEEGO_E2E_DEVICE:-$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')}"
  if [ -z "$DEVICE" ]; then
    echo "✗ 연결된 안드로이드 기기가 없다. USB 로 연결하고 'adb devices' 로 확인할 것." >&2
    exit 1
  fi
  # 화면이 꺼지면 흐름이 전부 실패한다(잠금화면이 앱을 덮는다). 도는 동안만 켜 둔다.
  adb -s "$DEVICE" shell svc power stayon true >/dev/null 2>&1 || true
  trap 'adb -s "$DEVICE" shell svc power stayon false >/dev/null 2>&1 || true' EXIT
fi
echo "플랫폼: $PLATFORM · 기기: $DEVICE"

pass=0; fail=0; failed=()
for f in .maestro/flows/*.yaml; do
  name=$(basename "$f")
  if [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]]; then continue; fi
  echo
  echo "════ $name"
  if maestro --platform "$PLATFORM" --device "$DEVICE" test "$f"; then
    pass=$((pass+1))
  else
    fail=$((fail+1)); failed+=("$name")
  fi
done

echo
echo "──────────────────────────────────────────"
echo "통과 $pass · 실패 $fail"
if [ $fail -gt 0 ]; then
  printf '  ✗ %s\n' "${failed[@]}"
  echo
  echo "먼저 확인할 것:"
  echo "  · 앱에 로그인돼 있는가(흐름은 clearState:false — 로그인 화면이 뜨면 실패한다)"
  echo "  · 앱에 다이얼로그가 떠 있지 않은가(미완료 러닝 복구 등)"
  echo "  · 빌드가 최신인가(testID 를 추가했으면 다시 굽고 설치해야 한다)"
  if [ "$PLATFORM" = "android" ]; then
    echo "  · 폰 화면이 켜져 있고 잠금이 풀렸는가"
    echo "  · 삼성 '오동작 방지 필터'가 떠 있지 않은가(근접센서가 가려지면 뜬다)"
  else
    echo "  · 가장자리 스와이프가 안 먹으면 .maestro/subflows/back.yaml 의 좌표를 볼 것"
    echo "    (SwipeBack 은 왼쪽 24pt 안에서 시작해야만 인식한다 — primitives.tsx)"
  fi
  exit 1
fi
