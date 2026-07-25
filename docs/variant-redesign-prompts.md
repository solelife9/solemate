# Keego × Variant — 리디자인 프롬프트 팩

> Variant(AI UI 생성기)에 붙여 넣어 Keego 화면을 다시 디자인시키기 위한 프롬프트 모음.
> Variant 는 "아이디어를 넣으면 완성된 UI 시안이 스크롤 피드로 쏟아지는" 도구라, **한 번에 한 화면**을
> 요청하고, 마음에 드는 시안이 나오면 Style Dropper 로 그 시각 DNA를 고정해 다음 화면에 물려주는 흐름이 맞다.
>
> 프롬프트 본문은 **영어**로 썼다(생성 품질이 안정적). 다만 **화면에 실제로 찍히는 글자는 우리 앱 코드의
> 한국어 원문 그대로** 넣어 뒀으니 그대로 붙여 넣으면 된다. 각 블록 위의 한국어 메모는 민우님용이라
> 붙여 넣지 않아도 된다. 카피·수치·색은 전부 2026-07-26 현재 코드에서 뽑은 실제 값이다.

---

## 0. 쓰는 순서

1. **§1 Style DNA 프롬프트를 먼저** 넣어 톤을 잡는다(나온 결과 중 가장 Keego 다운 것 1장을 고른다).
2. 그 시안에 **Style Dropper** 를 적용해 시각 DNA를 저장한다.
3. §2부터 **화면 프롬프트를 하나씩** 넣는다. 매번 저장한 DNA를 물린다.
4. 나온 시안은 §15 체크리스트로 거른다 — 거르지 않으면 **예쁘지만 Keego가 아닌 화면**이 쌓인다.
5. 같은 화면을 다르게 보고 싶으면 §16의 변주 한 줄을 프롬프트 끝에 덧붙인다.

### 모든 화면 프롬프트에 붙일 꼬리말

```
Platform: iOS app screen, 393×852pt (iPhone 15 Pro), dark mode only, single column, safe-area aware.
All visible text must be Korean, exactly as written in this prompt — do not translate, do not invent
extra copy. Numbers use tabular figures. No stock photos, no illustrations of people, no 3D renders,
no emoji, no confetti.
```

---

## 1. Style DNA 프롬프트 (가장 먼저 넣는 것)

한국어 메모: 우리 디자인 정본(DESIGN.md + theme.ts)을 Variant가 알아들을 언어로 압축한 것.

```
Design a dark, premium running app UI system for "Keego" — a Korean running app whose signature is
running-shoe lifespan management (shoe-first). Benchmarks: Apple Fitness, WHOOP, Spotify Wrapped.
The feeling is restraint and material quality: never colorful, never gamified, never playful.

COLOR
- Background #0A0A0A (near-black). Cards are translucent white glass over it, never opaque panels:
  fill rgba(255,255,255,0.08); hero/active cards 0.11; primary buttons 0.12.
- Card edge: a 1px hairline that FADES around the corners — brightest at top-left (key light) and
  bottom-right (bounce), fading to nothing at top-right and bottom-left. Plus a faint top sheen (3.5%).
- The emphasis color is WHITE (#FFFFFF). The interface is monochrome by default.
- The ONE brand color is "Keego Ember" #FF8000, drawn as a gradient (#FFB458 → #FF8000 → #E56600).
  It is allowed in exactly three roles: (1) the circular running-progress ring, (2) the "keego"
  wordmark, (3) small progress indicators such as weekly-goal dots and the single fastest split bar.
  Never a filled button, never a card background, never more than a couple of accents per screen.
- Semantic colors, used only where they carry meaning:
  best #4A9FF0, good #46C98B, caution #E6A23C, danger #FF5A45, achievement gold #D8B872.
  Heart-rate zones: Z1 #4A9FF0, Z2 #46C98B, Z3 #E6C34C, Z4 #F0872E, Z5 #FF5A45.
- Text: primary #FFFFFF, secondary #EBEBF5, tertiary #9C9CA3 (labels, units, captions),
  #54545B for disabled/decorative only. Separators rgba(255,255,255,0.07).

TYPE
- One family for everything: Pretendard (a Korean geometric sans; substitute Inter/SF if unavailable).
- Scale: 33 display / 27 screen title (weight 800) / 23 title / 18 heading / 16 body / 14 label /
  13 caption / 11 micro.
- Large numbers ONLY use Jost: 40 / 56 / 76, and up to 104–150 for the running hero. Always tabular
  figures, line-height ≥ 1.22×. Korean text never uses Jost.
- Units (km, /km, bpm, %) are smaller than the number, baseline-aligned, in tertiary gray.
- Mid-size numbers are a single ramp: 20 / 24 / 30, always weight 700.

FORM
- 4pt spacing grid: 4/8/12/16/20/32. Screen side margin 20. Card padding 16. Section gap 20–24.
- Radii: 12 small / 14 input / 16 medium / 18 button / 20 card / 24 large / 34 hero / pill.
- Chips have ONE grammar app-wide: unselected = 4% white fill + hairline border + #EBEBF5 text;
  selected = 14% white fill + 40% white border + pure white text. Chips are never colored, except
  heart-rate zone chips which take their zone color when selected.
- A floating blurred glass tab bar docks at the bottom; the active tab is marked by a sliding oval
  SHAPE, not by color. Content keeps ~118pt bottom clearance.
- Progress: a circular ring for running; elsewhere quiet dots, thin bars, or a numeric fraction.
  Never a decorative bar that repeats a number printed right next to it.

MOTION (design static states, but assume)
- Content rises 14px with a fade on entry, 60–120ms stagger. Press = scale 0.97. Sheets slide 420ms.
- No glow, no neon, no bounce.

HARD RULES
- Dark mode only. No light variant.
- Shoes are NEVER photographed, rendered, or illustrated. A shoe is expressed by (a) a flat single-color
  line glyph, (b) a lifespan ring or bar, (c) a type stack: brand in tracked caps → model name in large
  display type → tabular numbers. This is a deliberate identity decision, not a limitation.
- Every number must look like a real measurement. No fake leaderboards, no fake badges.
- Minimum touch target 44×44pt.
- Korean copy only, in a calm, warm, adult voice — never cute, never meme, never RPG.
```

---

## 2. 홈 (Home) — shoe-first 척추

한국어 메모: 정체성이 가장 진하게 걸린 화면. "신발 히어로 → 러닝 시작" 뼈대는 불가침이고, 그 안의 리듬·여백은 새로 받아도 된다.

```
Design the home screen of Keego, a running app whose home is built around SHOES, not a social feed.
Vertical scroll, floating glass tab bar docked at the bottom, a faint monochrome ambient glow at the top.

TOP BAR — the lowercase wordmark "keego" on the left (24pt, Keego Ember #FF8000), and on the right a
small outlined pill: a plus icon + "신발 추가".

TITLE — one line: "오늘의 신발" (23pt, weight 700, white). Optionally a small gray chip beside it
carrying an earned title, e.g. "꾸준한 러너".

SECTION 1 — Today's shoe carousel (the spine of the product; stays first and dominant)
A horizontally paged carousel of large glass cards, card width ≈ 82% of the screen so the next card
peeks; neighbours scale to 0.95 and dim to 50%. Each card expresses a shoe with NO photo or silhouette:
  - line 1: "Nike · 데일리" (11pt, wide letter-spacing, white at 55%)
  - line 2: model name "Pegasus 41" (23pt, weight 700, white)
  - top-right: a condition dot + word — "최상" (#4A9FF0) / "양호" (#46C98B) / "교체 고려" (#E6A23C) /
    "교체 권장" (#FF5A45). Only the dot carries color; the word stays near-white.
  - the hero: a large lifespan RING (≈190pt, 14pt stroke). Track = condition color at 16%, arc =
    condition color. The ring counts DOWN — it shows life REMAINING, like a battery.
    Centered inside: the label "남은 수명" (15pt, white 55%), the number "63" (58pt Jost, weight 700),
    and the unit "%" (21pt).
  - under the ring, one quiet line: "사용 412/650km · 238km 남음"
  - a full-width glass CTA at the bottom of the card: a play glyph + "러닝 시작" (18pt/700, 54pt tall)
  - page dots below the carousel (inactive 5×5 at white 22%, active a 16×5 pill)

SECTION 2 — Guardian line (conditional; only when the selected shoe is more than 80% worn)
A single rounded bordered row with a 9px dot, tinted by severity:
  - caution (#E6A23C, 12% fill, 40% border): "남은 수명 24% · 슬슬 교체를 준비할 때"
  - danger (#FF5A45): "지금 교체하면 부상 없이 계속" with a trailing action word "대안"
It must read as advice, not an alarm — no filled red bar, no warning triangle, no icon circle.

SECTION 3 header — a small gray label "이번 주 러닝" on the left, a quiet "전체 보기 ›" on the right.

SECTION 3 — the weekly card. ONE card only (this was recently consolidated from three; do not split it)
  - Hero row, left: this week's distance and goal as a SINGLE numeric axis — "7.0" (30pt Jost, white)
    followed by " / 95 km" (16pt, tertiary gray). Tapping the row opens a goal sheet.
  - Hero row, right: seven 8px dots for Mon–Sun. Days run are filled Keego Ember; rest days are white
    at 16%; today carries a thin white outline ring.
  - There is NO progress bar and NO "N일 연속" streak chip. The axis and the dots already say it.
  - Bottom row, three equal cells split by vertical hairlines:
      "횟수" → "3" + "회"
      "평균 페이스" → "5'42\""
      "훈련 부하" → a small colored dot + a status word ("안정적") + a chevron
  - Tapping the third cell expands the training-load detail INSIDE the same card (hairline divider,
    then "훈련 부하 — 안정적", a horizontal gauge 0–2.0 with a green sweet-spot band and a white pin,
    scale ticks "0.8" "스윗스팟" "1.3" "1.5", two bordered chips "최근 7일 42.0km" and
    "평소 주간 평균 31.5km / 최근 4주", and a small disclaimer
    "참고용 가이드예요 · 의학적 조언은 아니에요").
  - Empty week variant: the hero row stays; instead of the three cells, one quiet line
    "이번 주 첫 러닝을 시작해보세요".

SHEET — tapping the hero row opens a bottom sheet titled "주간 목표": a minus button, the value
"30 km" (30pt Jost + small gray unit), a plus button. At zero the value area reads "목표 없음".

EMPTY STATE (no shoes yet) — replaces sections 1–3 entirely:
a ghost card with the same silhouette as a real shoe card (an empty ring track at white 8% with a flat
shoe glyph centered inside), one hint line "등록하면 이 링이 신발 수명을 지켜봐요", a row of three value
words separated by dots — "누적 거리" · "교체 시기" · "부상 예방" — and a glass CTA "러닝화 등록".
Beneath, centered, the promise in two lines:
"신발이 얼마나 닳았는지 기록해서, 부상 없이 더 오래 달리게 해드려요."

Show three versions: (a) load detail collapsed, (b) expanded, (c) the empty state.
```

**주의(민우님)**: 홈에는 큰 숫자가 둘(신발 링 58pt "남은 수명 %" vs 주간 카드 30pt 거리)이고, **링이 주인공**이라는 위계가 정체성입니다. Variant가 주간 카드를 더 크게 그려 오면 그 시안은 홈의 척추를 바꾼 겁니다.

**변주 한 줄** — `Try a version where the shoe card is full-bleed and the lifespan ring is a large watermark behind the model name.`

---

## 3. 러닝 목표 (Run Goal) — 러닝 시작 직전

한국어 메모: 어제 재구성한 화면(룰러 폐기·심박 접힘). 현재 구조를 주고 더 나은 리듬을 받는다.

```
Design the "set your goal, then start running" screen of a dark premium running app.
It must feel like ONE decision, not a settings form: one giant number, one row of choices, everything
advanced folded away. The hero sits in the vertical middle with generous air.

NAV — a back chevron on the left, the title "러닝 목표" centered.
MODE STRIP — a segmented control with four items: "거리" · "시간" · "스피드" · "트랙".

MODE "거리" (design this as the main screen):
  1. HERO: a tappable number "5.0" at 104pt Jost with the unit "km" baseline-aligned beside it.
     With no goal chosen the number is replaced by the WORD "자유" at 64pt — same line height, so
     nothing jumps.
  2. One caption line under it: with a goal → "예상 시간 약 30분 · 약 320 kcal";
     without → "목표 없이 달려요 · 숫자를 탭하면 직접 입력".
  3. One wrapping row of preset chips: "자유" "3km" "5km" "10km" "하프" "풀".
  4. A COLLAPSED row above the button: "심박 가이드 · 끄기" with a trailing "›" (44pt tall).
     Expanded it reveals four chips "끄기" "Z2 이지" "Z3 템포" "Z4 역치" — only the selected chip takes
     its zone color — plus one hint line "114–132 bpm · 지방 연소·기초 지구력".
     Draw both the collapsed and the expanded state.
  5. A full-width primary glass button at the bottom: a play glyph + "러닝 시작", 60pt tall.
  There is deliberately NO ruler or slider: quick picks are the chips, precision is a numeric keypad
  sheet that opens when the hero number is tapped.

MODE "스피드":
  1. HERO: average pace "5'42\"" at 56pt Jost with the unit "/km", flanked by a 44pt square glass minus
     button on the left and plus button on the right (icons only, no color).
  2. Auto summary line beneath, centered: "5km · 예상 30'00\"".
  3. Distance chips, same grammar as 거리: "3km" "5km" "10km" "하프".
  4. A small segmented control "일정" / "네거티브(점점 빠르게)" with the caption
     "초반은 여유 있게, 후반에 속도를 올려요".
  5. A collapsed row "km별 목표 조정 ›" expanding into a horizontal strip of two-line chips
     (top "1km", bottom "5'50\"") and a fine-tune row on a glass panel: "3km 목표" on the left,
     "[−] 5'45\" /km [+]" on the right.
  6. The same "러닝 시작" button.

MODE "트랙" (one variation is enough):
  a small uppercase overline "한 바퀴", the hero "400" + "m", the caption
  "야외에선 첫 바퀴를 GPS로 자동 보정해요", and four two-line chips "200 m" "300 m" "400 m" "커스텀".
```

---

## 4. 러닝 중 (Run Active) — 불가침 화면

한국어 메모: "정보를 더하면 지는" 유일한 화면. Variant에 겹 수 상한을 숫자로 못 박는다.

```
Design the LIVE RUNNING screen of a dark premium running app, in three states. It is read while the
runner is moving outdoors, in glances shorter than a second: legibility beats decoration, contrast
target AAA. HARD CONSTRAINT — while actually running, at most FOUR blocks may be on screen at once.
The circular ring is the only place the brand orange appears.

STATE A — countdown (2 blocks)
  Top row: a "‹ 취소" pill on the left, a shoe chip "Alphafly 3" on the right (both 30pt tall).
  Center: the ring (280pt diameter, 16pt stroke, gradient #FFB458 → #FF8000 → #E56600) filling one third
  per second, with "3" at 150pt Jost inside and the line "곧 시작해요" beneath it. On the last beat the
  number becomes "GO" (104pt, white). Just below the ring, a small chip "목표 5.0 km".
  The metric row and the control keep their space but are invisible, so nothing shifts when the run starts.

STATE B — running (4 blocks; perfect this one)
  1. Top row: an 8pt dot + "러닝 중" on the left, the shoe chip "Alphafly 3" on the right.
  2. The ring, same 280/16, filled to progress. Inside: "3.42" at 104pt Jost, with the unit "km" below.
     The goal number is deliberately NOT printed anywhere — the ring's fill IS the goal.
  3. Three metrics under the ring, separated only by thin VERTICAL hairlines (no horizontal rules):
        "16:04" / label "시간"
        "152"  / label "Z3 템포"   ← value and label take the heart-rate zone color (#E6C34C here)
        "5'02\"" / label "현재 페이스"
     Values 37pt, labels 11pt at 45% white.
  4. One control: an 88pt circular glass button with a pause glyph and the word "일시정지" beneath.
     Glass with a white rim — never an orange filled button.
  Nothing else: no map, no cards, no coaching, no chips.

  Conditional single lines (draw as variants, each inserting itself without pushing the ring):
   - weak GPS pill (amber, 12% fill): "GPS 신호 약함 — 거리 기록이 잠시 멈출 수 있어요"
   - permission banner (red hairline): "위치 권한이 꺼져 거리 기록을 멈췄어요. 눌러서 다시 허용하세요."
   - speed-mode coaching pill: "목표 5'42\" · 적정 페이스"
   - goal toast, auto-dismissing after 3 seconds: "목표 5km 달성!" / "계속 달려요 — 기록은 신발에 쌓이는 중"
   - track mode adds a quiet line under the ring "12.00 km · 400 m 랩 · 보정됨", a recent-laps line
     "지난 랩  1랩 2'02\"  2랩 1'58\"", and a wide "랩 기록" button with the lap count at its right end.

STATE C — paused (the ring disappears; this contrast is a deliberate product decision)
  1. Top row: dot + "일시정지", plus a small speaker toggle beside the shoe chip.
  2. A full-bleed dark map panel slides down from the top, route traced in white, with a small expand
     badge at its lower right. (Indoors, with no route, this panel is simply absent.)
  3. Six metrics in two rows of three, values at 30pt:
        "3.42" / "거리 km"    "16:04" / "시간"      "5'10\"" / "평균 페이스"
        "152" / "Z3 템포"     "205 kcal" / "칼로리"  "46 m" / "고도"
  4. Two 76pt glass circle controls: a red stop glyph with the hint "길게 눌러 종료" (holding fills a
     red arc around it), and a play glyph with the hint "재개".

Draw all three states side by side; the ring must sit at the identical position in A and B.
```

---

## 5. 완주 리캡 (Run Recap) — 러닝 직후

한국어 메모: 감정이 가장 높은 순간. 축하하되 유치해지면 안 되는 좁은 길이라 "무채 축하"를 명시한다.

```
Design the post-run summary screen of a dark premium running app — the moment right after finishing.
It should feel like a quiet, earned full stop: no confetti, no color explosion, no cartoon badges.
Vertical scroll with a fixed footer.

  1. A single trash icon in the top-right corner (the run is auto-saved; this is the discard path).
  2. Celebration header: a 52pt circular badge with a green check (#46C98B at 14% fill), the line
     "러닝 완료", and the shoe name in gray beneath.
  3. HERO: "5.02" at 68pt Jost weight 700, with the unit "km" beside it.
  4. A badge row (omit the whole row when there are none):
       "트랙 · 400m × 12랩"   "목표 5km 달성"   "신기록 · 최장 거리"
     Goal/track badges are white-on-glass; only the personal-record badge is green.
  5. Optional race banner — the one place gold (#D8B872) is allowed: a medal glyph, the title
     "서울마라톤 달리셨나요?", the body "메달과 공식 기록을 아카이브에 남겨보세요.", a primary
     "대회 기록 남기기" and a ghost "일반 러닝이에요".
  6. Course map card labeled "오늘의 코스": dark map, route traced in white.
  7. Shoe-wear card (the product signature): a small footsteps glyph, the shoe name, and the line
     "+5.0km · 남은 내구도 68%  −2%".
  8. One-line training load: a colored dot + "이번 주 훈련 부하 적정".
  9. Metric grid, two columns of glass tiles (4–6 tiles depending on available data):
       "시간 28:14" · "평균 페이스 5'37\" /km" · "평균 심박 152 bpm" · "칼로리 410 kcal" ·
       "케이던스 176 spm" · "상승 고도 46 m"
     With no watch data the grid shrinks and one gray caption appears:
       "워치를 함께 쓰면 심박·심박존이 기록돼요"
 10. Pace-plan result (speed runs only): header "페이스 플랜 결과" with the summary "목표 대비 빠름 −6초",
     then rows "1km · 목표 5'42\" · 5'36\" · −6초" (faster green, slower amber).
 11. Splits section titled "구간": per-kilometer rows with a horizontal bar where FASTER = LONGER.
     All bars white at 30% except the single fastest split, which is brand orange #FF8000.
 12. Photo + memo block: an empty slot with a camera glyph and "오늘의 한 컷 남기기", and a one-line
     input with the placeholder "오늘의 러닝, 한 줄로".
 13. Fixed footer with two glass buttons: "공유" (narrower) and "완료" (wider). Never an orange button.
```

---

## 6. 기록 탭 (History)

```
Design the "records" tab of a dark premium running app.
  1. Header: the title "기록" (27pt, weight 800) on the left, a plus glyph on the right.
  2. A four-item segmented control: "주" · "월" · "년" · "전체".
  3. A period title that doubles as a picker trigger: "2026년 7월" (18pt, weight 700) + a chevron-down.
  4. A summary glass card: the hero "128.4" (42pt Jost, weight 700) + the unit "km", then three cells
     "12 회 / 횟수" · "5'42\" / 평균 페이스" · "11:24:07 / 총 시간". Below a hairline, a compact bar chart
     titled "주간 거리" with labels "1주 2주 3주 4주" (white bars at low opacity, no axis chrome).
  5. A section label "러닝 기록" (14pt, weight 700, gray).
  6. Run rows, each a glass card:
       top-left "Nike" (13pt tracked gray) over "Pegasus 41" (18pt, weight 700, white)
       top-right "7월 24일 금요일" (gray)
       a three-cell metric row: "8.42 km / 거리" · "5'30\" / 평균 페이스" · "46:23 / 시간"
     No thumbnails, no map previews, no colored accents in the list.
  7. A quiet footer button when the list is truncated: "모든 기록 24개 보기" + a chevron-down.
  8. Empty state: the headline "아직 기록이 없어요", the supporting lines
     "가볍게 한 걸음부터 — 첫 러닝을 마치면 이 자리에 쌓여요." /
     "지난 러닝은 기록 추가로 직접 남길 수도 있어요.", TWO ghost run cards made of the same glass
     (the second at 45% opacity), and a small pill CTA "기록 추가". Top-aligned, never centered.

Consider folding the period title (3) into the summary card header so the screen loses one floating layer.
```

---

## 7. 런 상세 (Run Detail)

```
Design the detail screen for one completed run, dark and premium.
  1. Nav row: a back chevron, and three quiet trailing glyphs (share, edit, delete — delete in red).
  2. Shoe title, with no card around it: "Nike" (13pt tracked gray) over "Pegasus 41" (23pt/700 white).
  3. Date line: "7월 24일 금요일" (14pt gray).
  4. HERO: "8.42" at 56pt Jost with the unit "km".
  5. A metrics card, three columns × two rows, values at 20pt weight 700:
     "시간 46:23" · "평균 페이스 5'30\" /km" · "칼로리 420 kcal" ·
     "케이던스 178 spm" · "상승 고도 86 m" · "평균 심박 152 bpm"   (missing values render as "--")
  6. Training-load card: the title "트레이닝 부하", the subtitle "심박 기반 — 이 러닝의 체감 강도" on the
     left, and on the right the score "86" (23pt/700) with a band word "적당".
  7. Grade-adjusted pace card: the title "경사 보정 페이스 (GAP)", subtitle
     "오르막 코스 — 평지였다면 이 페이스", right side "5'12\"" + "/km".
     These two cards share identical grammar — MERGE them into one card with two hairline-separated rows.
  8. Heart-rate card: the header "심박 존" with a collapse chevron on the left and "평균 148 · 최대 172 bpm"
     on the right; a curve with soft zone-colored bands, a white line, and a dashed average line labeled
     "평균 148"; then five zone bars "Z5 무산소" "Z4 역치" "Z3 템포" "Z2 유산소" "Z1 회복" with times.
     A quiet note when resting HR is unknown: "마이 탭에서 안정시심박을 설정하면 심박 존이 더 정확해져요".
     When this card is present, do NOT repeat average heart rate in the metrics grid.
  9. Optional photo (200pt tall, 16pt radius) and a memo rendered as an italic quotation:
     "“오늘은 바람이 좋았다”".
 10. Course map card titled "코스": dark map, white route.
 11. Splits section titled "구간": a header row "km · 평균 페이스 · 고도", then rows
     "1 · [bar] · 5'30\" · +12m". Bars are longer when faster, white at 30%, and ONLY the fastest split
     is brand orange #FF8000.
 12. A quiet bottom row: a download glyph + "GPX 파일로 내보내기" with the hint "다른 앱으로 코스 옮기기".
```

---

## 8. 신발 락커 (Shoes tab)

한국어 메모: 카드 안에 수명이 네 번 나온다(큰 숫자·바·남은 수명 %·총 km). 현행 그대로 준 뒤, 병합안을 변주로 시켜서 비교하는 게 좋다.

```
Design the "my running shoes" tab of a dark premium app. There is NO shoe photography anywhere —
a shoe is expressed by type, a lifespan bar, and numbers.

  1. Header: the title "러닝화" (27pt, weight 800) + a trailing outlined pill "신발 추가".
  2. Conditional summary banner (amber, 10% fill, 35% border): an alert glyph + "곧 교체할 신발 2켤레".
  3. A vertical list of shoe cards, sorted so the most urgent comes first. Each card:
       row 1 — "Nike" (13pt tracked gray) · a small type chip "데일리" · on the right a condition dot +
               word ("교체 고려") and a 32pt circular play button
       row 2 — the model name "Pegasus 41" (23pt, weight 700, white) ← the hero of the card
       row 3 — a purpose sentence in gray: "데일리 러닝과 장거리 훈련에 적합해요"
       row 4 — the cumulative distance "412" (27pt Jost) + the unit "km"
       row 5 — a 6pt lifespan bar, filled to the REMAINING share, tinted by condition
       row 6 — bar labels: "남은 수명 37%" on the left, "총 650km" on the right
       row 7 — a conditional forecast line, shown only when replacement is within ~8 weeks:
               "이 페이스면 약 5주 후 교체 권장 · 예상 9월 3일", or when overdue
               "지금 교체하면 부상 없이 계속 달릴 수 있어요"
  4. A rotation section titled "로테이션 인사이트": a glass card of rows, each with the brand above the
     model name, a small badge, and one observation line — e.g. badge "장기 휴식중" with
     "로테이션에 포함해보세요.", or badge "사용 빈도 높음" with "요즘 가장 많이 신는 신발이에요."
     This section observes; it never recommends.
  5. A quiet bottom row with no background: an archive glyph + "보관된 신발 3켤레" + a chevron.
```

**변주(꼭 같이 시켜보기)** — `Now try a version where the lifespan is stated only ONCE per card: merge "412km", "남은 수명 37%" and "총 650km" into a single axis such as "412 / 650 km · 37%", and delete the bar-label row.`

---

## 9. 신발 상세 (Shoe Detail)

```
Design the detail screen for one running shoe, dark and premium, with no image of the shoe.
  1. Nav: a back chevron, and trailing edit (pencil) and delete (red trash) glyphs.
  2. Identity block: "Nike" (13pt, wide tracking, gray) / the model name "Pegasus 41" at 33pt weight 700
     — the largest type on the screen / on the right a condition chip: a dot + "교체 고려" on a raised
     pill / below, purpose chips "데일리" "장거리".
  3. Durability card — the heart of the screen:
       the label "잔여 수명" with a small pencil affordance,
       a lead sentence "교체까지 약 382km 남았어요" (only the number and unit in bold white),
       a 14pt pill-shaped gauge filled to the remaining share and tinted by condition,
       and scale labels "남은 수명 59%" (left) / "총 650km" (right).
       A small centered note when body weight adjusts the target: "몸무게 반영 · 기저 650km".
       Tapping the pencil reveals a stepper row: "[−]  수명 650 km  [+]".
  4. Conditional injury banner (amber or red, 12% fill, 40% border):
     "슬슬 다음 신발을 준비하면 부상 없이 계속 달릴 수 있어요"
  5. Conditional retirement keepsake card — the only card allowed a full 30% white border:
     the title "훌륭한 여정이었어요", the body
     "Pegasus 41이(가) 권장 수명에 도달했어요. 계속 신을지, 멋지게 은퇴시킬지는 직접 정해요.",
     and two buttons "계속 사용" / "은퇴". Never retire a shoe automatically.
  6. Stats card, three columns × two rows (values 24pt Jost weight 700, labels 13pt gray):
     "412 km / 누적 거리" · "38 회 / 러닝 횟수" · "04:12:33 / 러닝 시간" ·
     "5'30\" /km / 평균 페이스" · "21.1 km / 최장 러닝" · "32.5 km / 주 평균 · 4주"
     Below it one gray line with the percentage in bold white:
     "최근 4주 러닝의 68%를 이 신발과 달렸어요"
  7. Forecast card: the label row "교체 예상" with an accuracy chip ("● 정확도 높음", green) on the right,
     and the body "약 5주 후 교체 예상" with the weeks in bold white.
  8. Section header: "이 신발로 달린 기록" on the left, "6월 3일부터 · 마지막 착용 7월 24일" on the right.
     Then run rows whose title area shows the weekday and date instead of repeating the shoe name.
     Empty variant: one card with the line "아직 기록이 없어요".
  9. Bottom: a full-width 54pt outlined button in red-on-transparent: an archive glyph + "보관 처리".
```

---

## 10. 마이 탭 (Profile)

한국어 메모: 스트릭·주간목표 카드가 홈으로 빠져나가 얇아진 화면이라, 리듬을 다시 짜 달라고 하기 좋다.

```
Design the "my profile" tab of a dark premium running app. It holds identity, brag-worthy stats, and a
look-back — nothing else. It must NOT contain a weekly goal card or a streak card (those moved to the
home screen); do not re-invent them.

  1. Header: the title "마이" (27pt, weight 800) on the left; two 38pt circular glass icon buttons on the
     right (share, settings).
  2. Identity lockup: a circular avatar with a thin ring and a small camera badge at its lower right.
     Above the name, a rank eyebrow in its tier color — e.g. "Gold". Then the name "민우" (large, white)
     with a small pencil glyph, then one gray meta line: "2026년 3월부터 · 업적 12 · 은퇴 3".
  3. A "러너 스펙" card — the brag sheet:
       a 2×2 grid of personal-best tiles labeled "5K" "10K" "하프" "풀".
       Achieved tiles: a small gold medal glyph, a white label, and the time "26:12".
       Unachieved tiles: a lock glyph, gray label, and the word "아직" on a dimmer surface.
       Under a hairline, three stats: "412 km / 누적 거리" · "-- / 최장 러닝" · "-- / 1km 최고".
       A footer line: a pulse glyph + "심폐 체력 48.2 VO₂max · 우수".
       A quiet "공유" action at the card's top right, in white.
  4. Three navigation rows sharing one grammar (38pt rounded glyph box, title, subtitle, chevron), with
     neutral gray-white glyphs — never brand orange:
       "진척" / "나의 여정 · 업적"
       "러닝화 아카이브" / "은퇴한 신발 3켤레"
       "메달 아카이브" / "완주 메달 4개"
  5. A "돌아보기" section: a small segmented control "주간" / "월간", then a card headed by the period
     "7.20–7.26" with a "공유" action, a three-cell stat grid
     ("128.4 km / 총 거리", "12 회 / 러닝 수", "5'38\" /km / 평균 페이스"),
     a most-worn line "최다 착용 · Pegasus 41  32km", and a small records box
     ("1km 최고 4:12", "5km 최고 26:12", "최장 거리 21.10 km").
     Empty variant: a footsteps glyph and two lines
     "이번 주는 아직 기록이 없어요." / "가볍게 한 걸음부터 — Keep Going".
  6. The floating glass tab bar with "마이" active.

This screen has NO hero number — the largest type is the personal-best times. If it needs a focal point,
make it the identity lockup or the runner-spec card, never a newly invented metric.
```

---

## 11. 설정 (마이 탭 안쪽)

한국어 메모: 행이 많은 화면이라 "긴 목록을 어떻게 프리미엄하게 보이게 하느냐"가 과제다.

```
Design a settings screen for a dark premium running app: a back chevron + the title "설정", then grouped
glass cards of rows. Each row = a white glyph, a label, a gray detail value on the right, and a chevron.
Tapping a row expands an inline panel beneath it — never a new screen.

Card 1 — rows with their right-hand values:
  "알림" → "3개 켜짐"      (expanded: toggles "교체 임박 알림" / "주간 목표 알림" / "러닝 리마인더",
                            a stepper "80% 사용 시", the hint "신발 수명의 80%를 쓰면 알려드려요")
  "음성 코칭" → "1km 마다"  (expanded: a toggle, a segmented control "0.5km"/"1km"/"2km"/"끄기",
                            a volume segment "작게"/"보통"/"크게", the hint "변경은 다음 러닝부터 적용돼요")
  "자동 일시정지" → "켜짐"   (the word turns green when on)
  "햅틱(진동)" → "켜짐"
  "Apple 건강" → "연동됨"
  "단위" → "킬로미터"
  "신체 정보" → "72kg · 34세"

Card 2 — "계정 · 클라우드": a signed-in row with the provider, the email, and a cloud-done glyph; a sync
line "09:42 동기화됨"; then quiet red rows "로그아웃" and "회원 탈퇴" (subtitle
"계정·데이터 영구 삭제(복구 불가)"); then three legal rows "문의하기" · "개인정보 처리방침" · "이용약관".

At the very bottom, in small gray type, a maker's note:
"keego는 러너 한 사람이 직접 달리며 만들어요. 모든 숫자는 실제 기록이고, 교체 예측은 어떤 제휴와도
무관하게 달린 데이터로만 계산해요. 부상 없이, 계속 달리도록 — keep going."

Long lists must still feel premium: generous row height, hairlines only inside a card, and no color
except the green "on" state and the red destructive rows.
```

---

## 12. 메달 아카이브 · 대회 기록

한국어 메모: 골드(#D8B872)가 허용되는 유일한 도메인. 그래도 트로피 남발은 금지.

```
A) MEDAL ARCHIVE LIST
Header "메달 아카이브" with a plus glyph. A summary strip on glass: "7 / 메달" ┃ "184.4 km / 완주 거리"
┃ "풀코스 / 최장" (values 23pt weight 800, labels 11pt gray, hairline dividers). One caption
"완주한 대회의 메달과 기록." Then a three-column grid of medal cells: an 84pt circular disc (1px gold
border at 35%, gold fill at 8%, a medal glyph inside when there is no photo), the race name on up to two
lines, and beneath it "하프 1:38:12" where the time is gold and tabular.
Empty state: the headline "아직 메달이 없어요", the lines
"대회를 완주하면 자동으로 감지해 이 자리에 걸려요." / "지난 대회의 메달은 메달 추가하기로 지금 남길 수 있어요.",
two ghost tiles (the second at 55% opacity), and a gold-tinted pill CTA "메달 추가하기".

B) MEDAL DETAIL (a full-screen overlay that slides up)
Nav: a chevron-down on the left, share (gold) and trash (gray) on the right.
A 168pt medal disc, the race name "2026 서울 하프마라톤" (23pt/700, centered), then the finish time as the
HERO in gold: "1:38:12" (40pt Jost, weight 700). A small centered note when the app's own timing differs:
"앱 측정 1:38:31 · 공식 기록(칩 타임)이 정본".
Then an info card of label/value rows split by hairlines: "종목 하프" · "평균 페이스 4'39\" /km" ·
"장소 여의도" · "날짜 2026-04-12" · "배번 5224". Do NOT repeat the finish time inside this card — the hero
already said it. Optional certificate photo under the label "기록증", and a link row
"이 대회 러닝 기록 보기".

C) RACE ENTRY, step 1 — "어떤 대회였나요?"
A close glyph and the centered title. A search field with the placeholder "대회 이름 검색". A section label
"러닝 날짜 근처 대회". Result rows on glass: the race name, "2026-04-12 · 서울", and a gold pill listing
its distances "하프·풀코스". At the bottom, a dashed-border box: "찾는 대회가 없나요?", an input
"대회 이름 직접 입력", and a button "이 대회로".

D) RACE ENTRY, step 2 — capture and confirm
Two dashed capture slots side by side, 150pt tall, 20pt radius. The medal slot is gold-tinted: a medal
glyph + "메달 촬영" + "원 안에 맞춰 찍어요". The certificate slot has four states — default
("기록증 촬영" / "공식 기록 자동 인식"), loading, success (green check + "기록증 인식됨" + "다시 찍기"),
failure (amber + "기록을 못 읽었어요" + "다시 찍거나 직접 입력").
Then fields: "대회 날짜" (2019-11-03), distance chips "5K" "10K" "하프" "풀코스",
"공식 기록 (칩 타임)" with a small green "인식됨" tag, "평균 페이스 (/km)",
and "배번호 (선택 · 나만 보기)" with the hint
"공식 기록 재조회용이에요. 내 아카이브에만 저장되고 공유엔 포함되지 않아요."
A fixed footer button: "아카이브에 저장".
Say the OCR result ONCE — at the slot — and let the field tags mark only which values were auto-filled.
```

---

## 13. 온보딩 (3화면)

한국어 메모: **여기 한 곳만 사진을 쓴다**(흑백 러너 사진 배경). Variant가 다른 화면까지 사진을 물들이지 않게 프롬프트에 범위를 못 박아 뒀다.

```
Design a three-screen onboarding flow for a dark premium Korean running app.

SCREEN 1 — Welcome (the ONLY screen in the entire app allowed to use a photograph)
A full-bleed black-and-white photograph of a runner as the background at 92% opacity, with a brand-tinted
gradient from the top-left and a bottom fade to near-black for legibility. The lowercase wordmark "keego"
at the top left. The headline in two lines, 48pt, weight 600, tight tracking:
     "KEEP"
     "GOING."     ← the period alone is Keego Ember #FF8000; this is the brand signature
Then the subline "멈추지 않는 발걸음을 위해" (18pt/600 white) and the body
"keego가 러닝화 수명을 추적해, 부상 없이 평생 달리도록 도와요." (16pt, white at 66%).
A primary button "시작하기". Beneath it a text link where only the second half is white:
"건너뛰고 시작하기". At the very bottom, 13pt gray legal copy with two inline links:
"계속 진행하면 keego의 이용약관과 개인정보 처리방침에 동의하는 것으로 간주돼요."

SCREEN 2 — Why shoes matter (progress dots + "건너뛰기" at the top; 2 steps total)
An uppercase eyebrow "Your shoes matter" (13pt/700, wide tracking, white), the title
"러닝화도 관리가 필요해요" (27pt/700), and the body
"러닝화는 누적 거리에 따라 성능이 달라져요. 쿠셔닝이 닳은 신발은 충격을 그대로 무릎과 발목에 전달해요."
(the first sentence's key phrase in bold white, the rest gray).
Then the centerpiece: a CUSHIONING DEGRADATION CURVE card. Header "쿠셔닝 성능" on the left,
"0 → 650 KM" on the right. The curve is a smooth line with a soft fill, horizontally graded from green
(#46C98B) to amber (#E6A23C) to red (#FF5A45), with a red-tinted danger band near the end, a dashed
baseline, and a dot at the end point. A right-aligned micro caption in red at 85%:
"대부분의 러너가 이 구간을 놓쳐요".
Below, a value card of three rows (glyph box, title, description):
  "교체 알림" / "교체 시점 50km 전, 미리 알려드려요"            (neutral white glyph)
  "정밀 측정" / "심폐 체력·경사 보정 페이스·트랙 모드 — 폰만으로"  (blue #4A9FF0)
  "쌓이는 기록" / "거리 PB·업적·메달 아카이브 — 달리다 보면 하나씩 열려요" (gold #D8B872)
A footer button "다음".

SCREEN 3 — Register the first shoe
Eyebrow "Your first pair", title "첫 러닝화를 등록해볼까요?", body
"지금 신는 러닝화를 등록하면 keego가 수명을 추적해드려요."
Then three numbered blocks, each with a small numeral badge:
  1 "내 러닝화" — a selector row on glass showing "ASICS · Novablast 5" with a search glyph and a
    chevron-down, and the hint "교체 권장 650 km 자동 설정 — 눌러서 변경할 수 있어요"
  2 "현재 누적 거리" — the value "412 KM" on the right of the label, then a slider (8pt track at white 9%,
    WHITE fill, a 26pt white thumb with a white ring) and three scale labels "새 신발" · "325 km" ·
    "650 km+", with the hint "새 신발이면 0으로 두세요."
  3 "몸무게 · 선택" — the value "72 KG" (or "—" when unset), the same slider, labels "40" · "80" · "120 kg",
    hint "몸무게를 입력하면 러닝화 수명을 더 정확히 계산해요."
A footer button "등록 완료" (disabled state reads "러닝화를 선택하세요") and the caption
"등록하면 바로 러닝을 시작할 수 있어요 · 신발은 나중에 더 추가할 수 있어요".

Screens 2 and 3 use NO photography — only type, curve, and glass.
```

---

## 14. 컴포넌트 단위 프롬프트

한국어 메모: 화면 전체가 아니라 부품만 여러 안으로 보고 싶을 때.

### 14-1. 신발 카드 — 사진 없이 신발을 말하는 법(정체성의 핵심)

```
Design 6 variations of ONE card component: a running-shoe card with NO shoe image, render, or silhouette.
The shoe may only be expressed by (a) a flat single-color line glyph, (b) a lifespan ring/arc/bar,
(c) a type stack. Card = translucent white glass (8%) on #0A0A0A with a corner-fading hairline.

Content, exactly:
  brand "Nike" · type chip "데일리" · model "Pegasus 41"
  purpose sentence "데일리 러닝과 장거리 훈련에 적합해요"
  cumulative "412" km against a target of 650km, 37% life remaining
  condition word "교체 고려" (#E6A23C)
  forecast line "이 페이스면 약 5주 후 교체 권장 · 예상 9월 3일"
State the lifespan ONCE — do not print the distance, the bar, the percentage and the target as four
separate facts. Explore: ring vs arc vs bar; number-as-hero vs model-name-as-hero; glyph or no glyph.
```

### 14-2. 빈 상태

```
Design 4 variations of an empty state for a dark premium app. Rules: top-aligned (never vertically
centered); an editorial headline at 23pt that carries the screen; one supporting line; and ONE or TWO
ghost placeholder cards built from the same glass material (the second at 45% opacity). No dashed
borders, no illustration, no icon circle, no third ghost.
Korean copy, exactly — headline "아직 기록이 없어요", support
"가볍게 한 걸음부터 — 첫 러닝을 마치면 이 자리에 쌓여요.", CTA pill "기록 추가".
```

### 14-3. 하단 탭바

```
Design a floating bottom tab dock for a dark iOS app: a blurred translucent glass pill with four items,
each a glyph + an 11pt label — "홈", "러닝화", "기록", "마이". The active item is marked by a sliding oval
behind the glyph (shape, not color) and a brighter label; inactive items are #9C9CA3.
No accent color anywhere in the tab bar.
```

---

## 15. 시안 판정 체크리스트

한국어 메모: Variant 결과를 이 순서로 본다. 하나라도 X면 버리거나 다시 시킨다.

| # | 기준 | X 신호 |
|---|---|---|
| 1 | 오렌지가 링·워드마크·소형 진행 지표에만 있는가 | 오렌지 채움 버튼, 오렌지 카드 배경, 오렌지 아이콘 남발 |
| 2 | 같은 숫자를 두 번 말하지 않는가 | 바 + 퍼센트 + 분모가 한 카드에 전부 |
| 3 | 신발이 사진·렌더·실루엣 없이 표현됐는가 | 신발 이미지 등장(온보딩 1화면의 러너 사진은 예외) |
| 4 | 큰 숫자가 화면의 주인공인가 | 라벨·아이콘이 숫자보다 크고 많음 |
| 5 | 카드가 반투명 유리인가 | #242426류 불투명 회색 판 |
| 6 | 한국어 카피가 우리 톤인가 | 반말·밈·느낌표 남발·영어 혼용 |
| 7 | 러닝 중 화면이 4겹 이하인가 | 배너·칩·카드가 러닝 중에 동시 등장 |
| 8 | 색이 의미에만 쓰였는가 | 장식용 그라데이션, 유채색 배경 |
| 9 | 터치 타깃이 44pt 이상인가 | 아이콘 버튼이 24pt 남짓 |
| 10 | 다크 전용인가 | 라이트 모드 시안 |
| 11 | 컨디션 4단계가 파랑–초록–주황–빨강 순인가 | 단계가 밀리거나 흰색이 섞임 |
| 12 | 조건부 카드를 상시 카드로 바꾸지 않았는가 | "교체 예상"이 항상 떠 있음(등장 자체가 신호인데 신호가 죽음) |

---

## 16. 변주 축 (프롬프트 끝에 한 줄 덧붙이기)

- `Make the numbers bigger and the labels quieter — it should read from two meters away.`
- `Reduce to the fewest possible layers; merge adjacent cards into one.`
- `Try an editorial magazine rhythm: one hero, generous whitespace, a small dense footer row.`
- `Try a data-dense dashboard rhythm for power users, without adding any color.`
- `Express progress with a ring instead of a bar` / `…with a numeric fraction instead of a ring.`
- `Make it feel like Apple Fitness` / `…like WHOOP` / `…like a premium mechanical watch face.`
- `State each fact exactly once — delete every element that repeats a number shown elsewhere.`

---

## 17. 부록 — 화면별 "바꾸면 안 되는 것"

한국어 메모: Variant 시안이 아무리 예뻐도 이 목록을 건드렸으면 채택하면 안 된다.

| 화면 | 불가침 |
|---|---|
| 홈 | 신발 히어로가 첫 섹션이자 화면의 주인공. 수명 링은 **남은 수명**(배터리 방향) |
| 러닝 목표 | 히어로 숫자 탭 = 정밀 입력. 목표 0 = "자유"라는 낱말 |
| 러닝 중 | 지도·서브지표·상시 GPS 표시 금지. 링이 유일한 브랜드색 |
| 일시정지 | 링을 없애고 지도를 띄우는 대비 자체가 제품 결정 |
| 리캡 | 축하는 무채. 골드는 대회 배너에만, 초록은 신기록에만 |
| 신발 | 사진·실루엣 0. 마모 4단계 색 순서(파랑→초록→주황→빨강) |
| 신발 상세 | 자동 은퇴 금지 — "계속 사용 / 은퇴"를 사용자가 고른다 |
| 기록 | 스플릿 막대는 빠를수록 길고, 최속 구간만 오렌지 |
| 메달 | 골드는 성취 도메인 전용. 배번은 공유 카드에 포함 금지 |
| 온보딩 | 사진은 1화면 배경만. "KEEP GOING." 의 마침표가 브랜드 서명 |
