import type { RiskBand } from "@prisma/client";
import type { SignalCategory } from "@/lib/scoring";

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

export type AnalysisOutcome = {
  score: number;
  band: RiskBand;
  categories: SignalCategory[];
  summary: string;
  signals: Array<
    DetectorResult & { weight: number; contribution: number }
  >;
  engineVersion: string;
  llmModel?: string | null;
  llmDegraded?: boolean;
};
