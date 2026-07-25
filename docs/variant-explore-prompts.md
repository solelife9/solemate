# Keego × Variant — 탐색용(백지) 프롬프트 팩

> `variant-redesign-prompts.md` 는 **"우리 앱을 그대로 다시 그려줘"** 다. 섹션 순서·크기·카피까지
> 못 박아서, 결과가 지금 앱과 비슷하게 나오는 게 정상이다(정합성 확보용).
>
> 이 문서는 반대다. **"이 문제를 처음부터 다시 풀어봐"** — 화면에 무엇이 있어야 하는지가 아니라,
> **사용자가 무엇을 하려는지와 어떤 데이터가 존재하는지**만 준다. 링·카드·탭바·색 같은 우리의
> 현재 해법은 프롬프트에 넣지 않는다. 그래야 우리가 생각 못 한 구조가 나온다.
>
> 쓰는 법: **§1 제품 브리프** + **§2 제약 세트(A·B·C 중 하나)** + **화면 프롬프트 하나**를 이어 붙여
> 한 번에 넣는다. 스크립트로 뽑으면 자동으로 이어 붙는다 — `./scripts/vprompt.sh e2 b`

---

## 1. 제품 브리프 (모든 탐색 프롬프트 앞에 붙는다)

```
You are designing a mobile running app called "Keego" from scratch. Do not imitate Nike Run Club,
Strava, Garmin, or any existing running app — this brief exists because those apps all look the same.

WHAT MAKES IT DIFFERENT
Running shoes wear out. Their cushioning degrades with accumulated distance, and running on dead
cushioning is how runners get injured. Every other running app tracks the RUN. This app tracks the
SHOE as a first-class citizen: you pick which pair you are wearing, you run, and the distance is
subtracted from that shoe's remaining life. The app tells you when a pair is finished, before your
knees do. The product promise, in the maker's own words:
"신발이 얼마나 닳았는지 기록해서, 부상 없이 더 오래 달리게 해드려요."

WHO IT IS FOR
Adult Korean runners who take running seriously enough to own more than one pair of shoes and to
care about injury. Not beginners being coaxed into a habit, not athletes chasing a leaderboard.

THE FEELING
Calm, premium, honest. It should feel closer to a well-made instrument than to a game. Never cute,
never gamified, never shouty. Every number on screen is a real measurement — there are no fake
badges, no invented rivals, no streak guilt.

VOICE
All UI text is Korean, warm and adult, in a "keep going" spirit: replacing a shoe is framed as
the condition for running injury-free, never as a loss or a scolding.

Propose a visual system that a stranger could identify at a glance without seeing the logo.
```

---

## 2. 제약 세트 — 얼마나 멀리 갈지 고르는 다이얼

한국어 메모: 위 브리프 뒤에 이 중 하나를 이어 붙인다. **B 를 권합니다** — 정체성은 지키되 비주얼은 완전히 새로 받습니다.

### A. 안전 — 우리 정체성 유지, 레이아웃만 새로

```
CONSTRAINTS
- Dark interface, near-black background, monochrome by default.
- Exactly one brand color, used sparingly; semantic colors only where they carry meaning.
- Shoes are never shown as photographs, renders, or silhouettes — express a shoe through type,
  marks, and data.
- Korean UI text. Dark mode only.
Everything else — layout, hierarchy, materials, motion language, how progress is expressed — is
yours to reinvent. Do not assume rings, cards, or a bottom tab bar.
```

### B. 권장 — 정체성만 남기고 비주얼 언어는 백지

```
CONSTRAINTS
- Korean UI text, and every number must be a real measurement.
- The shoe must feel like a first-class object in the product, not a settings field.
Everything else is open: color system (including light or high-contrast schemes), typography,
whether surfaces are cards at all, navigation structure, how progress and wear are visualized.
Do not default to what running apps usually look like. Show me a visual system I have not seen.
```

### C. 급진 — 완전 백지

```
CONSTRAINTS
None, except Korean UI text. Question everything: whether there should be a tab bar, whether the
home screen should be a dashboard at all, whether wear should be a number or a texture, whether
photography belongs here. Propose the version of this product that would exist if it were designed
in 2030 by someone who has never used a fitness app.
```

---

## 3. 홈 — "오늘 뭘 신고 나갈까"

한국어 메모: 우리는 이걸 "신발 카드 캐러셀 + 수명 링"으로 풀었다. 이 프롬프트엔 그 해법을 넣지 않았다.

```
SCREEN: the first screen after opening the app.

WHAT THE PERSON IS DOING
They are about to go for a run, or thinking about whether to. Within seconds they need to answer
two questions: "which pair am I wearing today?" and "how much life is left in it?" — and then start
running with as little friction as possible. Most sessions end with them starting a run from here.

DATA AVAILABLE
- Their shoes (usually 1–4 pairs). Each has: brand, model name, distance run so far, the distance at
  which it should be replaced, a wear state (fresh / fine / consider replacing / replace now), and an
  estimated replacement date such as "약 5주 후".
- One shoe is currently selected as "today's pair".
- This week: distance run, an optional weekly goal, which days of the week they ran, number of runs,
  average pace, and a training-load status (light / steady / rising / spiking).
- Occasionally, one urgent piece of advice, e.g. that the selected pair is worn out and they should
  switch before they get hurt.

SUCCESS LOOKS LIKE
A person can open this and be running in three seconds. The wear state of the chosen shoe is felt
before it is read. Nothing on this screen is decoration.

Give me several structurally different answers — not one layout with color variations.
```

---

## 4. 러닝 시작 전 — "오늘은 뭘 목표로 달릴까"

```
SCREEN: the moment between deciding to run and starting to run.

WHAT THE PERSON IS DOING
Choosing what today's run is: a distance, a duration, a target pace, or laps on a track — or nothing
at all, just running freely. Optionally they also pick an intensity guide by heart-rate zone.
They then start. This screen is used standing outside, often in the cold, one-handed.

DATA AVAILABLE
- Goal type: distance / time / pace plan / track laps / free.
- For distance: any value, with common choices being 3km, 5km, 10km, half (21.1km), full (42.2km).
- For a pace plan: a target average pace, whether the run should be even or progressively faster,
  and optionally a per-kilometer breakdown.
- For track: the length of one lap (200m, 300m, 400m, or custom).
- An optional heart-rate zone target (off, zone 2, 3, or 4), which most people leave off.
- An estimate of how long the run will take and roughly how many calories it burns.

SUCCESS LOOKS LIKE
It reads as ONE decision, not a form. Someone who always runs freely should be able to press start
immediately; someone who wants a precise 21.1km should reach it in two taps. Advanced options exist
without cluttering the default path.
```

---

## 5. 러닝 중 — "달리면서 흘끗 본다"

한국어 메모: 우리 앱의 불가침 화면. 그래도 **다르게 푸는 방법이 정말 없는지**는 한 번 보고 싶은 자리다.

```
SCREEN: displayed while the person is actually running, outdoors, in daylight or darkness.

WHAT THE PERSON IS DOING
Running. They glance at the screen for well under a second, at arm's length, while moving, possibly
sweating, possibly in the rain. Then they put the phone away. They may pause, and later resume or finish.

DATA AVAILABLE
- Elapsed time, distance so far, current pace, average pace, heart rate and its zone, calories,
  elevation gained, cadence.
- Progress toward today's goal, if one was set.
- On a track, the lap count and the time of recent laps.
- Occasionally a problem worth surfacing: weak GPS, or location permission revoked mid-run.
- When paused: the route travelled so far can be shown on a map.

SUCCESS LOOKS LIKE
The single most important number is legible in a glance from arm's length, in sunlight. The screen
does not ask the runner to think. Whatever is not essential while moving is deferred to the pause
state or to the summary afterwards. Pausing and finishing must be impossible to trigger by accident.

Show a running state and a paused state. Question how many numbers actually deserve to be there.
```

---

## 6. 러닝 직후 — "방금 뭘 했는지"

```
SCREEN: shown the instant a run ends.

WHAT THE PERSON IS DOING
Catching their breath. Feeling something about what they just did. Deciding whether to keep it,
share it, or add a photo and a note. This is the emotional peak of the app.

DATA AVAILABLE
- Distance, duration, average pace, heart rate and zones, calories, cadence, elevation.
- Per-kilometer splits, including which kilometer was fastest, and the route on a map.
- Whether a goal was met, and whether any personal record was broken.
- How much life this run consumed from the shoe they wore ("+5.0km, 남은 내구도 68%").
- How this run affects their training load for the week.
- Sometimes a guess that this was an organized race, offering to archive the medal and official time.
- They may attach one photo and one short line of text.

SUCCESS LOOKS LIKE
It celebrates without being childish — no confetti, no cartoon trophies. The achievement is carried
by typography and restraint. Someone would want to screenshot this and send it to a friend.
```

---

## 7. 신발 — "이 신발, 얼마나 남았나"

한국어 메모: 이 앱의 존재 이유. 여기서 새 아이디어가 나오면 제품 전체가 바뀔 수 있다.

```
TWO SCREENS: a list of the person's running shoes, and the detail view of one pair.

WHAT THE PERSON IS DOING
Understanding the state of their gear, and deciding when to buy the next pair. Shoes are expensive
and running on dead ones causes injury, so this is a real decision with money and health attached.
They also rotate between pairs, and eventually retire one.

DATA AVAILABLE (per shoe)
- Brand, model, category (daily trainer, carbon racer, trail, stability, cushioned).
- Distance run so far, the distance at which replacement is recommended, and therefore how much life
  remains — expressible as remaining distance, a percentage, or a state word
  (최상 / 양호 / 교체 고려 / 교체 권장).
- An estimated replacement date and a confidence level for that estimate.
- How many runs, total time, average pace, longest run, weekly average with this pair.
- What share of their recent running this pair carried ("최근 4주 러닝의 68%").
- How long it has been sitting unworn, and whether their rotation is unbalanced.
- Whether it has reached the end of its life, in which case the person may retire it and keep a
  memento of the pair's whole story.

SUCCESS LOOKS LIKE
Remaining life is understood without reading a number. The list answers "what should I wear today"
and "what should I buy next" without any advertising tone. Retirement feels like a send-off, not
a delete action.

Explore how wear itself could be expressed — it does not have to be a bar or a ring or a percentage.
```

---

## 8. 기록 — "쌓인 것을 본다"

```
SCREEN: the history of everything they have run.

WHAT THE PERSON IS DOING
Looking back over a week, a month, a year, or everything: how much did I run, how consistently, was
I getting faster. Occasionally opening one run to study it in detail, or adding a run they forgot
to record.

DATA AVAILABLE
- Every run: date, distance, duration, average pace, the shoe worn, heart rate and zones, splits,
  elevation, route, and optionally a photo and a note.
- Aggregates for any period: total distance, number of runs, average pace, total time, and the
  distribution across days, weeks, months, or years.
- Personal records by distance.

SUCCESS LOOKS LIKE
The shape of their training is visible before any number is read. Scanning a long list is pleasant
rather than exhausting, and it never turns into a social feed.
```

---

## 9. 구조를 흔드는 프롬프트 (한 줄씩 덧붙여 실험)

한국어 메모: 위 화면 프롬프트 끝에 붙이면 완전히 다른 답이 나온다. 채택 안 해도 발상이 남는다.

```
- Solve this without a bottom tab bar.
- Solve this without any cards or panels — only type, rules, and space.
- Express progress without a ring and without a bar.
- Make the shoe, not the run, the largest object on every screen.
- Use a light or high-contrast scheme instead of dark, and make it feel more premium, not less.
- Reduce the home screen to a single sentence and a single action.
- Design it as if it were a physical instrument panel rather than an app.
- Assume the person only ever looks at this app for four seconds at a time.
- Design the version that a 55-year-old runner with weaker eyesight would prefer.
- Make wear feel like a material that ages (texture, erosion, patina) rather than a measurement.
```

---

## 10. 결과를 다룰 때 (민우님용)

- 여기서 나온 시안은 **정합성 검사를 통과할 필요가 없습니다.** 지금은 발상을 넓히는 단계라, 우리 규칙과
  충돌해도 일단 모아 두면 됩니다.
- 마음에 드는 방향이 잡히면 그때 `variant-redesign-prompts.md` 쪽으로 넘어가, 그 방향을 **우리 데이터·카피에
  맞춰 정합**시키면 됩니다(그 문서 §15 체크리스트가 그 역할).
- 채택 판단은 "예쁜가"가 아니라 **"3초 안에 신발 상태가 읽히는가 / 달리면서 흘끗 봐도 읽히는가"** 로 하시면
  됩니다. 이 앱의 두 진짜 시험대입니다.
