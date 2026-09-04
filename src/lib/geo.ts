/**
 * Country formatting for GeoIntel rows.
 *
 * `Intl.DisplayNames` ships with Node's ICU, so country names cost no
 * dependency. Flags are derived arithmetically: an ISO-3166 alpha-2 code maps
 * to a regional-indicator pair by offsetting each letter into U+1F1E6..U+1F1FF.
 */

const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - 0x41; // 'A' -> 🇦

let displayNames: Intl.DisplayNames | undefined;

function names(): Intl.DisplayNames | undefined {
  // Constructing this is comparatively expensive, so build it once and let a
  // missing-ICU environment fall back to the bare code rather than throwing.
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      displayNames = undefined;
    }
  }
  return displayNames;
}

/** ISO-3166 alpha-2 (e.g. "IN") → "🇮🇳". Empty string when not a valid code. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET))
    .join("");
}

/** ISO-3166 alpha-2 → "India". Falls back to the upper-cased code. */
export function countryName(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "Unknown";
  const up = code.toUpperCase();
  return names()?.of(up) ?? up;
}

/**
 * One-line place label for a hop: "🇮🇳 Mumbai, India", degrading to the country
 * alone when the geo provider gave no city, and to "Unknown" with neither.
 */
export function placeLabel(
  country: string | null | undefined,
  city?: string | null,
): string {
  const flag = countryFlag(country);
  const name = countryName(country);
  if (name === "Unknown") return "Unknown";
  const where = city ? `${city}, ${name}` : name;
  return flag ? `${flag} ${where}` : where;
}
