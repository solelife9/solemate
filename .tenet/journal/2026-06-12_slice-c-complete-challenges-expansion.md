# Slice C complete - challenges expansion

type: journal
source_job: 8815d6fd-a4af-4657-b6a8-a1bebbbb09fa
job_name: 통합검증: Slice C (챌린지 확장 sweep)
created: 2026-06-12T19:28:10.401Z

## Findings

- **slice**: C — Challenges expansion
- **status**: COMPLETE, all eval gates passed
- **commits**: ["6445256+88e034f challengesExt logic","2f72d18+45a7477 challenge UI in ProgressionScreen"]
- **modules**: lib/progression/challengesExt.ts (monthly/shoe/rotation/smart kinds + generateSmartChallenge + extChallengesToContext); ExtChallengeCard/SmartChallengeCard exported from ChallengesSection.tsx, mounted in ProgressionScreen; App wires accept->K_CHALLENGES
- **tests**: 1167 jest tests green
- **key_bugs_caught_and_fixed**: ["smart challenge born-completed (no date window) -> stamped forward window","DEAD UI: ChallengesSection mounted nowhere (removed from Profile per user b1ae2b1) -> surfaced in mounted ProgressionScreen + removed dead Profile plumbing"]
- **decisions**: challenges surface = ProgressionScreen (NOT Profile, user had removed Profile challenges section); smart challenge deterministic (no random/Date.now), real shoes only, forward window so only post-recommendation distance counts; K_CHALLENGES coexists distance/streak + ext non-destructively
- **next**: Slice D — Home integration (rank chip/equipped title/current challenge/recent achievement); resolve uncommitted HomeScreen usage% tweak first
