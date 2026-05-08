/**
 * plateNormalizer.ts
 *
 * Canonical plate format: "ر و ص ١٢٣"
 *   - Arabic letters separated by single spaces (right-to-left order as on plate)
 *   - Arabic-Indic digits (٠-٩), no spaces between digits
 *   - One space separating the letter group from the digit group
 *   - Letters come first in the string, digits follow
 */

const WESTERN_TO_ARABIC_DIGIT: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

const ARABIC_DIGITS = new Set(['٠','١','٢','٣','٤','٥','٦','٧','٨','٩']);

/** Valid Arabic letters that appear on Egyptian plates */
const ARABIC_LETTERS = new Set([
  'أ','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز',
  'س','ش','ص','ض','ط','ظ','ع','غ','ف',
  'ق','ك','ل','م','ن','ه','و','ي',
]);

/**
 * Normalize a raw plate string into canonical form.
 *
 * Accepts:
 *   - Arabic or Western digits  →  converted to Arabic-Indic
 *   - Arabic letters in any order / spacing
 *   - Mixed formats arriving via MQTT from the Flask server or from the frontend
 *
 * Returns the canonical string e.g. "ر و ص ١٢٣",
 * or null if the result contains no letters or no digits.
 */
export function normalizePlate(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // 1. Convert Western digits → Arabic-Indic
  const converted = raw
    .split('')
    .map(ch => WESTERN_TO_ARABIC_DIGIT[ch] ?? ch)
    .join('');

  // 2. Extract letters and digits, drop everything else
  const letters: string[] = [];
  const digits:  string[] = [];

  for (const ch of converted) {
    if (ARABIC_LETTERS.has(ch))  letters.push(ch);
    else if (ARABIC_DIGITS.has(ch)) digits.push(ch);
    // silently drop spaces, dashes, Latin chars, noise
  }

  if (letters.length === 0 || digits.length === 0) return null;

  // 3. Assemble canonical form
  const letterPart = letters.join(' ');  // "ر و ص"
  const digitPart  = digits.join('');    // "١٢٣"

  return `${letterPart} ${digitPart}`;
}