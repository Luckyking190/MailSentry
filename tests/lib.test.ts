import { describe, expect, it } from "vitest";

import { skeleton, isPunycode } from "@/lib/homoglyph";
import { damerauLevenshtein } from "@/lib/textdistance";
import { scoreToBand } from "@/lib/scoring";

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
