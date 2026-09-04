import type { gmail_v1 } from "googleapis";

export type RawMessage = {
  gmailId: string;
  raw: Buffer;
  snippet: string | null;
  internalDate: Date | null;
  labelIds: string[];
};

/**
 * Gmail throttles per user (429, or 403 with a rateLimitExceeded reason) well
 * before its documented quota when many `messages.get` calls are in flight.
 * Unlike the LLM provider, a retry here is cheap and does get served — and a
 * dropped message is a hole in the user's threat report, not just a slower
 * scan — so back off briefly and try again.
 */
const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

function retryable(err: unknown): boolean {
  const e = err as { status?: number; code?: number; errors?: { reason?: string }[] };
  const status = e?.status ?? e?.code;
  if (typeof status !== "number" || !RETRY_STATUSES.has(status)) return false;
  // A 403 is only transient when it's a rate-limit reason; a real permission
  // failure must surface rather than be retried four times.
  if (status === 403) {
    return (e.errors ?? []).some((x) =>
      /rateLimitExceeded|userRateLimitExceeded|backendError/i.test(x.reason ?? ""),
    );
  }
  return true;
}

/** Fetch a single message as raw RFC 822 bytes (base64url in the API). */
export async function fetchRawMessage(
  gmail: gmail_v1.Gmail,
  id: string,
): Promise<RawMessage> {
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await gmail.users.messages.get({ userId: "me", id, format: "raw" });
      break;
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !retryable(err)) throw err;
      // Exponential with jitter so a throttled batch doesn't retry in lockstep.
      const backoff = 250 * 2 ** (attempt - 1) * (0.5 + Math.random());
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  const data = res.data;
  const raw = Buffer.from(data.raw ?? "", "base64url");

  return {
    gmailId: id,
    raw,
    snippet: data.snippet ? decodeEntities(data.snippet) : null,
    internalDate: data.internalDate
      ? new Date(Number(data.internalDate))
      : null,
    labelIds: data.labelIds ?? [],
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
