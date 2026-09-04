/**
 * Confusable-character folding for lookalike-domain detection.
 * `skeleton(s)` maps visually confusable characters to a canonical form so that
 * e.g. `skeleton("m1crosoft") === skeleton("microsoft")` and
 * `skeleton("paypaI") === skeleton("paypal")`.
 */

const CONFUSABLES: Record<string, string> = {
  // i / l / 1 / | / ! all collapse to a single canonical stroke so that
  // "m1crosoft" folds onto "microsoft" and "paypa1" onto "paypal".
  i: "l",
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "b",
  "7": "t",
  "8": "b",
  "9": "g",
  // common latin confusions
  "|": "l",
  "!": "i",
  "$": "s",
  "@": "a",
  // cyrillic homoglyphs → latin
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  х: "x",
  у: "y",
  к: "k",
  м: "m",
  т: "t",
  н: "h",
  в: "b",
  і: "i",
  ѕ: "s",
  ԁ: "d",
  ɡ: "g",
  // greek
  ο: "o",
  α: "a",
  ε: "e",
  ρ: "p",
  ν: "v",
  // accented latin
  á: "a",
  à: "a",
  â: "a",
  ä: "a",
  é: "e",
  è: "e",
  ê: "e",
  í: "i",
  ì: "i",
  ó: "o",
  ò: "o",
  ö: "o",
  ú: "u",
  ü: "u",
  ñ: "n",
  ç: "c",
};

export function skeleton(input: string): string {
  const lower = input.normalize("NFKC").toLowerCase();
  let out = "";
  for (const ch of lower) {
    const mapped = CONFUSABLES[ch] ?? ch;
    // collapse repeated letters ("rn" vs "m" is handled separately below)
    if (mapped !== out[out.length - 1]) out += mapped;
  }
  // "rn" is a classic lookalike for "m"
  return out.replace(/rn/g, "m");
}

/** Is `label` written in Punycode ("xn--…")? */
export function isPunycode(label: string): boolean {
  return /(^|\.)xn--/i.test(label);
}
