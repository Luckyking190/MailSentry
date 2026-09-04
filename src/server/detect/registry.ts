import type { Detector } from "./types";

import { authSpfDetector } from "./detectors/auth-spf";
import { authDkimDmarcDetector } from "./detectors/auth-dkim-dmarc";
import { senderImpersonationDetector } from "./detectors/sender-impersonation";
import { lookalikeDomainDetector } from "./detectors/lookalike-domain";
import { headerAnomalyDetector } from "./detectors/header-anomaly";
import { attachmentAnalysisDetector } from "./detectors/attachment-analysis";
import { urlAnalysisDetector } from "./detectors/url-analysis";
import { contentHeuristicDetector } from "./detectors/content-heuristic";

/** Ordered detector list. LLM-backed detectors are appended in Phase 5. */
export const DETERMINISTIC_DETECTORS: Detector[] = [
  authSpfDetector,
  authDkimDmarcDetector,
  senderImpersonationDetector,
  lookalikeDomainDetector,
  headerAnomalyDetector,
  attachmentAnalysisDetector,
  urlAnalysisDetector,
  contentHeuristicDetector,
];

export const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  DETERMINISTIC_DETECTORS.map((d) => [d.id, d.defaultWeight]),
);
