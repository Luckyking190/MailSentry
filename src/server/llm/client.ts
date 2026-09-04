import OpenAI from "openai";

export const FEATHERLESS_BASE_URL =
  process.env.FEATHERLESS_BASE_URL ?? "https://api.featherless.ai/v1";
// Featherless bills concurrency in per-model "units", not a flat request
// count: 70B-class models cost ~4 units/request (so a 4-unit plan can only
// run ONE at a time — every additional "concurrent" call just 429s and
// burns a retry), while <=15B models cost ~1 unit/request, giving up to 4x
// the real throughput on the same plan. Default to a small/fast model for
// responsive scans; override via env for a quality/latency tradeoff on a
// larger plan.
export const FEATHERLESS_MODEL =
  process.env.FEATHERLESS_MODEL ?? "Qwen/Qwen2.5-14B-Instruct";
// Kept one unit below a typical 4-unit plan on purpose: a client-side abort
// does NOT release the provider's concurrency unit straight away, so running
// right at the ceiling makes one slow call cascade into 429s for everything
// behind it.
export const FEATHERLESS_MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.FEATHERLESS_MAX_CONCURRENCY ?? 4),
);

export function llmEnabled(): boolean {
  return !!process.env.FEATHERLESS_API_KEY;
}

let client: OpenAI | null = null;

export function getLlmClient(): OpenAI {
  if (!process.env.FEATHERLESS_API_KEY) {
    throw new Error("FEATHERLESS_API_KEY is not set");
  }
  client ??= new OpenAI({
    apiKey: process.env.FEATHERLESS_API_KEY,
    baseURL: FEATHERLESS_BASE_URL,
    maxRetries: 0, // we handle retries + backoff ourselves
  });
  return client;
}
