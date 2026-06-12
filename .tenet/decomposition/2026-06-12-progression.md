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
- **slice-a-e2e** (integration_test, report_only, deps: ui): run @slice-a acceptance (full `jest` + `tsc --noEmit` + `eslint`); report pass/fail; on blocking finding use tenet_report_blocking_finding (no file edits).
