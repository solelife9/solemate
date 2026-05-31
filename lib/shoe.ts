// ─── Shoe helpers ────────────────────────────────────────────────
// Pure shoe-name parsing extracted from App.tsx.
// NOTE: `shoeHealth` / `isRetired` are intentionally NOT here — they belong to
// the slice-1-shoe-health job. This module owns only brand/model parsing.

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
