import type { Detector, DetectorResult, Evidence } from "../types";
import { severityFromScore } from "./_util";

const SUBTYPE_LABEL: Record<string, string> = {
  payment_diversion: "Payment diversion",
  fake_invoice: "Fake invoice",
  ceo_fraud: "CEO fraud",
  payroll_change: "Payroll change request",
  vendor_fraud: "Vendor fraud",
  gift_card_request: "Gift card request",
  wire_transfer: "Wire transfer request",
  w2_data_request: "Tax/W2 data request",
};

export const becClassifierDetector: Detector = {
  id: "llm.bec",
  category: "bec",
  defaultWeight: 0.19,

  run(ctx): DetectorResult {
    if (!ctx.llm) return quiet();
    if (!ctx.llm.data) return quiet();

    const b = ctx.llm.data.bec;
    if (!b.is_bec || b.subtype === "none") return quiet();

    const evidence: Evidence[] = [
      {
        label: SUBTYPE_LABEL[b.subtype] ?? "BEC pattern",
        value: b.rationale || `classified as ${b.subtype}`,
        kind: "fact",
      },
    ];
    let score = Math.max(b.confidence, 0.5);

    if (b.spoofed_authority) {
      score = Math.max(score, 0.65);
      evidence.push({ label: "Impersonated authority", value: b.spoofed_authority, kind: "fact" });
    }
    if (b.target_action) {
      evidence.push({ label: "Requested action", value: b.target_action, kind: "fact" });
    }
    if (b.monetary_amount) {
      score = Math.max(score, 0.6);
      evidence.push({ label: "Monetary amount", value: b.monetary_amount, kind: "metric" });
    }
    if (b.urgency_pressure) score = Math.max(score, 0.6);
    if (b.out_of_band_evasion) {
      score = Math.max(score, 0.75);
      evidence.push({
        label: "Avoids verification",
        value: "discourages calling or checking through normal channels",
        kind: "fact",
      });
    }
    for (const q of b.evidence_quotes.slice(0, 2)) {
      evidence.push({ label: "Quote", value: `"${q}"`, kind: "quote" });
    }

    return {
      detectorId: "llm.bec",
      category: "bec",
      triggered: true,
      score,
      confidence: 0.75,
      severity: severityFromScore(score),
      evidence: evidence.slice(0, 8),
      tags: [b.subtype],
    };
  },
};

function quiet(): DetectorResult {
  return {
    detectorId: "llm.bec",
    category: "bec",
    triggered: false,
    score: 0,
    confidence: 0,
    severity: "info",
    evidence: [],
  };
}
