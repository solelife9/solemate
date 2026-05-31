// ─── Shoe helpers ────────────────────────────────────────────────
// Pure shoe-name parsing + the single source of truth for shoe wear/condition.

export const BRANDS = [
  'New Balance', 'La Sportiva', 'Inov-8', 'ASICS', 'Nike', 'Adidas', 'Brooks',
  'Saucony', 'Hoka', 'Mizuno', 'Salomon', 'Karhu', 'Scott', 'Merrell', 'Norda',
  'Veja', 'Lululemon', 'Reebok', 'Puma', 'On',
];

/**
 * Split a free-form shoe name into `{brand, model}`. Known multi-word brands
 * (from BRANDS) match case-insensitively by prefix; otherwise the first token
 * is treated as the brand. Brand is upper-cased to match the original behavior.
 */
export function parseShoeName(name: string): {brand: string; model: string} {
  if (!name) return {brand: '', model: ''};
  for (const b of BRANDS) {
    if (name.toUpperCase().startsWith(b.toUpperCase())) {
      return {brand: b.toUpperCase(), model: name.slice(b.length).trim()};
    }
  }
  const idx = name.indexOf(' ');
  if (idx < 0) return {brand: name.toUpperCase(), model: ''};
  return {brand: name.slice(0, idx).toUpperCase(), model: name.slice(idx + 1).trim()};
}

// ─── Shoe health (single source of truth) ─────────────────────────
// Replaces the old hard-coded "잔여 100km → 점검" rule and the `used` math that
// was duplicated across App.tsx / Home / Shoes (audit#7). Usage is derived once
// from the run log + the shoe's *category lifespan* (max_km, set at registration
// from the recommended life), then mapped to a proportional condition tier.

export type ShoeCondition = '양호' | '주의' | '교체';

export type ShoeHealth = {
  usedKm: number; // start_km + Σ km of runs logged against this shoe
  remainingKm: number; // max(0, max_km - usedKm)
  percentUsed: number; // usedKm / max_km * 100 (may exceed 100 once worn past life)
  condition: ShoeCondition;
};

// Proportional tier thresholds — percent of category lifespan consumed.
export const SHOE_CAUTION_PCT = 75; // ≥75% → 주의
export const SHOE_REPLACE_PCT = 90; // ≥90% → 교체

// Fallback category lifespan when a shoe carries no max_km (mirrors App default).
export const DEFAULT_MAX_KM = 600;

export type ShoeLike = {
  id?: string | number;
  max_km?: number; // backend field (category lifespan)
  max?: number; // presentational alias used by the UI Shoe shape
  start_km?: number; // mileage already on the shoe at registration
  retired?: boolean;
};

export type RunLike = {shoe_id?: string | number; km?: number | string};

/** Map a consumed-percentage to a condition tier. Shared by every consumer so
 *  the threshold lives in exactly one place. */
export function conditionForPercent(percentUsed: number): ShoeCondition {
  if (percentUsed >= SHOE_REPLACE_PCT) return '교체';
  if (percentUsed >= SHOE_CAUTION_PCT) return '주의';
  return '양호';
}

/**
 * Derive a shoe's wear from its registration mileage + every run logged against
 * its id. `runs` that belong to other shoes are ignored, so this is safe to call
 * with the full run list. Pure: no rounding/clamping beyond a non-negative
 * remaining (a shoe past its life still reports its true usedKm/percentUsed).
 */
export function shoeHealth(shoe: ShoeLike, runs: RunLike[] = []): ShoeHealth {
  const max = Number(shoe?.max_km ?? shoe?.max ?? DEFAULT_MAX_KM) || DEFAULT_MAX_KM;
  const startKm = Number(shoe?.start_km ?? 0) || 0;
  const ranKm = (runs || []).reduce((sum, r) => {
    if (!r || r.shoe_id !== shoe?.id) return sum;
    const km = typeof r.km === 'number' ? r.km : parseFloat(String(r.km));
    return sum + (Number.isFinite(km) ? km : 0);
  }, 0);
  const usedKm = startKm + ranKm;
  const remainingKm = Math.max(0, max - usedKm);
  const percentUsed = max > 0 ? (usedKm / max) * 100 : 0;
  return {usedKm, remainingKm, percentUsed, condition: conditionForPercent(percentUsed)};
}

/** Retired (archived) shoes are hidden from run pickers but keep all records. */
export function isRetired(shoe: ShoeLike | null | undefined): boolean {
  return !!(shoe && shoe.retired);
}
