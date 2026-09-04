import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseEmail } from "@/server/mail/parse";
import { runPipeline } from "@/server/detect/pipeline";
import { BAND_ORDER } from "@/lib/scoring";
import type { RiskBand } from "@prisma/client";

type ManifestEntry = {
  file: string;
  label: string;
  category: string;
  expectedBand: RiskBand;
};

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "eml");

function bandRank(b: RiskBand): number {
  return BAND_ORDER.indexOf(b); // CRITICAL=0 ... SAFE=4
}

/**
 * Full-pipeline "golden" test over the demo mailbox fixtures. Touches real
 * DNS (SPF/RDAP) and a (deliberately unreachable) DB — every intel module
 * fails soft on the DB and degrades gracefully on DNS, so this asserts a
 * *band within ±1* of the curated expectation rather than an exact match,
 * to stay robust against transient DNS/SPF answers in CI.
 */
describe("demo fixtures — golden scoring", () => {
  it("matches curated expectations within one band", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(FIXTURES_DIR, "manifest.json"), "utf-8"),
    ) as ManifestEntry[];

    expect(manifest.length).toBeGreaterThanOrEqual(10);

    const results: string[] = [];
    for (const entry of manifest) {
      const raw = await readFile(path.join(FIXTURES_DIR, entry.file));
      const parsed = await parseEmail(raw);
      const outcome = await runPipeline({
        email: parsed,
        userId: "golden-test",
        settings: {},
      });

      const diff = Math.abs(bandRank(outcome.band) - bandRank(entry.expectedBand));
      if (diff > 1) {
        results.push(
          `${entry.file}: expected ${entry.expectedBand}, got ${outcome.band} (${outcome.score})`,
        );
      }
    }

    expect(results, results.join("\n")).toEqual([]);
  }, 60_000);
});
