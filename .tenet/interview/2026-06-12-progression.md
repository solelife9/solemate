# Interview: KEEGO Progression & Retirement Ecosystem

Date: 2026-06-12
Mode: Full
Rounds: 2
Feature slug: progression

## Clarity Score (independent validation, 3rd pass — PASSED)
- Goal: 0.80 (weight 0.4)
- Constraints: 0.85 (weight 0.3)
- Success criteria: 0.85 (weight 0.3)
- **Total: 0.83 / 0.8 required — PASSED.** Residual gaps are morning-review taste items (adopted card format among the 4 mockups, equipped-title-on-card), agent-locked defaults under delegated authority (rank cutoffs, long-horizon thresholds), or explicitly out-of-scope (cross-user Hall of Fame → separate backend run). None block A–D implementation.

## Context

Brownfield React Native app **Keego** (dir C:\Users\user\SoleMate), a running-**shoe lifecycle management** platform (differentiator vs NRC/Strava/Garmin: shoe-first, durability/rotation/injury-prevention, "keep going"). Slices 1–8 of prior Tenet work complete (engine, shoe DB, design renewal, injury/rotation, Firebase, wear model + replacement forecast, monetization links, FCM/recap). The user now requests two large, related new epics in one initiative.

The user provided two extremely detailed feature briefs (recorded verbatim as Tenet directive steers on 2026-06-12):
- **Epic #1 — Progression Ecosystem**: Titles (5 progression tracks × 7 tiers Bronze→Legend + Hidden titles), Achievements (progress tracking, rarity, reward points), Challenges (Monthly/Shoe/Rotation/Smart personalized), Hall of Fame (7 community leaderboard categories), Progress Points (Bronze 10 … Legend 1000 → User Level / ranking), Ranking display (equipped title, nearby ranking). One equipped title shown next to nickname, on profile, HoF, rankings, challenge results. Surface naturally on Home. Tone: premium (Apple Fitness / PS Trophies / Xbox / WHOOP); no mobile-game gimmicks / childish badges / memes; do NOT copy NRC/Strava/Garmin.
- **Epic #2 — Shoe Retirement System**: Retirement trigger at recommended lifespan (user-controlled, never forced — Continue / Retire), 3-step flow (confirm → journey summary → highlights from real achievements only, no fabrication), Retirement Card 4 formats (A Nike-campaign / B Modern Premium / C Apple / D Hall of Fame), Smart Retirement Grades (Standard 🥉 / Good 🥈 / Smart 🥇 ±10% / Perfect 💎 ±5% / Hall of Fame 👑 by closeness to recommended lifespan), Most Memorable Moment, Sharing (save image / story / feed / link; optimized for IG story+feed, Threads, X, KakaoTalk), Hall of Shoes (personal museum of retired shoes, never disappear), Retirement Achievements (First Retirement / Shoe Curator 5 / Hall of Shoes 10 / Smart Replacement / Perfect Timing) + Retirement Titles. Tone: Apple launch / Nike storytelling / Spotify Wrapped / luxury — proud not sad, a premium keepsake (graduation certificate / framed achievement), subtle "KEEGO / Keep Going" branding. Differentiator: "the app that celebrates the full life of your running shoes."

The two epics **share a Titles + Achievements + Progress Points engine** (Shoe Master / KEEGO Master / Keep Going titles appear in both).

### Codebase scan (read-only) — feasibility
- Reusable pure libs: `lib/challenges.ts` (distance/streak progress), `lib/records.ts` (personal records + streak), `lib/rotation.ts` (rotation ranking), `lib/wearModel.ts` (multi-factor effective wear), `lib/replacementForecast.ts` (time-windowed aggregation + confidence), `lib/injury.ts` (threshold→tier), `lib/stats.ts`, `lib/goals.ts`.
- Data model: `BackendRun` (run_date, duration, cadence, heart_rate, location, source) and `BackendShoe` (max_km, purchase_date, total_km, retired) — persisted history with timestamps supports time-based criteria (streaks, periods). Run carries date/pace/distance/shoe.
- Persistence: AsyncStorage keys (`challenges_v1`, `profile_name`, `profile_photo`, `settings_*`, per-run `surface_<id>`/`splits_<id>`), REST `lib/api.ts` (per-user via device_id/user_id), Firestore `lib/cloudSync.ts` (per-uid `userBackups` doc).
- Identity: `profileName` (local, default '러너') + optional Firebase displayName — enough for "title next to nickname".
- Share infra: existing svg→toDataURL share card (slice-4 share-card, slice-8 recap-ui) — reuse for retirement cards.
- Retire: `shoeHealth` already supports retire/보관.
- Theme: dark `#0A0A0A` bg + orange `#FF6500` accent, Pretendard font; tier colors (Bronze..Legend) NOT yet defined.
- Tests: `__tests__/lib/*.test.ts` pure-fn tests, react-test-renderer for components, jest.setup native mocks.
- **Blocker**: NO multi-user backend aggregation. onrender REST is per-user; Firestore is per-uid. A real Global Hall of Fame / cross-user ranking ("#127 / Top 18%", other users' km) requires a NEW backend endpoint + privacy/opt-in framework — out of current architecture, not autonomously verifiable.

## Round 1

### Questions Asked
1. Global Hall of Fame / Ranking needs a multi-user backend that does not exist. How to proceed?
   > **보류·플러그인 설계 (Recommended).** Defer global ranking to a later phase. Build everything else local-first now (titles, achievements, challenges, progress points, retirement, Hall of Shoes). Design the ranking interface/data so a future backend can plug in without rework.

2. The two epics share a title/achievement engine. Build order?
   > **엔진 → 은퇴 → 챌린지 → 홈 (Recommended).** Foundation first (Titles + Achievements + Progress Points engine, 5 tracks), then Shoe Retirement (cards + Hall of Shoes, consuming the engine), then Challenges expansion, then Home integration last.

3. Retirement card formats A/B/C/D?
   > **4개 목업 만들고 체크포인트서 선택 (Recommended).** Generate HTML mockups of all 4 formats in the visuals phase; user picks the adopted format(s) at the plan-checkpoint.

4. Delivery mode (project is already agile)?
   > **Agile 슬라이스 (Recommended).** Sliced delivery with initial plan-checkpoint and a use-checkpoint after each slice.

### Decisions Made
- **Scope (in)**: Local-first personal progression — a single composite **Rank** (Bronze→Legend, 7 tiers, no RPG levels), Titles (collectible across categories incl. Training Style + hidden), Achievements (progress/rarity, unlock titles + rank progress), equipped-title display, Challenges expansion (monthly/shoe/rotation/smart), Shoe Retirement flow + 4 card formats (1+ adopted at checkpoint) + Smart Retirement Grades + Most Memorable Moment + Sharing + Hall of Shoes + retirement achievements/titles, Home surfacing.
- **Scope (deferred, designed-pluggable)**: Global Hall of Fame leaderboards, cross-user ranking, nearby ranking, top-percentage. Ranking lib + types are built with a `RankingProvider` seam returning local-only placeholder now; a future backend implementation can supply real cross-user data. UI for HoF/Ranking is built against the seam but shows a "personal / coming soon" state rather than fake competitors. No fabricated competitor data.
- **Build order / slices**: Slice A Foundation engine → Slice B Retirement → Slice C Challenges → Slice D Home integration. (Hall of Fame/Ranking = deferred future slice.)
- **Card formats**: build mockups of all 4; adopt the user's pick at the plan-checkpoint. Default working assumption until then: implement the engine/data so any format renders from the same retirement summary.
- **Constraints (iron law, confirmed)**: never destroy user data (shoes/runs); native changes minimal and test-accompanied; `tsc --noEmit` + `npm run lint` + `npm test` green; no secrets; pure-function libs (no input mutation, clamp NaN/negative). No fabricated achievements/milestones (only real, completed ones).
- **Tone**: premium, collectible, respectful, not sad/childish; subtle KEEGO / Keep Going branding; reinforce shoe-first differentiator; do not copy NRC/Strava/Garmin.
- **Reuse**: lib/challenges, lib/records, lib/rotation, lib/wearModel, lib/replacementForecast, share-card svg infra, profileName, shoeHealth retire.

### Round 1 Refinement (user message #3 — "KEEGO Rank & Title System")
A third detailed brief refined Epic #1's progression model. Folded into scope:
- **Rank replaces "User Level / Progress Points level".** A single composite **Rank** represents overall progression. Explicitly NO RPG levels (no Lv.1/Lv.50), no complicated mechanics — simple but prestigious (Apple Fitness / WHOOP / Strava / PS Trophies / luxury loyalty tone). Rank is computed from a composite across pillars — running activity, consistency, shoe management, rotation, achievements, challenges — **distance is only one input, not the sole driver.**
- **7 rank tiers + AUTHORITATIVE colors (override any earlier palette):** Bronze `#CD7F32`, Silver `#C0C0C0`, Gold `#FFD700`, Platinum (Premium Teal) `#14B8A6`, Diamond (Diamond Blue) `#3B82F6`, Master (Royal Purple) `#9333EA`, Legend (KEEGO Orange) `#FF6500`. Color must be more memorable than the name; Legend orange = top-status visual identity.
- **Rank distribution targets (anti-inflation):** Bronze 35 / Silver 25 / Gold 18 / Platinum 12 / Diamond 7 / Master 2.5 / Legend 0.5 %. Local-first implementation: rank is derived from an **absolute composite score whose thresholds are calibrated to approximate this distribution** for a typical population — NOT a live cross-user percentile (true percentile enforcement belongs to the deferred backend / Hall of Fame seam). No fake population data.
- **Rank vs Title separation:** Rank = progression (one, auto). Title = identity (collect many, equip one). Title categories: Running, Consistency, Shoe Management, Rotation, Injury Prevention, **Training Style** (Tempo / Long Run / Recovery / Race Runner — new). Title tone: professional, premium, aspirational, shareable; not childish / meme / fantasy.
- **Profile hierarchy:** ① rank color ② title ③ nickname, plus Total Distance, Registered Shoes, Retired Shoes, Current Streak.
- Achievements unlock both Titles and Rank progress. Hall of Fame 6 categories (Distance, Consistency, Rotation, Shoe Management, Collection, Progress) — still deferred behind the pluggable ranking seam (needs multi-user backend).

This refinement introduces no new architectural fork: the deferred-HoF + local-first decisions from Round 1 still hold; the rank distribution is honored via threshold calibration, not live percentiles.

### Remaining Ambiguities
- Exact adopted retirement card format(s) — resolved at plan-checkpoint after mockups.
- Precise numeric thresholds for some long-horizon title tiers and for rank-tier composite-score cutoffs — agent defines defensible, documented defaults in the spec (calibrated to the target rank distribution); tiers needing long real-world history unlock naturally over elapsed time from available data, never retroactively fabricated.
- Whether equipped title also appears in shareable retirement cards — proposed yes (subtle), confirm at checkpoint.

## Round 2 (gap closure — documented agent design decisions under delegated authority)

The clarity validation (0.755) flagged missing precision. Per the user's standing design-authority grant ("너는 탑티어 러닝앱 개발자·디자이너다 … 네가 새로 설계해도 된다") and their selection of every recommended option, the following defensible defaults are LOCKED into the spec. The agile **plan-checkpoint** is the human review point for these exact numbers.

### R2.1 Composite Rank formula (no levels)
`rankScore` ∈ [0,100] = weighted sum of 6 normalized pillar scores (each pillar ∈ [0,1]):
- Running activity 25% (cumulative + recent distance, log-scaled so it saturates, never the sole driver)
- Consistency 20% (current/longest streak + weekly-active ratio over trailing 12 weeks)
- Shoe Management 20% (share of active-shoe-days with no overdue shoe over trailing window)
- Rotation 15% (balance of usage across active shoes; entropy of per-shoe km share)
- Injury Prevention 10% (count of shoes replaced before overdue ÷ total replacements; penalize overdue-in-use)
- Engagement 10% (achievements unlocked + challenges completed, capped)

Pure function `lib/rank.ts: computeRank(runs, shoes, achievements, challenges, now) → { score, tier, tierColor, pillars }`. Memoized; recompute only when inputs change. No input mutation; NaN/negative/missing → 0 (iron law).

### R2.2 Rank tier cutoffs (default, calibrated to target distribution)
Bronze `S<25` (~35%), Silver `25≤S<45` (~25%), Gold `45≤S<62` (~18%), Platinum `62≤S<78` (~12%), Diamond `78≤S<90` (~7%), Master `90≤S<97` (~2.5%), Legend `S≥97` (~0.5%). Colors per R1 authoritative palette. **Validation method:** a jest test generates a documented synthetic population (~1000 users sampled from plausible stat distributions) and asserts each band's share is within **±6 percentage points** of target. Thresholds are the calibration knob; live cross-user percentile = deferred backend.

### R2.3 Title tier thresholds (defaults)
Use the user-supplied ladders verbatim where given (Running: first run / 100 / 500 / 1000 / 5000 / 10000 / 25000 km; Shoe Mgmt: 1/3/5/10 shoes then time-based; Rotation/Injury/Consistency time-based per brief). Definitions for the time-based ones: "excellent management for N months" = management-pillar ≥0.9 sustained across an N-month trailing window; "healthy rotation for N" = rotation-pillar ≥0.7 sustained across the window. Long-horizon tiers unlock naturally as elapsed history accrues — never retroactively fabricated. Hidden titles: Early Bird (≥20 runs started before 05:00 via run start time), Night Runner (≥20 after 22:00), Comeback Runner (a run after a ≥30-day gap), Long Relationship (a non-retired shoe with first-worn date >365 days ago). **Data-limitation note:** Rain Runner requires weather data, which is NOT tracked — deferred (omit from v1 or gate behind an optional manual weather tag), documented in spec.

### R2.4 Acceptance criteria (testable X→Y; seed for scenarios + acceptance tests)
- First completed run → "Running Beginner" (Bronze/Running) unlocks, visible on Progression surface.
- Cumulative distance crosses 100 km → "100km Club" unlocks; a one-time unlock notice surfaces (idempotent — not re-fired on recompute).
- 3 registered active shoes → "Shoe Enthusiast" unlocks.
- Shoe retired within ±5% of recommended lifespan → retirement grade = Perfect 💎, Perfect card styling applied, "Perfect Timing" achievement unlocks.
- Any shoe retired → appears in Hall of Shoes with km + retire year; persists across app reloads and never disappears.
- rankScore in Platinum band → Profile + Home show Platinum-teal `#14B8A6` rank chip; tier label "Platinum".
- User equips a title → it renders next to nickname on Profile and (subtly) on the retirement card.
- Empty run/shoe history → rank = Bronze, no crash, aspirational empty states ("첫 런으로 여정을 시작하세요"); retirement entry disabled (no shoe at lifespan).
- Retirement flow → Step1 confirm shows real shoe name/distance/run count/usage period; Step2 journey summary uses real aggregates; Step3 highlights list ONLY real completed achievements (no fabrication).

### R2.5 Performance budgets
- Full engine recompute (rank + titles + achievements) over a 1000-run / 30-shoe history: **< 50 ms** in CI (pure JS, synchronous); target < 100 ms for 2000 runs on a mid device. Enforced by a perf-budget unit test.
- Retirement card React render: synchronous, no async data fetch.
- Share image generation (svg→PNG dataURL, reusing existing share-card infra): **< 2 s**; "Save Image" must always succeed offline.
- Engine results memoized; no recompute unless runs/shoes/achievements/challenges change.

### R2.6 Pinned dependencies / native posture
react-native 0.85.3, react 19.2.3, react-native-svg ^15.15.4 (cards/charts), @react-native-async-storage/async-storage ^3.1.1, @react-native-firebase/{app,auth,firestore} 24.0.0 (optional cloud-sync of progression state, mirrors existing per-uid userBackups doc), jest ^29.6.3, react-test-renderer 19.2.3, typescript ~6.0.3, node ≥22.11. **Slices A–D require NO new native modules** (pure JS + existing svg/storage/firestore) → no Android/iOS rebuild needed, fully autonomously verifiable via tsc/lint/jest. Deferred Hall-of-Fame backend seam (`lib/ranking` provider interface) ships as a local-only implementation now; the future networked implementation is the only part needing backend/scaling work (out of current scope).

### R2.7 Failure scenarios
- Empty/zero history → safe defaults (R2.4), no throw.
- Corrupt/malformed run/shoe records → clamp/skip per iron law; never throw; never drop valid records.
- AsyncStorage/Firestore sync failure mid-retirement → retirement is a LOCAL-first transition (shoe.retired + retirement record persisted locally before any network); a failed cloud sync never blocks or loses the retirement; retry on next sync. Card generation is pure-local, network-independent.
- Share target app not installed → use OS Share sheet (handles available targets); "Save Image" writes to gallery regardless; no crash when a specific app (IG/Threads/X/Kakao) is absent.
- Equipped title later invalid → fall back to no title.

### R2.8 Backend, cross-repo, and THIS-RUN scope (user message #4 + decisions)
The user greenlit a **Multi-User Backend v1** (Node/Express on Render, Firebase Auth, server-side leaderboard recompute), resolving the earlier "deferred Hall of Fame" fork. Findings + decisions:
- **Existing backend = separate repo** `C:\Users\user\solelife-backend` (GitHub `solelife9/solelife-backend`, Render). Stack: Express 4 + better-sqlite3 (SQLite) + firebase-admin ^12.7.0 (already present) + uuid; monolithic `server.js`; existing `/api/auth|shoes|runs`. Runs/shoes already live in this SQLite DB.
- **Datastore decision:** extend the existing SQLite with new tables (user_profiles, monthly_stats, achievements, titles, challenge_progress, leaderboard_entries) + attach a **Render persistent disk** so data survives redeploys. Isolate the data-access layer (models/services) so a later Postgres swap is contained. Server recomputes leaderboard scores from verified run/shoe rows — never trusts client-submitted scores. Refactor `server.js` toward routes/controllers/services/models/middleware without breaking existing routes.
- **Cross-repo decision:** the backend is built as a **SEPARATE future Tenet run** rooted in `solelife-backend` (clean per-repo git/PR/eval). Firebase Admin service-account JSON + Render deploy = danger-zone user actions handled in that run.
- **THIS RUN scope (feature `progression`, agile) is bounded to APP slices A–D**, all local-first, NO new native modules, NO backend dependency → fully autonomously verifiable (tsc/lint/jest):
  - **Slice A — Engine:** `lib/rank`, `lib/titles`, `lib/achievements`, progress points; tier colors token; minimal Profile/Progression surface.
  - **Slice B — Shoe Retirement:** trigger + 3-step flow + Smart Grades + Most Memorable Moment + 4 candidate cards (adopted format chosen at checkpoint) + sharing (reuse svg share-card) + Hall of Shoes + retirement achievements/titles.
  - **Slice C — Challenges expansion:** monthly/shoe/rotation/smart on `lib/challenges`.
  - **Slice D — Home integration:** surface equipped title, current challenge, recent achievement, rank chip.
  - The **ranking provider seam** (`lib/ranking`) ships in this run as a LOCAL-ONLY implementation behind a stable interface; Hall of Fame UI shows a personal / "coming soon" state — NO fabricated competitors.
- **Deferred to the separate backend effort:** Slice F (backend v1) + Slice E (app ranking client wired to F + live Hall of Fame UI).

### R2.9 Overnight lock-downs (deferred → LOCKED under delegated authority; flagged for morning review)
The user went to sleep after authorizing an unattended autonomous pass and has standing design authority. The previously-deferred/proposed items are therefore LOCKED as v1 decisions so implementation is unambiguous; each is tagged for the morning batch review and is cheap to change.
- **Retirement card adopted default = Format C (Apple / Korean, emotional-but-proud)** — best fits Keego's established premium dark, Korean-first, shoe-first voice ("512km 함께했습니다 … 훌륭한 여정이었습니다"), with the Smart Retirement Grade badge (from Format D) incorporated. The card RENDERER implements all four layouts (A Nike / B Modern / C Apple / D Hall-of-Fame) selectable from one shared retirement summary; default = C. All four HTML mockups are still generated in the visuals phase for the morning pick.
- **Equipped title on shareable retirement cards = YES (subtle)** — rendered small near the KEEGO wordmark.
- **Long-horizon title thresholds LOCKED (v1):** "excellent management for N months" = management pillar ≥ 0.90 sustained across the trailing N-month window; "healthy rotation for N" = rotation pillar ≥ 0.70 sustained across the window. Shoe-Management tiers: Diamond = excellent ≥6 mo, Master = excellent ≥12 mo, Legend = top-decile management profile (local proxy: management pillar ≥0.95 AND ≥12 mo). These unlock as elapsed history accrues; never fabricated.
- **Rank cutoffs LOCKED** at R2.2 defaults, validated by the synthetic-population test (±6pp). Real-population recalibration is a post-launch backend task, not a v1 blocker.
- **Rain Runner hidden title v1 resolution = OMITTED from v1** (weather not tracked). Documented; re-added if/when weather data exists. All other hidden titles ship.
- **UI surfacing timing LOCKED:** achievement/title unlock → non-blocking toast/banner, ~3.5 s, tap-to-view, idempotent (fires once per unlock, not on recompute). Rank-up → one-time celebratory dismissible sheet on next app foreground.
- **Hall of Fame / cross-user ranking = OUT OF SCOPE for this run** (scope boundary, not a gap) — local-only provider seam ships; live cross-user scenarios belong to the separate backend run (F) + client (E).

## Delivery Mode Decision
- Prompt shown: Standalone question — "Agile (sliced delivery with initial plan-checkpoint + per-slice use-checkpoints) vs Autonomous (one end-to-end run, no mid-run checkpoints)?" presented with both options explained.
- User response: "Agile 슬라이스 (추천)".
- Selected delivery_mode: agile
- Selection basis: explicit_user_choice

## Summary
Build a local-first, premium **Progression & Retirement** ecosystem for Keego in agile slices. A shared Titles + Achievements + Progress Points engine (5 tracks: Running, Shoe Management, Rotation, Injury Prevention, Consistency; 7 tiers Bronze→Legend + hidden titles) underpins a signature Shoe Retirement experience (user-controlled trigger, journey summary, real-achievement highlights, Smart Retirement Grades, 4 candidate card formats with sharing, Hall of Shoes museum, retirement achievements/titles). Challenges expand on the existing engine; Home surfaces current title/challenge/recent achievement. Global Hall of Fame / cross-user ranking is deferred but designed behind a pluggable provider seam (no fabricated competitors). Iron law preserved: no data loss, minimal/test-accompanied native, green tsc/lint/test, no secrets, no fabricated milestones. Delivery: agile, plan-checkpoint after spec+mockups, use-checkpoint per slice.
