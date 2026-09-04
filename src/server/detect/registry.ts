import type { Detector } from "./types";

import { authSpfDetector } from "./detectors/auth-spf";
import { authDkimDmarcDetector } from "./detectors/auth-dkim-dmarc";
import { senderImpersonationDetector } from "./detectors/sender-impersonation";
import { lookalikeDomainDetector } from "./detectors/lookalike-domain";
import { headerAnomalyDetector } from "./detectors/header-anomaly";
import { attachmentAnalysisDetector } from "./detectors/attachment-analysis";
import { urlAnalysisDetector } from "./detectors/url-analysis";
import { contentHeuristicDetector } from "./detectors/content-heuristic";
import { nlpContentDetector } from "./detectors/nlp-content";
import { becClassifierDetector } from "./detectors/bec-classifier";
import { socialEngineeringDetector } from "./detectors/social-engineering";

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

/** Featherless-backed; no-op (untriggered) when the LLM layer is disabled. */
export const LLM_DETECTORS: Detector[] = [
  nlpContentDetector,
  becClassifierDetector,
  socialEngineeringDetector,
];

export const ALL_DETECTORS: Detector[] = [
  ...DETERMINISTIC_DETECTORS,
  ...LLM_DETECTORS,
];

export const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  ALL_DETECTORS.map((d) => [d.id, d.defaultWeight]),
);
