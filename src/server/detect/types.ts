import type { RiskBand } from "@prisma/client";
import type { BandThresholds, SignalCategory } from "@/lib/scoring";
import type { ParsedEmail } from "@/server/mail/types";
import type { ReceivedChain } from "@/server/intel/received-chain";
import type { LlmAnalysis } from "@/server/llm/analyze";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type Evidence = {
  label: string;
  value: string;
  kind: "fact" | "quote" | "metric" | "comparison";
  ref?: string;
};

export type DetectorResult = {
  detectorId: string;
  category: SignalCategory;
  triggered: boolean;
  /** 0..1 detector-native severity */
  score: number;
  /** 0..1 certainty */
  confidence: number;
  severity: Severity;
  evidence: Evidence[];
  tags?: string[];
};

export type ScoredSignal = DetectorResult & {
  weight: number;
  contribution: number;
};

export type UrlArtifact = {
  rawUrl: string;
  finalUrl: string | null;
  host: string | null;
  scheme: string | null;
  anchorText: string | null;
  anchorMismatch: boolean;
  isShortener: boolean;
  isPunycode: boolean;
  redirectChain: unknown[];
  lengthScore: number | null;
  entropyScore: number | null;
  domainAgeDays: number | null;
  verdict: "safe" | "suspicious" | "malicious" | "unknown" | null;
};

export type AttachmentArtifact = {
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  extension: string | null;
  isHighRisk: boolean;
  isDoubleExt: boolean;
  isArchive: boolean;
};

export type ArtifactSink = {
  urls: UrlArtifact[];
  attachments: AttachmentArtifact[];
};

export type AnalysisOutcome = {
  score: number;
  band: RiskBand;
  categories: SignalCategory[];
  summary: string;
  signals: ScoredSignal[];
  engineVersion: string;
  llmModel?: string | null;
  llmDegraded?: boolean;
  artifacts: ArtifactSink;
};

/** SPF/DKIM/DMARC verdicts as parsed from a provider-stamped Authentication-Results. */
export type AuthVerdict =
  | "pass"
  | "fail"
  | "softfail"
  | "neutral"
  | "none"
  | "temperror"
  | "permerror"
  | "policy"
  | "bestguesspass"
  | null;

export type ParsedAuthResults = {
  raw: string | null;
  spf: AuthVerdict;
  spfDomain: string | null;
  dkim: AuthVerdict;
  dkimDomain: string | null;
  dmarc: AuthVerdict;
  dmarcDomain: string | null;
};

export type ResolvedSettings = {
  detectorWeights: Record<string, number>;
  bandThresholds: BandThresholds;
  brandWatchlist: string[];
  enableLlm: boolean;
};

export type DetectorContext = {
  email: ParsedEmail;
  userId: string;
  settings: ResolvedSettings;
  received: ReceivedChain;
  /** Detectors push enriched URL / attachment rows here; the worker persists them. */
  sink: ArtifactSink;
  /** Provider-stamped Authentication-Results, parsed. */
  authResults: ParsedAuthResults;
  /** Our own SPF re-check against DNS + the originating IP. */
  spfCheck: {
    result: AuthVerdict;
    domain: string | null;
    clientIp: string | null;
    record: string | null;
    comment: string | null;
  } | null;
  /** Featherless combined analysis, or null when the LLM layer is disabled. */
  llm: LlmAnalysis | null;
};

export interface Detector {
  id: string;
  category: SignalCategory;
  /** 0..1; sum across detectors need not be 1 (normalised later). */
  defaultWeight: number;
  run(ctx: DetectorContext): Promise<DetectorResult> | DetectorResult;
}
