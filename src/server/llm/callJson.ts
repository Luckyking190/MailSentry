import pLimit from "p-limit";
import type { z } from "zod";

import {
  FEATHERLESS_MAX_CONCURRENCY,
  FEATHERLESS_MODEL,
  getLlmClient,
} from "./client";

const limit = pLimit(FEATHERLESS_MAX_CONCURRENCY);

const CALL_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

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
        max_tokens: 1100,
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
        if (s === 429 || (s !== undefined && s >= 500) || s === undefined) {
          if (attempt < MAX_ATTEMPTS) {
            await sleep(attempt * 1500);
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
        return { ok: true, data: parsed.data, repaired: true };
      }
    } catch {
      /* fall through */
    }

    return { ok: false, reason: "unparseable model output" };
  });
}
