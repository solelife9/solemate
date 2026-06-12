# Scenarios: KEEGO Progression & Retirement Ecosystem

Feature: `progression` · 2026-06-12. Tests tagged by slice (`@slice-a` … `@slice-d`). All pure-logic scenarios are jest unit tests; UI scenarios use react-test-renderer (props-driven, no network).

## Scenarios (Success)

### @slice-a — Engine
1. **Rank tier from score.** Given runs/shoes/achievements yielding composite score 80, `computeRank` returns tier `diamond` with color `#3B82F6`. Boundary scores (24→bronze, 25→silver, 62→platinum, 97→legend) map correctly.
2. **Distribution calibration.** Given a documented synthetic population of ~1000 users, each rank band's share is within ±6pp of targets (Bronze 35 / … / Legend 0.5 %).
3. **Title unlock at threshold.** A user whose cumulative distance crosses 100 km unlocks `running_100k` ("100km Club", silver). First completed run unlocks `running_beginner` (bronze).
4. **Equip one title.** Equipping title B while title A is equipped leaves only B equipped; `progression_v1.equippedTitleKey === B`; persists across reload.
5. **Achievement progress + points.** An achievement with target 500 km shows `{current: 348, target: 500}`; on reaching 500 it unlocks and adds its rarity points to the total.
6. **Idempotent unlock notice.** Re-running the engine after an unlock does NOT re-fire the unlock notice (key present in `seenUnlocks`).
7. **Empty/edge input.** Empty runs+shoes → rank bronze, score 0, no titles equipped, no crash; NaN/negative fields are clamped to 0.

### @slice-b — Retirement
8. **Trigger is optional.** A shoe at 512/500 km surfaces "Continue / Retire"; choosing Continue leaves the shoe active and unchanged.
9. **Journey summary is real.** Retiring produces total distance, run count, total time, avg + best pace, longest run, first/last run date — all matching the shoe's actual runs (no fabricated values).
10. **Highlights only real.** The highlights list contains only achievements the user actually completed with that shoe; a user with no PB shows no "Personal Best" highlight.
11. **Grade from closeness.** Retiring at 512/500 (+2.4%) → grade `perfect` (±5%); at 540/500 (+8%) → `smart` (±10%); correct card styling token applied; `Perfect Timing` / `Smart Replacement` achievement unlocks accordingly.
12. **Hall of Shoes persistence.** A retired shoe appears in Hall of Shoes with km + retire year and is still there after app reload; it never disappears from history.
13. **Card render + share.** The retirement card renders all four layouts from one summary (default C); Save Image succeeds offline; sharing opens the OS share sheet and does not crash when a target app is absent.
14. **Equipped title on card.** When a title is equipped, it renders subtly on the retirement card near the KEEGO wordmark.

### @slice-c — Challenges
15. **Monthly challenge progress.** A "run 100 km this month" challenge sums only this-month runs and completes at ≥100.
16. **Shoe challenge.** "Run 50 km with <new shoe>" counts only that shoe's runs.
17. **Smart challenge personalization.** Given over-use of shoe X, the smart challenge recommends mileage on the least-used active shoe with a transparent reason; completing a challenge feeds the engagement pillar.

### @slice-d — Home
18. **Home surfacing.** Home renders the rank chip (correct tier color), equipped title, current challenge progress, and most recent achievement, while keeping the shoe-first hero.

## Anti-Scenarios (Failure to prevent)
1. **No fabricated milestones.** The engine never reports an achievement/title/highlight whose real criterion is unmet (e.g., a "Marathon Finish" highlight for a user with no ≥42 km run).
2. **Distance is not the sole driver.** A user with huge mileage but zero rotation/management does NOT reach Legend; pillar weighting caps single-dimension dominance.
3. **No data destruction.** Retiring a shoe or writing progression state never deletes/mutates existing run or shoe records; existing AsyncStorage keys are untouched.
4. **No forced retirement.** A shoe reaching lifespan is never auto-retired; the user must choose Retire.
5. **No fake competitors.** The Hall of Fame / ranking surface never shows invented other-user data; with no backend it shows a personal / "coming soon" state only.
6. **No crash on missing share target / corrupt state.** Absent IG/Threads/X/Kakao app, empty history, or corrupt `progression_v1` must not crash — safe fallback.
7. **No native/secret drift.** No new native module, no `android/`/`ios/` change, no hardcoded secret; `tsc`/`lint`/`jest` stay green.
8. **No double unlock spam.** Recomputing the engine does not re-notify already-earned unlocks.
