#!/bin/bash
# vprompt.sh — Variant 프롬프트를 클립보드로 복사한다. 터미널 스크롤을 뒤질 필요 없이 바로 붙여넣기.
#
# 정합 팩(docs/variant-redesign-prompts.md) — 지금 앱을 그대로 다시 그리게 한다:
#   ./scripts/vprompt.sh          → 섹션 목록
#   ./scripts/vprompt.sh 1        → §1 Style DNA(가장 먼저)
#   ./scripts/vprompt.sh 2        → §2 홈
#
# 탐색 팩(docs/variant-explore-prompts.md) — 문제만 주고 해법은 백지로 둔다:
#   ./scripts/vprompt.sh e        → 탐색 팩 섹션 목록
#   ./scripts/vprompt.sh e3       → 제품 브리프 + 제약 B + §3 홈  (제약 기본 = B)
#   ./scripts/vprompt.sh e3 c     → 제약 세트를 C(급진)로 바꿔서
#
# 화면 프롬프트에는 공통 꼬리말/브리프가 자동으로 붙는다.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOC_FIT="$ROOT/docs/variant-redesign-prompts.md"
DOC_EXP="$ROOT/docs/variant-explore-prompts.md"

TAIL='Platform: iOS app screen, 393x852pt (iPhone 15 Pro), dark mode only, single column, safe-area aware.
All visible text must be Korean, exactly as written in this prompt - do not translate, do not invent
extra copy. Numbers use tabular figures. No stock photos, no illustrations of people, no 3D renders,
no emoji, no confetti.'

# 탐색 팩 꼬리말 — 다크 전용·사진 금지 같은 현행 제약을 넣지 않는다(제약 세트가 그 역할).
TAIL_EXPLORE='Platform: iOS app screen, 393x852pt (iPhone 15 Pro), single column, safe-area aware.
All visible UI text must be Korean. Numbers use tabular figures.
Give me several structurally different directions, not one layout recolored.'

# 섹션의 코드블록(``` 안)만 추출
extract() { # $1=문서 $2=섹션번호
  awk -v n="$2" '
    $0 ~ "^## " n "\\." { insec=1; next }
    insec && /^## / { exit }
    insec { print }
  ' "$1" | awk '/^```/ { infence = !infence; next } infence { print }'
}

list() { grep -n '^## ' "$1" | sed 's/^[0-9]*:## /  /'; }

if [ $# -eq 0 ]; then
  echo "정합 팩 — 지금 앱을 그대로 다시 그리기:  ./scripts/vprompt.sh <번호>"
  list "$DOC_FIT"
  echo
  echo "탐색 팩 — 문제만 주고 백지에서 새로:      ./scripts/vprompt.sh e<번호> [a|b|c]"
  echo "  (예: ./scripts/vprompt.sh e3  → 브리프 + 제약B + 홈)"
  exit 0
fi

ARG="$1"

# ── 탐색 팩 ─────────────────────────────────────────────────────────────────
if [[ "$ARG" == e* ]]; then
  N="${ARG#e}"
  if [ -z "$N" ]; then
    echo "탐색 팩 섹션:"; list "$DOC_EXP"
    echo
    echo "쓰는 법: ./scripts/vprompt.sh e3        (브리프 + 제약B + §3)"
    echo "        ./scripts/vprompt.sh e3 c      (제약을 C 급진으로)"
    exit 0
  fi
  LEVEL="$(printf '%s' "${2:-b}" | tr '[:upper:]' '[:lower:]')"
  case "$LEVEL" in
    a) LNAME="2. 제약 세트"; PICK=1 ;;
    b) LNAME="2. 제약 세트"; PICK=2 ;;
    c) LNAME="2. 제약 세트"; PICK=3 ;;
    *) echo "제약 세트는 a|b|c 중 하나예요(기본 b)." >&2; exit 1 ;;
  esac

  BODY=$(extract "$DOC_EXP" "$N")
  [ -n "$BODY" ] || { echo "탐색 팩 §$N 을 찾지 못했어요." >&2; list "$DOC_EXP" >&2; exit 1; }

  # 브리프(§1)와 제약(§2의 PICK번째 블록)은 화면 프롬프트(§3~8)에만 앞에 붙인다.
  if [ "$N" -ge 3 ] 2>/dev/null && [ "$N" -le 8 ] 2>/dev/null; then
    BRIEF=$(extract "$DOC_EXP" 1)
    CONSTR=$(awk -v pick="$PICK" '
      /^## 2\./ { insec=1 }
      insec && /^## 3\./ { exit }
      insec && /^```/ { infence = !infence; if (infence) blk++; next }
      insec && infence && blk == pick { print }
    ' "$DOC_EXP")
    OUT="$BRIEF

$CONSTR

$BODY

$TAIL_EXPLORE"
    NOTE="제품 브리프 + 제약 $(printf '%s' "$LEVEL" | tr '[:lower:]' '[:upper:]') + "
  else
    OUT="$BODY"
    NOTE=""
  fi
  printf '%s' "$OUT" | pbcopy
  TITLE=$(grep -m1 "^## $N\." "$DOC_EXP" | sed 's/^## //')
  echo "복사 완료 → [탐색] ${NOTE}${TITLE}  ($(printf '%s' "$OUT" | wc -l | tr -d ' ')줄)"
  echo "Variant 입력창에 그대로 붙여 넣으세요(⌘V)."
  exit 0
fi

# ── 정합 팩 ─────────────────────────────────────────────────────────────────
N="$ARG"
BODY=$(extract "$DOC_FIT" "$N")
[ -n "$BODY" ] || { echo "§$N 에서 프롬프트를 찾지 못했어요." >&2; list "$DOC_FIT" >&2; exit 1; }

if [ "$N" -ge 2 ] 2>/dev/null && [ "$N" -le 14 ] 2>/dev/null; then
  OUT="$BODY

$TAIL"
else
  OUT="$BODY"
fi

printf '%s' "$OUT" | pbcopy
TITLE=$(grep -m1 "^## $N\." "$DOC_FIT" | sed 's/^## //')
echo "복사 완료 → [정합] $TITLE  ($(printf '%s' "$OUT" | wc -l | tr -d ' ')줄)"
echo "Variant 입력창에 그대로 붙여 넣으세요(⌘V)."
