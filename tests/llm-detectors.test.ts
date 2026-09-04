import { describe, expect, it } from "vitest";

import { nlpContentDetector } from "@/server/detect/detectors/nlp-content";
import { becClassifierDetector } from "@/server/detect/detectors/bec-classifier";
import { socialEngineeringDetector } from "@/server/detect/detectors/social-engineering";
import { makeContext, makeLlm } from "./helpers";

describe("llm.content", () => {
  it("stays quiet when the LLM layer is disabled (ctx.llm is null)", async () => {
    const r = await nlpContentDetector.run(makeContext({ llm: null }));
    expect(r.triggered).toBe(false);
    expect(r.confidence).toBe(0);
  });

  it("flags a high phishing likelihood with evidence", async () => {
    const ctx = makeContext({
      llm: makeLlm({
        content: {
          phishing_likelihood: 0.9,
          requests_sensitive_info: true,
          sensitive_info_types: ["password", "OTP"],
          impersonated_entity: "Microsoft",
          rationale: "Classic credential-harvesting phishing.",
        },
      }),
    });
    const r = await nlpContentDetector.run(ctx);
    expect(r.triggered).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.9);
    expect(r.evidence.some((e) => e.value.includes("Microsoft"))).toBe(true);
  });

  it("marks itself degraded when the model was unreachable", async () => {
    const ctx = makeContext({ llm: { model: "x", degraded: true, data: null } });
    const r = await nlpContentDetector.run(ctx);
    expect(r.triggered).toBe(false);
    expect(r.tags).toContain("llm-degraded");
  });
});

describe("llm.bec", () => {
  it("stays quiet when is_bec is false", async () => {
    const ctx = makeContext({ llm: makeLlm({ bec: { is_bec: false } }) });
    const r = await becClassifierDetector.run(ctx);
    expect(r.triggered).toBe(false);
  });

  it("flags CEO fraud with out-of-band evasion as high severity", async () => {
    const ctx = makeContext({
      llm: makeLlm({
        bec: {
          is_bec: true,
          subtype: "ceo_fraud",
          confidence: 0.8,
          spoofed_authority: "CEO",
          out_of_band_evasion: true,
          evidence_quotes: ["don't call me, I'm in a meeting"],
        },
      }),
    });
    const r = await becClassifierDetector.run(ctx);
    expect(r.triggered).toBe(true);
    expect(r.tags).toContain("ceo_fraud");
    expect(["high", "critical"]).toContain(r.severity);
  });
});

describe("llm.social", () => {
  it("stays quiet on a low score with no tactics", async () => {
    const ctx = makeContext({ llm: makeLlm({ social: { social_engineering_score: 0.05 } }) });
    const r = await socialEngineeringDetector.run(ctx);
    expect(r.triggered).toBe(false);
  });

  it("flags pretexting with a summary", async () => {
    const ctx = makeContext({
      llm: makeLlm({
        social: {
          social_engineering_score: 0.7,
          tactics: ["pretexting", "urgency_manufacturing"],
          pretext_summary: "Poses as IT support needing password reset",
        },
      }),
    });
    const r = await socialEngineeringDetector.run(ctx);
    expect(r.triggered).toBe(true);
    expect(r.tags).toEqual(["pretexting", "urgency_manufacturing"]);
  });
});
