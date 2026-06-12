---
delivery_mode: agile
---

# Spec: KEEGO Progression & Retirement Ecosystem

> Feature slug: `progression` · Date: 2026-06-12 · Mode: Full / agile
> Interview: `.tenet/interview/2026-06-12-progression.md` (clarity 0.83 PASSED)
> Source briefs: 5 user directives (Progression Ecosystem, Shoe Retirement, Rank & Title System, Multi-User Backend v1, overnight authorization) — recorded as Tenet steers 2026-06-12.

## Purpose

Turn Keego from a shoe-tracker into a **running-shoe lifecycle + runner-growth platform**. Build a premium, local-first progression ecosystem that rewards multiple dimensions of being a great runner — distance, consistency, shoe management, rotation, injury prevention — not just mileage, plus a signature **Shoe Retirement** experience that celebrates the full life of a running shoe. Reinforces the shoe-first differentiator; tone is premium/collectible (Apple Fitness · WHOOP · PS Trophies · Spotify Wrapped), never childish/meme/RPG.

## Scope of THIS run (agile slices A–D, app repo only)

All slices are **local-first, NO new native modules, NO backend dependency** → fully verifiable via `tsc --noEmit` + `eslint` + `jest`. The cross-user Hall of Fame / leaderboards are built behind a local-only provider seam in this run; the networked backend (slice F) and live ranking client (slice E) are a **separate Tenet run** rooted in `C:\Users\user\solelife-backend` (out of scope here, see Out of Scope).

## Tech Stack (confirmed, pinned)

- React Native `0.85.3`, React `19.2.3`, TypeScript `~6.0.3` (strict).
- `react-native-svg ^15.15.4` — rank rings, tier chips, retirement card rendering + share image (svg → PNG dataURL, reusing existing share-card infra).
- `@react-native-async-storage/async-storage ^3.1.1` — persistence (new isolated keys).
- `@react-native-firebase/{app,auth,firestore} 24.0.0` — OPTIONAL cloud-sync mirror of progression state into the existing per-uid `userBackups` doc (best-effort, never blocking). No new Firebase product.
- Test: `jest ^29.6.3`, `react-test-renderer 19.2.3`. Node ≥ 22.11.
- **No new native dependency for A–D.** All pure JS/TS + existing RN libs.

### Reused existing modules (do not duplicate)
`lib/challenges.ts` (distance/streak progress), `lib/records.ts` (personal records + streak), `lib/rotation.ts` (rotation ranking + lastWorn), `lib/wearModel.ts` (effective wear), `lib/replacementForecast.ts` (time-windowed agg + confidence), `lib/injury.ts` (threshold→tier), `lib/stats.ts` (`maxDayStreak`, bucketing), `lib/goals.ts`, `lib/shoe.ts` (`shoeHealth`, retire), `lib/share-card`/recap svg infra, `lib/devSeed.ts`. Data shapes: `BackendRun` / `BackendShoe` (`types.d.ts`), UI `Run`/`Shoe` (`theme.ts`). Identity: `profile_name` AsyncStorage key.

## Domain model (new pure types — `lib/progression/types.ts`)

- `RankTier = 'bronze'|'silver'|'gold'|'platinum'|'diamond'|'master'|'legend'`
- `RankResult = { score: number /*0..100*/, tier: RankTier, color: string, pillars: PillarScores }`
- `PillarScores = { running, consistency, shoeManagement, rotation, injuryPrevention, engagement }` (each 0..1)
- `TitleCategory = 'running'|'consistency'|'shoeManagement'|'rotation'|'injuryPrevention'|'trainingStyle'|'hidden'|'retirement'`
- `TitleDef = { key, name, category, tier: RankTier, hidden?: boolean, criterion: (ctx) => boolean }`
- `AchievementDef = { key, name, category, rarity: RankTier, points: number, progress: (ctx)=>{current,target}, unlocked: (ctx)=>boolean }`
- `EarnedTitle = { key, unlockedAt: string, isEquipped: boolean }`
- `RetirementSummary` / `RetirementGrade = 'standard'|'good'|'smart'|'perfect'|'hallOfFame'`
- `RankingProvider` interface (seam): `getLeaderboard(category, yearMonth) / getMyRanking(...)` → returns local-only `{ kind: 'local', me: {...}, available: false }` placeholder now.

### Rank tier colors (AUTHORITATIVE — add to `theme.ts` as `TIER_COLORS`)
| Tier | Color |
|------|-------|
| Bronze | `#CD7F32` |
| Silver | `#C0C0C0` |
| Gold | `#FFD700` |
| Platinum | `#14B8A6` |
| Diamond | `#3B82F6` |
| Master | `#9333EA` |
| Legend | `#FF6500` (KEEGO orange) |

### Progress points (per unlocked achievement, by rarity)
Bronze 10 · Silver 25 · Gold 50 · Platinum 100 · Diamond 250 · Master 500 · Legend 1000. Points feed the engagement pillar and are displayed; they are NOT an RPG level.

### Composite Rank formula (`lib/progression/rank.ts`)
`score = 100 × (0.25·running + 0.20·consistency + 0.20·shoeManagement + 0.15·rotation + 0.10·injuryPrevention + 0.10·engagement)`, each pillar normalized 0..1 (running/distance log-scaled to saturate so distance is never the sole driver). Tier cutoffs: Bronze `<25`, Silver `25–44`, Gold `45–61`, Platinum `62–77`, Diamond `78–89`, Master `90–96`, Legend `≥97`. Validated by a synthetic-population jest test within ±6pp of targets (Bronze 35 / Silver 25 / Gold 18 / Platinum 12 / Diamond 7 / Master 2.5 / Legend 0.5 %). Pure, memoized, NaN/negative/missing → 0, no input mutation.

## Persistence (new isolated AsyncStorage keys — never touch existing run/shoe keys)
- `progression_v1` — `{ earnedTitles: EarnedTitle[], equippedTitleKey: string|null, seenUnlocks: string[], retiredShoes: RetiredShoeRecord[], points: number }`
- Progression state is **derived-then-cached**: titles/achievements/rank are recomputed from runs+shoes (source of truth) on change; only user choices (equipped title) + retirement records + already-notified unlock keys are authoritative persisted state. Retirement records persist locally-first (like `runPersistence`), cloud-sync best-effort. Corrupt/missing → safe defaults, never throw.

## Design Direction
Dark `#0A0A0A` + KEEGO orange `#FF6500`, Pretendard (single family), tabular numerals — consistent with the shipped Slice-3 design system. New: `TIER_COLORS` chips/rings; premium retirement cards. Mockups in `.tenet/visuals/2026-06-12-*` (4 retirement card formats A/B/C/D + Progression/Profile + Hall of Shoes). **Adopted retirement card default = Format C (Apple/Korean, emotional-proud) + Smart-Grade badge; renderer supports all 4 layouts. Final pick confirmed at morning review.** Visual primitives live in `primitives.tsx`; tokens only from `theme.ts`.

## API Endpoints
None in this run (local-first). The deferred backend (slice F, separate run) will add `/users/me`, `/stats/me/monthly`, `/achievements/me`, `/titles/equip`, `/challenges/me`, `/leaderboards/:category` against the existing Express+SQLite `solelife-backend`. Documented here for the seam contract only.

## Database Schema
None added in this run. `RankingProvider` seam defines the future `LeaderboardEntry` shape (uid, yearMonth, category, rank, score, nickname, rankTier, rankColor, equippedTitle) so the backend run can implement it without app rework.

## Auth Flow
Unchanged. Progression is per-local-user (existing `profile_name` / device identity). Optional Firebase login still drives best-effort cloud-sync of `progression_v1` into the per-uid `userBackups` doc (mirrors existing `cloudSync`). No new auth.

## Success Criteria (measurable, testable)
1. `computeRank(runs, shoes, achievements, challenges)` returns the correct tier+color for boundary scores; synthetic-population distribution within ±6pp of targets; empty input → Bronze, score 0, no throw.
2. Title ladders unlock at exactly the specified thresholds (Running first-run/100/500/1000/5000/10000/25000 km; Shoe Mgmt 1/3/5/10 shoes + time-based; Rotation/Injury/Consistency/Training-Style per brief; hidden titles per brief except Rain Runner). Unlock is idempotent; a unlock notice fires once (recorded in `seenUnlocks`), not on every recompute.
3. Equipping a title persists and displays next to nickname on Profile and (subtly) on retirement cards; only one title equipped at a time.
4. Achievements show live progress (current/target) and grant the rarity-correct points; total points displayed; no achievement unlocks without its real criterion met (no fabrication).
5. Retirement: a shoe at/over recommended lifespan offers Continue/Retire (never forced). Retiring runs the 3-step flow with REAL aggregates (distance, runs, time, avg/best pace, longest run, first/last run date) and REAL completed-achievement highlights only.
6. Smart Retirement Grade computed from closeness to recommended lifespan: Perfect ±5%, Smart ±10%, Good within range, Standard otherwise, Hall-of-Fame on special criteria (great mgmt + PB + healthy lifecycle). Correct grade → correct card styling + `Perfect Timing`/`Smart Replacement` achievements.
7. A retired shoe appears in **Hall of Shoes** with km + retire year, persists across reloads, never disappears; retirement card is generatable and shareable (Save Image works offline; OS Share sheet for story/feed/link; no crash if a target app is absent).
8. Challenges expansion: monthly/shoe/rotation/smart challenges compute correct progress on `lib/challenges`; smart challenge is personalized from rotation/wear data with a transparent reason.
9. Home surfaces equipped title, current challenge progress, most recent achievement, and the rank chip (correct tier color).
10. Engine full recompute over 1000 runs / 30 shoes < 50 ms (perf-budget test); share image < 2 s.
11. Gates: `tsc --noEmit`, `eslint`, `jest` all green; no existing run/shoe data mutated; no new native module; no secrets.

## Out of Scope (this run)
- **Cross-user Hall of Fame / leaderboards / ranking / nearby-ranking / top-percentage** (needs multi-user backend) → **separate Tenet run (slice F)** in `solelife-backend` (Express + extend existing SQLite + Render persistent disk + Firebase ID-token middleware + server-side score recompute) and **slice E** (app ranking client wired to F + live Hall of Fame UI). This run ships only the local-only provider seam + "coming soon / personal" UI state. No fabricated competitors.
- **Rain Runner** hidden title (weather not tracked) — omitted v1, documented.
- Native renames / iOS build / new native deps.
- Real-population rank recalibration (post-launch backend task).

## Slice plan

Total slices: 4 (this run) + 2 deferred (separate backend run).

### Slice A: Progression engine + surface
- **Adds**: composite Rank (Bronze→Legend + tier colors), Titles (all category ladders + hidden, equip one), Achievements (progress + rarity points), Progress Points. A Progression/Profile surface showing rank chip, equipped title, title gallery, achievement progress, points.
- **Bundled with**: `lib/progression/{types,rank,titles,achievements,points,context}.ts` pure engine; `TIER_COLORS` theme tokens; `progression_v1` storage; unlock-notice (idempotent toast); ranking provider seam (local stub).
- **User can**: open Progression, see their rank + tier color, browse/equip a title, watch achievements progress, see points.
- **Out of slice**: retirement, challenge expansion, home surfacing, live leaderboards.

### Slice B: Shoe Retirement (signature)
- **Adds**: retirement trigger (Continue/Retire at lifespan), 3-step flow (confirm → journey summary → real highlights), Smart Retirement Grades, Most Memorable Moment, Retirement Card renderer (4 formats, default C) + sharing, Hall of Shoes museum, retirement achievements + titles.
- **Bundled with**: `lib/progression/{retirement,retirementGrade,retirementCard}.ts`; reuse share-card svg infra; retirement records in `progression_v1`; wire into existing shoe detail + retire path (no data destruction).
- **User can**: retire an eligible shoe, view/save/share a premium card, revisit retired shoes in Hall of Shoes, earn retirement achievements/titles.
- **Out of slice**: challenge expansion, home surfacing.

### Slice C: Challenges expansion
- **Adds**: monthly / shoe / rotation / smart (personalized) challenges on top of existing `lib/challenges`, with transparent reasons and progress.
- **Bundled with**: `lib/progression/challengesExt.ts`; UI in the existing ChallengesSection/Progression surface; feed completed challenges into engagement pillar + achievements.
- **User can**: see and progress through varied challenges, including a personalized smart challenge tied to their shoe rotation.
- **Out of slice**: home surfacing.

### Slice D: Home integration
- **Adds**: surface equipped title, current challenge progress, most recent achievement, and rank chip naturally on Home.
- **Bundled with**: HomeScreen wiring (resolve in-flight `usage%` tweak first); reuse engine selectors; keep hero shoe-first.
- **User can**: see their progression at a glance on Home without opening a separate tab.
- **Out of slice**: live cross-user ranking (deferred E/F).

### Slice E (DEFERRED → separate backend run): live ranking client + Hall of Fame UI
- Wires the app ranking provider to the deployed backend; real leaderboards, nearby ranking, top-percentage.

### Slice F (DEFERRED → separate Tenet run in `solelife-backend`): Multi-User Backend v1
- Node/Express clean refactor; extend SQLite + Render persistent disk; UserProfile/MonthlyStats/Achievement/Title/ChallengeProgress/LeaderboardEntry; full API; Firebase ID-token middleware; server-side score recompute (never trust client scores); 6-category leaderboards + Hall of Fame. Needs Firebase Admin credentials + Render deploy (user actions).
