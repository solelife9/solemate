// ============================================================================
// theme.ts — SoleMate design tokens (React Native, bare RN 0.85)
// ============================================================================
export const BG = '#000000';
export const CARD = '#1C1C1E';
export const CARD_HI = '#2C2C2E';        // raised surface (chips / pressed)
export const CARD_DIM = '#0D0D0D';       // recessed card (idle picker etc.)
export const HERO_BG = '#161618';        // selected/featured card surface
export const ACCENT = '#FF6500';
export const ACCENT_2 = '#FF9F4A';       // gradient top stop
export const WARN = '#FF9F0A';
export const DANGER = '#FF453A';
export const GOOD = '#30D158';           // healthy condition dot
export const T1 = '#FFFFFF';
export const T2 = '#EBEBF5';
export const T3 = '#8E8E93';
export const SEP = 'rgba(255,255,255,0.08)';

// Font family names as actually loaded in this project (assets/fonts + Info.plist).
export const FONT = 'PretendardVariable';  // body
export const DISPLAY = 'BebasNeue-Regular'; // big numbers / wordmark

// ── shared UI types (presentational shapes used by the handoff screens) ───────
export type Shoe = {
  id?: string;          // backend id (optional for pure-UI usage)
  brand: string;
  model: string;
  used: number;
  max: number;
  condition: '양호' | '점검';
};

export type Run = {
  id?: string;
  date: string;   // "5월 28일"
  day: string;    // "수"
  dateNum: string; // "28"
  dist: number;
  pace: string;   // "5'02\""
  time: string;   // "40:41"
  shoe: number;   // index into shoes[]
  cal: number;
  cadence: number;
  bpm: number;
  elev: number;
};

// Fallback used only when a screen is rendered without data (kept empty so no
// fake data ever shows in the real app).
export const SHOES: Shoe[] = [];
