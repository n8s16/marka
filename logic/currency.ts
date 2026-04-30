// Currency parse and format helpers for Marka.
//
// Storage rule (per docs/DATA_MODEL.md): currency is stored as integer minor
// units (centavos). 100 centavos = 1 peso. ₱1,599.00 → 159900. Floats are
// banned at the model layer; this module is the single funnel from user-typed
// strings into integer storage and from integer storage back to display strings.
//
// PRD §"Behavior decisions" — Currency input/display:
//   - Input: "1599" → 159900, "1599.5" → 159950, "1599.50" → 159950.
//   - Input: more than 2 decimals → reject. Negative → reject. Non-numeric → reject.
//   - Display: always 2 decimals, comma thousands, peso-sign prefix.
//
// All math here is on integers — no floating-point arithmetic. The string parse
// path scales the decimal manually rather than going through `parseFloat`.

export type ParseCurrencyResult =
  | { ok: true; value: number }
  | { ok: false; reason: string };

const PESO = '₱'; // ₱

/**
 * Parse a user-typed peso amount into integer centavos. Returns a discriminated
 * union so callers can render the rejection reason without throwing.
 *
 * Accepts:
 *   - Whole numbers ("1599")             → padded to .00
 *   - One decimal place ("1599.5")       → padded to .50
 *   - Two decimal places ("1599.50")     → as-is
 *   - Leading/trailing whitespace        → trimmed
 *   - Comma thousands separators ("1,599") → stripped before parsing
 *
 * Rejects:
 *   - Empty string
 *   - Non-numeric characters
 *   - Negative numbers (the data layer never stores negatives)
 *   - More than two decimal places (no fractional centavos)
 *   - Multiple decimal points
 */
export function parseCurrencyInput(input: string): ParseCurrencyResult {
  if (typeof input !== 'string') {
    return { ok: false, reason: 'Enter an amount.' };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'Enter an amount.' };
  }

  if (trimmed.startsWith('-')) {
    return { ok: false, reason: 'Negative amounts are not allowed.' };
  }

  // Strip commas. We accept "1,599" or "1,599.50" as a convenience; downstream
  // we only validate digits + at most one decimal point.
  const stripped = trimmed.replace(/,/g, '');

  // Reject anything that's not digits or a single decimal point.
  if (!/^[0-9]*\.?[0-9]*$/.test(stripped)) {
    return { ok: false, reason: 'Enter a valid amount.' };
  }

  // Catches multiple decimals like "1599.5.0" — already excluded by the regex
  // above (which only allows one '.'), but a defensive count guards against
  // regex regressions.
  const dotCount = (stripped.match(/\./g) ?? []).length;
  if (dotCount > 1) {
    return { ok: false, reason: 'Enter a valid amount.' };
  }

  // Must have at least one digit somewhere — bare "." or "" is not valid.
  if (!/[0-9]/.test(stripped)) {
    return { ok: false, reason: 'Enter a valid amount.' };
  }

  const [rawWhole, rawFrac = ''] = stripped.split('.');

  if (rawFrac.length > 2) {
    return { ok: false, reason: 'Use at most two decimal places.' };
  }

  // Empty whole part (e.g. ".50") is OK — treat it as "0.50".
  const wholePart = rawWhole.length === 0 ? '0' : rawWhole;
  const fracPadded = rawFrac.padEnd(2, '0');

  // Manual integer math: combine whole and fractional parts as a single string,
  // then parse. Avoids any float arithmetic.
  const combined = wholePart + fracPadded;
  const value = Number(combined);
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    return { ok: false, reason: 'Amount is too large.' };
  }

  return { ok: true, value };
}

/**
 * Format integer centavos as a display string: always 2 decimals, comma
 * thousands, peso-sign prefix. e.g. 159900 → "₱1,599.00".
 *
 * Negative input is unexpected (the data layer never stores negatives) but we
 * render with a leading "-₱" rather than throwing — the alternative (a thrown
 * exception inside a render path) is worse than rendering an obviously-wrong
 * number that surfaces the upstream bug.
 */
export function formatCurrency(centavos: number): string {
  if (!Number.isFinite(centavos)) {
    return `${PESO}0.00`;
  }
  // Round defensively in case a non-integer slipped through. The data layer
  // never produces non-integers; this is a belt-and-suspenders guard.
  const rounded = Math.trunc(Math.round(centavos));

  const negative = rounded < 0;
  const abs = Math.abs(rounded);

  const pesos = Math.trunc(abs / 100);
  const cents = abs % 100;

  const pesosStr = addThousandsCommas(pesos);
  const centsStr = cents.toString().padStart(2, '0');

  return `${negative ? '-' : ''}${PESO}${pesosStr}.${centsStr}`;
}

function addThousandsCommas(n: number): string {
  // n is a non-negative integer. Walk the digits from the right inserting
  // commas every three. Avoids relying on toLocaleString's locale defaults.
  const s = n.toString();
  if (s.length <= 3) return s;
  const parts: string[] = [];
  for (let i = s.length; i > 0; i -= 3) {
    parts.unshift(s.slice(Math.max(0, i - 3), i));
  }
  return parts.join(',');
}
