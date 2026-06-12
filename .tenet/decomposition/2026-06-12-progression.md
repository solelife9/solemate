# Decomposition: KEEGO Progression & Retirement Ecosystem

Feature `progression` · agile · per-slice decomposition (appended per slice fire).
Spec: `.tenet/spec/2026-06-12-progression.md`. eval_parallel_safe=false (progression-state tests run sequential; use `AsyncStorage.clear()` per test, never the leaky clearAllMockStorages).

Iron laws (every job): pure engine in `lib/progression/*` (no input mutation, NaN/neg/missing→0, no throw); only new key `progression_v1` (never touch run/shoe/challenge/settings keys); no new native module / no android·ios change; tier colors only from `theme.ts` `TIER_COLORS`; no fabricated unlocks; `tsc --noEmit`+`eslint`+`jest` green; behavior tests (react-test-renderer) for interactive UI; Korean copy; commit in Korean to main.

## Slice A: Progression engine + surface

```
slice-a-foundation ──┬─→ slice-a-rank ────────┐
 (types+TIER_COLORS+  │                          │
  storage+context)    ├─→ slice-a-titles ───────┤
                      │                          ├─→ slice-a-engine ─→ slice-a-ui ─→ slice-a-e2e
                      └─→ slice-a-achievements ──┘                                   (report_only)
```

- **slice-a-foundation** (dev, deps: none): `lib/progression/types.ts` (all domain types incl. RankTier, RankResult, PillarScores, TitleDef/EarnedTitle, AchievementDef, RetirementSummary stub, RankingProvider interface); add `TIER_COLORS` map to `theme.ts` (Bronze #CD7F32 … Legend #FF6500); `lib/progression/storage.ts` (load/save `progression_v1` with safe defaults, corrupt→default, never throw, never touch other keys); `lib/progression/context.ts` (`buildContext(runs, shoes, earned, challenges, now)` → ProgressionContext of pre-aggregated facts: cumulativeKm, runCount, perShoe stats, streaks via lib/stats, time-of-day buckets, etc., reusing lib/records·rotation·wearModel). Unit tests for storage (incl. corrupt JSON) + context aggregation.
- **slice-a-rank** (dev, deps: foundation): `lib/progression/rank.ts` `computeRank(ctx)`→RankResult (weighted 6-pillar formula + cutoffs per spec, memoizable, pure). Tests: boundary tiers + color, distance-not-sole-driver, empty→bronze/0, NaN clamp, **synthetic ~1000-user population distribution within ±6pp**, **perf <50ms for 1000 runs/30 shoes**.
- **slice-a-titles** (dev, deps: foundation): `lib/progression/titles.ts` — all category ladders verbatim (running 1st/100/500/1000/5000/10000/25000km; shoeManagement 1/3/5/10 + time-based mgmt≥0.9 windows; rotation/injury/consistency time-based; trainingStyle Tempo/Long/Recovery/Race) + hidden (Early Bird<05:00 ×20, Night Runner>22:00 ×20, Comeback 30d gap, Long Relationship shoe>365d; Rain Runner OMITTED documented) + equip helpers (one equipped). Tests: each threshold unlock, idempotent, equip-one, hidden criteria.
- **slice-a-achievements** (dev, deps: foundation): `lib/progression/achievements.ts` — achievement defs across pillars with `progress(ctx)→{current,target}`, rarity, points (Bronze10…Legend1000), `unlocked(ctx)`; `points.ts` total. Achievements unlock titles + feed rank engagement pillar. Tests: progress values, points by rarity, no-unlock-without-criterion (anti-fabrication).
- **slice-a-engine** (dev, deps: rank,titles,achievements): `lib/progression/index.ts` selectors composing rank+titles+achievements+points from runs/shoes; idempotent unlock-notice diff (returns newly-unlocked keys not in `seenUnlocks`, then records them); `lib/progression/ranking.ts` RankingProvider local stub (`{kind:'local', available:false}`, no fake competitors). Tests: end-to-end selector on seeded data, unlock-notice fires once.
- **slice-a-ui** (dev, deps: engine): `ProgressionScreen.rn.tsx` (rank chip w/ tier color+ring, equipped title next to nickname, stat row [total dist/registered/retired/streak], title gallery locked+unlocked by category, achievement progress bars, points total) + equip interaction + unlock toast; add entry point (tab or Profile section) wiring from App/Profile using existing primitives + tokens. Behavior tests (react-test-renderer): equip press → state+persist, rank chip color reflects tier, achievement bar reflects data, gallery renders. Use `AsyncStorage.clear()` per test.
- **slice-a-e2e** (integration_test, report_only, deps: ui): run @slice-a acceptance (full `jest` + `tsc --noEmit` + `eslint`); report pass/fail; on blocking finding use tenet_report_blocking_finding (no file edits). ✅ DONE.

## Slice B: Shoe Retirement (signature)

Depends on slice-a-e2e. Reuses Slice A engine (achievements/titles/storage) + existing retire path (lib/shoe shoeHealth retire / apiPatchShoe) + existing svg→toDataURL share-card infra (slice-4 share-card / slice-8 recap-ui). Retirement keepsake records are ADDITIVE in `progression_v1.retiredShoes` — the flow calls the EXISTING shoe-retire path (don't reimplement, no data destruction) and additionally captures the summary.

```
slice-b-retirement-logic ──┬─→ slice-b-retire-achievements ──┐
                            └─→ slice-b-card ─────────────────┴─→ slice-b-ui ─→ slice-b-e2e (report_only)
```

- **slice-b-retirement-logic** (dev, deps: slice-a-e2e): `lib/progression/retirement.ts` — `buildRetirementSummary(shoe, runs, ctx)` → RetirementSummary (total distance, run count, total time, avg+best pace, longest run, first/last run date, usage period) using ONLY that shoe's real runs (reuse lib/records); real-achievement highlights (only completed ones, no fabrication) + Most Memorable Moment selection (single strongest real highlight). `lib/progression/retirementGrade.ts` — `gradeRetirement(usedKm, recommendedKm, summary, ctx)` → RetirementGrade: Perfect ±5%, Smart ±10%, Good within recommended range, Standard otherwise, Hall-of-Fame on special criteria (great mgmt + a real PB + healthy lifecycle). Persist a RetiredShoeRecord into `progression_v1.retiredShoes` (additive; local-first; never mutate run/shoe). Pure + tests (grade boundaries ±5/±10, real-only highlights, no fabrication, persistence isolation).
- **slice-b-retire-achievements** (dev, deps: retirement-logic): extend achievements/titles with retirement ones — achievements First Retirement / Shoe Curator (5 retired) / Hall of Shoes (10 retired) / Smart Replacement (a Smart-or-better grade) / Perfect Timing (a Perfect grade); retirement titles (Shoe Care Starter … Keep Going) driven by retiredShoes count + grades. Wire into Slice A evaluate functions + engagement pillar. Tests at thresholds; no fabrication.
- **slice-b-card** (dev, deps: retirement-logic): `lib/progression/retirementCard.ts` — card view model + an svg renderer component supporting all 4 layouts (A Nike / B Modern / C Apple[default] / D Hall-of-Fame) from one RetirementSummary + grade + equipped title (subtle), reusing the existing share-card svg→PNG dataURL infra. Sharing: Save Image (offline, always works) + OS Share sheet (story/feed/link; no crash if a target app absent). react-test-renderer tests: each format renders from summary; default=C; grade badge shows; equipped title subtle; share handlers called.
- **slice-b-ui** (dev, deps: card, retire-achievements): retirement trigger in shoe detail (ShoesScreen) — at/over recommended lifespan show [계속 사용]/[은퇴] (never auto-retire); 3-step flow (확인 → 여정 요약 → 하이라이트) using real summary; card preview with format switch + share; **Hall of Shoes** museum screen/section listing retired shoes (km + retire year, persists, never disappears). Calls the EXISTING retire path to actually retire + records keepsake. Behavior tests (press 은퇴 → existing retire called + record persisted, never auto-retires, Hall of Shoes renders retired shoes, no run/shoe mutation). Tokens+primitives only; Korean; premium not-sad tone.
- **slice-b-e2e** (integration_test, report_only, deps: ui): run @slice-b acceptance (tsc/lint/jest); verify grades, real-only highlights/summary, user-controlled retire, Hall of Shoes persistence, card+share, retirement achievements/titles, no data destruction. Report only. ✅ DONE.

## Slice C: Challenges expansion

Depends on slice-b-e2e. Builds on existing `lib/challenges.ts` (distance/streak) + `lib/rotation` + `lib/wearModel` + existing `ChallengesSection.tsx`. Completed challenges feed the engagement pillar (Slice A rank). Additive only; no data destruction.

```
slice-c-challenges-logic ──→ slice-c-ui ──→ slice-c-e2e (report_only)
```

- **slice-c-challenges-logic** (dev, deps: slice-b-e2e): `lib/progression/challengesExt.ts` — new challenge kinds on top of `lib/challenges`: monthly (this-month distance or run-count), shoe (km with a specific/new shoe), rotation (use ≥N distinct shoes this week / no single shoe exceeds X% of week's km), smart (PERSONALIZED, deterministic — from rotation/wear: detect an over-used active shoe → recommend mileage on the least-used active shoe, with a transparent Korean reason string). Pure `challengeExtProgress(challenge, runs, shoes, now)` reusing existing helpers; `generateSmartChallenge(runs, shoes, now)` deterministic + reason; never fabricates. Tests: monthly window correctness, shoe filter, rotation balance, smart personalization + reason + determinism, completion feeds engagement.
- **slice-c-ui** (dev, deps: challenges-logic): surface the new challenge kinds in the existing ChallengesSection (or Progression surface) — monthly/shoe/rotation cards with progress + a smart-challenge card showing its transparent reason; allow accepting the smart suggestion. Tokens+primitives, Korean. Behavior tests (render each kind, progress reflects data, smart reason shown, accept handler). No run/shoe mutation.
- **slice-c-e2e** (integration_test, report_only, deps: ui): @slice-c acceptance sweep (tsc/lint/jest); verify monthly/shoe/rotation/smart progress correct, smart personalized+transparent, completion feeds engagement, no data destruction, no native. Report only. ✅ DONE.

## Slice D: Home integration

Depends on slice-c-e2e. Surfaces progression on Home (HomeScreen.rn.tsx) naturally, keeping the shoe-first hero/carousel intact. Reuses Slice A `getProgression` + challengesExt. Final slice of this run (E/F deferred to separate backend run).

```
slice-d-home ──→ slice-d-e2e (report_only)
```

- **slice-d-home** (dev, deps: slice-c-e2e): add a compact progression strip to HomeScreen — rank chip (tier color from TIER_COLORS), equipped title next to nickname, current challenge progress (one active challenge, Ring/bar), and most-recent unlocked achievement. Wire App.tsx to pass the progression view (getProgression result) + active challenge + recent achievement into HomeScreen (read-only; no run/shoe mutation; don't disturb the existing hero carousel or the just-committed usage% row or onboarding/boot). Tap a chip to open ProgressionScreen (reuse existing onOpenProgression). Tokens+primitives, Korean, premium. Behavior tests (rank chip color = TIER_COLORS[tier], equipped title renders, challenge progress reflects data, recent achievement renders, tap opens progression; hero shoe-first preserved). ✅ DONE — HomeScreen `ProgressionStrip`(랭크 칩+활성 챌린지 바+최근 업적)+장착 타이틀 칩; App `homeProgression`(getProgression+challengeProgress/challengeExtProgress 읽기 전용 파생)·`onOpenProgression` 배선; `__tests__/HomeScreen.progression.test.tsx`(8 tests). tsc/eslint(0 errors)/jest(1175) green.
- **slice-d-e2e** (integration_test, report_only, deps: home): @slice-d acceptance sweep (tsc/lint/jest); verify Home surfaces rank/title/challenge/achievement, hero unchanged, no data destruction, no native. Report only.

## Deferred (separate backend Tenet run in solelife-backend)
- **Slice E** (app): live ranking client wired to backend + Hall of Fame UI.
- **Slice F** (backend): Multi-User Backend v1 (Express + SQLite + persistent disk + Firebase ID-token + server-side recompute + 6-category leaderboards). Needs Firebase Admin creds + Render deploy (user actions).
