# Brownfield Codebase Scan Summary

## Tech Stack [scanned-not-verified]
- Languages: TypeScript 5.8 (strict), TSX
- Frameworks: React Native 0.85.2, React 19.2.3, React Navigation (bottom-tabs 7.x)
- Key libs: react-native-geolocation-service, react-native-sensors (rxjs), react-native-tts, react-native-svg, react-native-vector-icons, @react-native-async-storage/async-storage
- Package Manager: npm (Node >= 22.11.0)

## Architecture & Patterns [scanned-not-verified]
- Style: Single-app React Native, screen-per-file. Entry point `App.tsx` wires navigation + core run-tracking logic (KalmanFilter, calcDist).
- State/persistence: Local-first via AsyncStorage; no global store library.
- API: REST backend at https://solelife-backend.onrender.com (absolute paths via `API` constant).
- UI: Design tokens centralized in `theme.ts`; reusable primitives in `primitives.tsx`. Screens named `*.rn.tsx`.

## Project Layout [scanned-not-verified]
- Source Root: repo root (flat) — no `src/`
- Screens: HomeScreen, HistoryScreen, ShoesScreen, ProfileScreen, AddShoeScreen, RunScreen (all `*.rn.tsx`)
- Shared: `theme.ts`, `primitives.tsx`, `types.d.ts`, `App.tsx`
- Native: `android/` (active build target on Windows via gradlew), `ios/` (kept compatible, built later on Mac)

## Development Lifecycle [scanned-not-verified]
- Entry Point: `App.tsx` (index.js registers app)
- Test Framework: Jest (@react-native/jest-preset); existing tests: `__tests__/App.test.tsx`
- Lint: eslint (@react-native/eslint-config) via `npm run lint`; Typecheck: `npx tsc --noEmit`
- CI/CD Provider: none detected (no `.github/workflows/`); release via `gh release`

## Existing Documentation [scanned-not-verified]
- Status: Rich quality contract already present at `.tenet/harness/current.md` (project context, danger zones, iron laws). No top-level README/docs folder observed.
</content>
</invoke>
