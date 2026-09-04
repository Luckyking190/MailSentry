import type { Detector, DetectorResult, Evidence } from "../types";
import { severityFromScore } from "./_util";

const HIGH_RISK = new Set([
  "exe", "bat", "cmd", "js", "jse", "vbs", "vbe", "wsf", "wsh", "scr",
  "ps1", "psm1", "psc1", "jar", "hta", "lnk", "iso", "img", "vhd",
  "msi", "msix", "appx", "com", "pif", "reg", "cpl", "gadget", "inf",
]);
const MACRO_DOCS = new Set(["docm", "xlsm", "pptm", "dotm", "xltm", "xlam"]);
const ARCHIVE = new Set(["zip", "rar", "7z", "gz", "bz2", "tar", "cab", "ace", "arj", "z", "lzh"]);
const DOUBLE_EXT_RE =
  /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|bmp|txt|csv|html?|xml|json)\.(exe|scr|js|jse|bat|cmd|vbs|vbe|ps1|com|pif|hta|lnk|iso|msi|jar|wsf)$/i;
// U+202E and friends — right-to-left override used to disguise "…exe.doc"
const RTL_OVERRIDE_RE = /[‪-‮⁦-⁩]/;

export const attachmentAnalysisDetector: Detector = {
  id: "attachment.analysis",
  category: "malicious_attachment",
  defaultWeight: 0.17,

  run(ctx): DetectorResult {
    const atts = ctx.email.attachments;
    if (atts.length === 0) {
      return quiet();
    }

    const evidence: Evidence[] = [];
    let score = 0;

    for (const a of atts) {
      const ext = a.extension?.toLowerCase() ?? "";
      const isDoubleExt = DOUBLE_EXT_RE.test(a.filename);
      const isHighRisk = HIGH_RISK.has(ext);
      const isArchive = ARCHIVE.has(ext);

      if (RTL_OVERRIDE_RE.test(a.filename)) {
        score = Math.max(score, 0.95);
        evidence.push({
          label: "Right-to-left filename trick",
          value: `${a.filename.replace(RTL_OVERRIDE_RE, "█")} hides its true extension`,
          kind: "fact",
          ref: a.filename,
        });
      }
      if (isDoubleExt) {
        score = Math.max(score, 1);
        evidence.push({
          label: "Double extension",
          value: `${a.filename} — a document name masking an executable`,
          kind: "fact",
          ref: a.filename,
        });
      } else if (isHighRisk) {
        score = Math.max(score, 0.9);
        evidence.push({
          label: "Executable attachment",
          value: `${a.filename} (.${ext})`,
          kind: "fact",
          ref: a.filename,
        });
      } else if (MACRO_DOCS.has(ext)) {
        score = Math.max(score, 0.6);
        evidence.push({
          label: "Macro-enabled document",
          value: `${a.filename} (.${ext}) can run code on open`,
          kind: "fact",
          ref: a.filename,
        });
      } else if (isArchive) {
        score = Math.max(score, 0.34);
        evidence.push({
          label: "Archive attachment",
          value: `${a.filename} — archives can conceal executables and evade scanners`,
          kind: "fact",
          ref: a.filename,
        });
      } else if (
        a.contentType &&
        /application\/(octet-stream|x-msdownload|x-dosexec)/i.test(a.contentType)
      ) {
        score = Math.max(score, 0.5);
        evidence.push({
          label: "Binary attachment",
          value: `${a.filename} served as ${a.contentType}`,
          kind: "comparison",
          ref: a.filename,
        });
      }

      ctx.sink.attachments.push({
        filename: a.filename,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
        extension: a.extension,
        isHighRisk: isHighRisk || isDoubleExt,
        isDoubleExt,
        isArchive,
      });
    }

    return {
      detectorId: "attachment.analysis",
      category: "malicious_attachment",
      triggered: score > 0,
      score,
      confidence: 0.9,
      severity: severityFromScore(score),
      evidence,
    };
  },
};

function quiet(): DetectorResult {
  return {
    detectorId: "attachment.analysis",
    category: "malicious_attachment",
    triggered: false,
    score: 0,
    confidence: 0.95,
    severity: "info",
    evidence: [],
  };
}
