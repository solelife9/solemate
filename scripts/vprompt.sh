#!/bin/bash
# vprompt.sh — Variant 프롬프트 팩(docs/variant-redesign-prompts.md)에서 한 섹션의
# 프롬프트만 뽑아 클립보드로 복사한다. 터미널 스크롤을 뒤질 필요 없이 바로 붙여 넣기 위함.
#
#   ./scripts/vprompt.sh          → 섹션 목록 보기
#   ./scripts/vprompt.sh 1        → §1 Style DNA 복사(가장 먼저 넣는 것)
#   ./scripts/vprompt.sh 2        → §2 홈 화면 프롬프트 복사
#
# 코드블록(```) 안의 영어 프롬프트만 뽑고, 화면 프롬프트(§2~14)에는 공통 꼬리말을 자동으로 붙인다.

set -euo pipefail
DOC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/variant-redesign-prompts.md"
[ -f "$DOC" ] || { echo "문서를 찾을 수 없어요: $DOC" >&2; exit 1; }

TAIL='Platform: iOS app screen, 393x852pt (iPhone 15 Pro), dark mode only, single column, safe-area aware.
All visible text must be Korean, exactly as written in this prompt - do not translate, do not invent
extra copy. Numbers use tabular figures. No stock photos, no illustrations of people, no 3D renders,
no emoji, no confetti.'

if [ $# -eq 0 ]; then
  echo "사용법: ./scripts/vprompt.sh <섹션번호>"
  echo
  grep -n '^## ' "$DOC" | sed 's/^[0-9]*:## /  /'
  exit 0
fi

N="$1"
BODY=$(awk -v n="$N" '
  $0 ~ "^## " n "\\." { insec=1; next }
  insec && /^## / { exit }
  insec { print }
' "$DOC" | awk '/^```/ { infence = !infence; next } infence { print }')

if [ -z "$BODY" ]; then
  echo "§$N 에서 프롬프트 코드블록을 찾지 못했어요. 섹션 목록:" >&2
  grep -n '^## ' "$DOC" | sed 's/^[0-9]*:## /  /' >&2
  exit 1
fi

# 화면 프롬프트(2~14)에는 플랫폼 꼬리말을 붙인다. Style DNA(1)·체크리스트류는 그대로.
if [ "$N" -ge 2 ] 2>/dev/null && [ "$N" -le 14 ] 2>/dev/null; then
  OUT="$BODY

$TAIL"
else
  OUT="$BODY"
fi

printf '%s' "$OUT" | pbcopy
TITLE=$(grep -m1 "^## $N\." "$DOC" | sed 's/^## //')
LINES=$(printf '%s' "$OUT" | wc -l | tr -d ' ')
echo "복사 완료 → $TITLE  (${LINES}줄)"
echo "Variant 입력창에 그대로 붙여 넣으세요(⌘V)."
