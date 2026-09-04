import { describe, expect, it } from "vitest";

import { aggregate } from "@/server/detect/aggregate";
import { composeSummary } from "@/server/detect/explain";
import { makeSettings } from "./helpers";
import type { DetectorResult } from "@/server/detect/types";

const settingsCtx = { settings: makeSettings() };
const weightFor = () => 0.2;

function res(over: Partial<DetectorResult>): DetectorResult {
  return {
    detectorId: "x",
    category: "phishing",
    triggered: true,
    score: 0.5,
    confidence: 1,
    severity: "medium",
    evidence: [{ label: "L", value: "V", kind: "fact" }],
    ...over,
  };
}

describe("aggregate", () => {
  it("normalises weighted contributions to 0-100", () => {
    const out = aggregate(
      [res({ detectorId: "a", score: 1 }), res({ detectorId: "b", score: 0 , triggered: false })],
      settingsCtx,
      weightFor,
    );
    expect(out.score).toBe(50); // one full hit of two possible
    expect(out.band).toBe("MEDIUM");
  });

  it("applies the critical floor", () => {
    const out = aggregate(
      [res({ detectorId: "a", score: 0.9, severity: "critical" })],
      settingsCtx,
      weightFor,
    );
    expect(out.score).toBeGreaterThanOrEqual(85);
    expect(out.band).toBe("CRITICAL");
  });

  it("returns SAFE with no triggered signals", () => {
    const out = aggregate(
      [res({ triggered: false, score: 0 })],
      settingsCtx,
      weightFor,
    );
    expect(out.score).toBe(0);
    expect(out.band).toBe("SAFE");
  });
});

describe("composeSummary", () => {
  it("leads with the top category and quotes evidence", () => {
    const out = aggregate(
      [
        res({
          detectorId: "a",
          category: "spoofing",
          score: 1,
          severity: "critical",
          evidence: [{ label: "SPF result", value: "fail", kind: "quote" }],
        }),
      ],
      settingsCtx,
      weightFor,
    );
    const summary = composeSummary(out.band, out.score, out.signals);
    expect(summary).toContain("spoofing");
    expect(summary).toContain("SPF result");
  });
});
