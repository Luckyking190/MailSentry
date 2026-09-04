import OpenAI from "openai";

export const FEATHERLESS_BASE_URL =
  process.env.FEATHERLESS_BASE_URL ?? "https://api.featherless.ai/v1";
export const FEATHERLESS_MODEL =
  process.env.FEATHERLESS_MODEL ?? "Qwen/Qwen2.5-72B-Instruct";
export const FEATHERLESS_MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.FEATHERLESS_MAX_CONCURRENCY ?? 3),
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
