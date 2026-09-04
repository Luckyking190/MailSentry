import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/server/db";
import { parseEmail } from "@/server/mail/parse";
import { persistAnalyzedEmail, loadUserSettings } from "@/server/scan/persist";

export type ManifestEntry = {
  file: string;
  label: string;
  category: string;
  expectedBand: string;
  notes?: string;
};

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "eml");

async function readManifest(): Promise<ManifestEntry[]> {
  const raw = await readFile(path.join(FIXTURES_DIR, "manifest.json"), "utf-8");
  return JSON.parse(raw) as ManifestEntry[];
}

export type DemoLoadResult = {
  jobId: string;
  total: number;
  processed: number;
  failed: number;
  bandHistogram: Record<string, number>;
};

/**
 * Load the curated demo mailbox for a user: parses every fixture .eml and
 * runs it through the exact same pipeline as a real Gmail scan. Synchronous
 * (the fixture set is small) so the caller gets a finished result directly.
 */
export async function loadDemoMailbox(userId: string): Promise<DemoLoadResult> {
  const manifest = await readManifest();
  const settings = await loadUserSettings(userId);

  const job = await prisma.scanJob.create({
    data: {
      userId,
      source: "demo",
      phase: "ANALYZING",
      total: manifest.length,
    },
  });

  const histogram: Record<string, number> = {};
  let processed = 0;
  let failed = 0;

  for (const entry of manifest) {
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, entry.file));
      const parsed = await parseEmail(raw);
      const { band } = await persistAnalyzedEmail({
        userId,
        scanJobId: job.id,
        source: "demo",
        externalId: entry.file,
        parsed,
        settings,
      });
      histogram[band] = (histogram[band] ?? 0) + 1;
      processed += 1;
    } catch {
      failed += 1;
    }

    await prisma.scanJob.update({
      where: { id: job.id },
      data: { processed, failed, bandHistogram: histogram },
    });
  }

  await prisma.scanJob.update({
    where: { id: job.id },
    data: { phase: "DONE", finishedAt: new Date() },
  });

  return { jobId: job.id, total: manifest.length, processed, failed, bandHistogram: histogram };
}
