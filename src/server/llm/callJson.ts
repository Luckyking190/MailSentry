import pLimit from "p-limit";
import type { z } from "zod";

import {
  FEATHERLESS_MAX_CONCURRENCY,
  FEATHERLESS_MODEL,
  getLlmClient,
} from "./client";

const limit = pLimit(FEATHERLESS_MAX_CONCURRENCY);

// <=15B-class models on Featherless normally answer a full email-analysis
// prompt in 1-3s, so 8s is already 3x headroom. Past that the provider is
// congested, and since a client abort doesn't hand its concurrency unit back,
// retrying only deepens the hole — bail to a deterministic-only score.
const CALL_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 2;

// Congestion is a property of the provider, not of one message. Without this,
// every email in a batch independently spends its full timeout rediscovering
// the same outage — measured as 50s for 6 messages. After a few consecutive
// failures, stop asking for a bit and let the deterministic detectors carry
// the scan; one success closes it again.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

function breakerOpen(): boolean {
  if (Date.now() < breakerOpenUntil) return true;
  if (breakerOpenUntil) {
    // cooldown elapsed — allow a probe through
    breakerOpenUntil = 0;
    consecutiveFailures = 0;
  }
  return false;
}

function recordFailure() {
  if (++consecutiveFailures >= BREAKER_THRESHOLD) {
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
  }
}

export type JsonCallResult<T> =
  | { ok: true; data: T; repaired: boolean }
  | { ok: false; reason: string };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pull the first balanced JSON object out of a model response. */
export function extractJson(text: string): string | null {
  const stripped = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = stripped.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < stripped.length; i++) {
    const c = stripped[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }
  return null;
}

type ChatMsg = { role: "system" | "user"; content: string };

async function rawCall(
  messages: ChatMsg[],
  useJsonMode: boolean,
): Promise<string> {
  const client = getLlmClient();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await client.chat.completions.create(
      {
        model: FEATHERLESS_MODEL,
        messages,
        temperature: 0.1,
        top_p: 0.9,
        // The combined content/bec/social object lands around 300 tokens;
        // generation time scales with output length, so don't leave room to
        // ramble.
        max_tokens: 700,
        ...(useJsonMode
          ? { response_format: { type: "json_object" as const } }
          : {}),
      },
      { signal: ac.signal },
    );
    return res.choices[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

function status(err: unknown): number | undefined {
  return typeof err === "object" && err && "status" in err
    ? (err as { status?: number }).status
    : undefined;
}

/**
 * Call the model, expecting JSON that matches `schema`.
 * best-effort json_object mode (retry without it on HTTP 400) → extract →
 * Zod safeParse → one repair call → degraded failure.
 */
export async function callJson<T>(
  schema: z.ZodType<T>,
  system: string,
  user: string,
  repair: (bad: string) => { system: string; user: string },
): Promise<JsonCallResult<T>> {
  if (breakerOpen()) return { ok: false, reason: "provider congested" };

  return limit(async () => {
    let jsonMode = true;
    let lastRaw = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        lastRaw = await rawCall(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          jsonMode,
        );
        const candidate = extractJson(lastRaw) ?? lastRaw;
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(candidate);
        } catch {
          parsedJson = undefined;
        }
        if (parsedJson !== undefined) {
          const parsed = schema.safeParse(parsedJson);
          if (parsed.success) {
            consecutiveFailures = 0;
            return { ok: true, data: parsed.data, repaired: false };
          }
        }
        break; // got a response but it didn't parse — go to repair
      } catch (err) {
        const s = status(err);
        if (s === 400 && jsonMode) {
          jsonMode = false; // model/endpoint rejects json_object — retry plain
          continue;
        }
        // 429 here means the *provider's* concurrency budget is exhausted,
        // not that we sent too many ourselves (p-limit already caps that).
        // Aborting/retrying does not hand the unit back any sooner, so a
        // retry storm only deepens the hole and stalls the whole scan.
        // Give it one brief chance, then fall back to a deterministic-only
        // score for this message — the scan keeps moving.
        if (s === 429) {
          if (attempt === 1) {
            await sleep(1200);
            continue;
          }
          recordFailure();
          return { ok: false, reason: "capacity (429)" };
        }
        // A timeout (abort — no status) already cost us the full budget and
        // its concurrency unit is still held provider-side; retrying just
        // spends another budget to learn the same thing.
        if (s === undefined) {
          recordFailure();
          return { ok: false, reason: "timeout" };
        }
        if (s >= 500) {
          if (attempt < MAX_ATTEMPTS) {
            await sleep(attempt * 800);
            continue;
          }
        }
        return { ok: false, reason: `request failed${s ? ` (${s})` : ""}` };
      }
    }

    // Repair pass.
    try {
      const rp = repair(lastRaw);
      const repaired = await rawCall(
        [
          { role: "system", content: rp.system },
          { role: "user", content: rp.user },
        ],
        false,
      );
      const candidate = extractJson(repaired) ?? repaired;
      const parsed = schema.safeParse(JSON.parse(candidate));
      if (parsed.success) {
        consecutiveFailures = 0;
        return { ok: true, data: parsed.data, repaired: true };
      }
    } catch {
      /* fall through */
    }

    recordFailure();
    return { ok: false, reason: "unparseable model output" };
  });
}
