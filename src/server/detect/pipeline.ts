import type { ParsedEmail } from "@/server/mail/types";
import { buildContext, resolveSettings } from "./context";
import { aggregate } from "./aggregate";
import { composeSummary } from "./explain";
import { DETERMINISTIC_DETECTORS } from "./registry";
import type {
  AnalysisOutcome,
  DetectorContext,
  DetectorResult,
  ResolvedSettings,
} from "./types";

export const ENGINE_VERSION = "pipeline-3";

export type PipelineInput = {
  email: ParsedEmail;
  userId: string;
  settings: Parameters<typeof resolveSettings>[0];
};

export async function runPipeline(
  input: PipelineInput,
): Promise<AnalysisOutcome> {
  const settings: ResolvedSettings = resolveSettings(input.settings);
  const ctx: DetectorContext = await buildContext(
    input.email,
    input.userId,
    settings,
  );

  const results = await runDetectors(ctx);

  const weightFor = (id: string) =>
    settings.detectorWeights[id] ??
    DETERMINISTIC_DETECTORS.find((d) => d.id === id)?.defaultWeight ??
    0.1;

  const { score, band, categories, signals } = aggregate(
    results,
    ctx,
    weightFor,
  );
  const summary = composeSummary(band, score, signals);

  return {
    score,
    band,
    categories,
    summary,
    signals,
    engineVersion: ENGINE_VERSION,
  };
}

async function runDetectors(
  ctx: DetectorContext,
): Promise<DetectorResult[]> {
  const settled = await Promise.allSettled(
    DETERMINISTIC_DETECTORS.map(async (d) => {
      try {
        return await d.run(ctx);
      } catch {
        return safeEmpty(d.id, d.category);
      }
    }),
  );

  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : safeEmpty(
          DETERMINISTIC_DETECTORS[i].id,
          DETERMINISTIC_DETECTORS[i].category,
        ),
  );
}

function safeEmpty(
  detectorId: string,
  category: DetectorResult["category"],
): DetectorResult {
  return {
    detectorId,
    category,
    triggered: false,
    score: 0,
    confidence: 0,
    severity: "info",
    evidence: [{ label: "Detector error", value: "skipped", kind: "fact" }],
  };
}
