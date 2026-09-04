import { describe, expect, it } from "vitest";

import { skeleton, isPunycode } from "@/lib/homoglyph";
import { damerauLevenshtein } from "@/lib/textdistance";
import { scoreToBand } from "@/lib/scoring";
import { countryFlag, countryName, placeLabel } from "@/lib/geo";

describe("homoglyph skeleton", () => {
  it("folds digit/letter confusables to the real brand", () => {
    expect(skeleton("m1crosoft")).toBe(skeleton("microsoft"));
    expect(skeleton("paypa1")).toBe(skeleton("paypal"));
    expect(skeleton("g00gle")).toBe(skeleton("google"));
  });

  it("folds 'rn' to 'm'", () => {
    expect(skeleton("arnazon")).toBe(skeleton("amazon"));
  });

  it("keeps distinct brands distinct", () => {
    expect(skeleton("microsoft")).not.toBe(skeleton("google"));
  });

  it("detects punycode", () => {
    expect(isPunycode("xn--pypal-4ve.com")).toBe(true);
    expect(isPunycode("paypal.com")).toBe(false);
  });
});

describe("damerauLevenshtein", () => {
  it("counts single edits", () => {
    expect(damerauLevenshtein("paypal.com", "paypa1.com")).toBe(1);
    expect(damerauLevenshtein("google.com", "gooogle.com")).toBe(1);
  });
  it("counts transpositions as one", () => {
    expect(damerauLevenshtein("microsoft", "micorsoft")).toBe(1);
  });
  it("caps out past max", () => {
    expect(damerauLevenshtein("abc", "xyzxyz", 2)).toBe(3);
  });
});

describe("scoreToBand", () => {
  it("maps to the default bands", () => {
    expect(scoreToBand(5)).toBe("SAFE");
    expect(scoreToBand(25)).toBe("LOW");
    expect(scoreToBand(50)).toBe("MEDIUM");
    expect(scoreToBand(70)).toBe("HIGH");
    expect(scoreToBand(90)).toBe("CRITICAL");
  });
});

describe("geo labels", () => {
  it("builds a flag from an ISO-3166 alpha-2 code", () => {
    expect(countryFlag("IN")).toBe("\u{1F1EE}\u{1F1F3}");
    expect(countryFlag("us")).toBe("\u{1F1FA}\u{1F1F8}");
  });
  it("returns no flag for junk or missing codes", () => {
    for (const bad of [null, undefined, "", "U", "USA", "1N"]) {
      expect(countryFlag(bad)).toBe("");
    }
  });
  it("names countries and falls back to Unknown", () => {
    expect(countryName("IN")).toBe("India");
    expect(countryName(null)).toBe("Unknown");
  });
  it("degrades the place label when city or country is missing", () => {
    expect(placeLabel("IN", "Mumbai")).toBe("\u{1F1EE}\u{1F1F3} Mumbai, India");
    expect(placeLabel("IN", null)).toBe("\u{1F1EE}\u{1F1F3} India");
    expect(placeLabel(null, "Mumbai")).toBe("Unknown");
  });
});
