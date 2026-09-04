import type { Detector, DetectorResult, Evidence } from "../types";
import { severityFromScore } from "./_util";

const HIGH_RISK = new Set([
  "exe", "bat", "cmd", "js", "jse", "vbs", "vbe", "scr", "ps1", "psm1",
  "jar", "hta", "lnk", "iso", "img", "msi", "msix", "com", "pif", "reg",
  "wsf", "cpl", "gadget",
]);
const ARCHIVE = new Set(["zip", "rar", "7z", "gz", "bz2", "tar", "cab", "ace", "arj"]);
const DOUBLE_EXT_RE =
  /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|txt|csv|html?)\.(exe|scr|js|jse|bat|cmd|vbs|ps1|com|pif|hta|lnk|iso|msi)$/i;

export const attachmentBasicDetector: Detector = {
  id: "attachment.basic",
  category: "malicious_attachment",
  defaultWeight: 0.16,

  run(ctx): DetectorResult {
    const atts = ctx.email.attachments;
    if (atts.length === 0) return none();

    const evidence: Evidence[] = [];
    let score = 0;

    for (const a of atts) {
      const ext = a.extension?.toLowerCase() ?? "";
      if (DOUBLE_EXT_RE.test(a.filename)) {
        score = Math.max(score, 1);
        evidence.push({
          label: "Double extension",
          value: `${a.filename} — a document name masking an executable`,
          kind: "fact",
          ref: a.filename,
        });
      } else if (HIGH_RISK.has(ext)) {
        score = Math.max(score, 0.88);
        evidence.push({
          label: "Executable attachment",
          value: `${a.filename} (.${ext})`,
          kind: "fact",
          ref: a.filename,
        });
      } else if (ARCHIVE.has(ext)) {
        score = Math.max(score, 0.32);
        evidence.push({
          label: "Archive attachment",
          value: `${a.filename} — archives can conceal executables from scanners`,
          kind: "fact",
          ref: a.filename,
        });
      } else if (
        a.contentType &&
        ext &&
        !a.contentType.includes(ext) &&
        /application\/(octet-stream|x-msdownload)/.test(a.contentType)
      ) {
        score = Math.max(score, 0.45);
        evidence.push({
          label: "Type / extension mismatch",
          value: `${a.filename} is served as ${a.contentType}`,
          kind: "comparison",
          ref: a.filename,
        });
      }
    }

    return {
      detectorId: "attachment.basic",
      category: "malicious_attachment",
      triggered: score > 0,
      score,
      confidence: 0.9,
      severity: severityFromScore(score),
      evidence,
    };
  },
};

function none(): DetectorResult {
  return {
    detectorId: "attachment.basic",
    category: "malicious_attachment",
    triggered: false,
    score: 0,
    confidence: 0.95,
    severity: "info",
    evidence: [],
  };
}
