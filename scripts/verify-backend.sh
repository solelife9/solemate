#!/bin/bash
# ============================================================================
# scripts/verify-backend.sh — 배포된 백엔드가 실제로 살아 있는지 확인한다.
# ----------------------------------------------------------------------------
# 왜 필요한가: 2026-07-28 배포 이후 카카오 로그인이 하루 넘게 503 으로 죽어 있었는데
# 아무도 몰랐다. 그날 로컬 테스트는 2,500개 전부 그린이었다 — 테스트는 내 컴퓨터 안의
# 코드를 검사할 뿐, **배포된 서버**는 검사하지 않기 때문이다.
# (원인: fail-closed 로 바꾼 커밋이 키 주입 없이 배포됨 → 검증 불가 → 로그인 거부.)
#
# 그래서 배포 직후 이 스크립트를 돌린다. 30초면 끝난다.
#
#   ./scripts/verify-backend.sh
#
# 판정 기준(가짜 토큰을 보내므로 '거부'가 정상이다):
#   · 401/400 = 정상. 서버가 키를 갖고 있고 검증까지 갔다는 뜻.
#   · 503     = 실패. 키가 서버에 없다 → functions/.env 확인 후 재배포.
#   · 000/5xx = 서버가 응답하지 않음.
# ============================================================================
set -uo pipefail

BASE="${KEEGO_BACKEND:-https://asia-northeast3-keego-620b8.cloudfunctions.net/api}"
fail=0

probe() { # 이름 기대코드 curl인자...
  local name="$1" want="$2"; shift 2
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@")
  if [ "$code" = "$want" ]; then
    printf '  ✅ %-34s %s\n' "$name" "$code"
  else
    printf '  ❌ %-34s %s (기대 %s)\n' "$name" "$code" "$want"
    fail=1
  fi
}

echo "백엔드 점검: $BASE"

probe "헬스체크" 200 "$BASE/health"

# 소셜 로그인 — 가짜 토큰으로 '거부되는지'를 본다. 503 이면 키가 없다는 뜻이라 실패다.
probe "카카오 로그인(가짜 토큰 거부)" 401 \
  -X POST "$BASE/auth/kakao" -H 'Content-Type: application/json' \
  -d '{"accessToken":"probe"}'

probe "네이버 로그인(가짜 토큰 거부)" 401 \
  -X POST "$BASE/auth/naver" -H 'Content-Type: application/json' \
  -d '{"refreshToken":"probe"}'

# 옛 앱 빌드처럼 refreshToken 없이 보내면 400 이어야 한다(audience 검증을 건너뛰지 않는다).
probe "네이버 로그인(토큰 누락 거부)" 400 \
  -X POST "$BASE/auth/naver" -H 'Content-Type: application/json' \
  -d '{"accessToken":"probe"}'

# 가격 조회는 키가 없어도 앱이 멀쩡해야 하므로(칸만 빔) 200/503 둘 다 정상이다.
price=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/shop/price?q=test")
if [ "$price" = "200" ]; then
  printf '  ✅ %-34s 200\n' "가격 조회"
elif [ "$price" = "503" ]; then
  printf '  ⚠️  %-34s 503 (검색 API 키 미설정 — 앱은 가격 칸만 빈다)\n' "가격 조회"
else
  printf '  ❌ %-34s %s\n' "가격 조회" "$price"
  fail=1
fi

echo
if [ "$fail" = 0 ]; then
  echo "전부 정상."
else
  echo "문제 발견 — functions/.env 에 키가 들어 있는지 확인하고 다시 배포할 것:"
  echo "  npx firebase deploy --only functions"
fi
exit $fail
