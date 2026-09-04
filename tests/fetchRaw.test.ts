import { describe, expect, it, vi } from "vitest";
import type { gmail_v1 } from "googleapis";

import { fetchRawMessage } from "@/server/gmail/fetchRaw";

function gmailWith(get: ReturnType<typeof vi.fn>) {
  return { users: { messages: { get } } } as unknown as gmail_v1.Gmail;
}

const ok = { data: { raw: Buffer.from("hi").toString("base64url"), snippet: "s" } };

describe("fetchRawMessage retries", () => {
  it("retries a 429 and succeeds", async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate"), { status: 429 }))
      .mockResolvedValueOnce(ok);
    const res = await fetchRawMessage(gmailWith(get), "id1");
    expect(get).toHaveBeenCalledTimes(2);
    expect(res.raw.toString()).toBe("hi");
  });

  it("retries a 403 only when the reason is a rate limit", async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("slow down"), {
          status: 403,
          errors: [{ reason: "userRateLimitExceeded" }],
        }),
      )
      .mockResolvedValueOnce(ok);
    await expect(fetchRawMessage(gmailWith(get), "id2")).resolves.toBeDefined();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 403 that is a real permission failure", async () => {
    const get = vi.fn().mockRejectedValue(
      Object.assign(new Error("forbidden"), {
        status: 403,
        errors: [{ reason: "insufficientPermissions" }],
      }),
    );
    await expect(fetchRawMessage(gmailWith(get), "id3")).rejects.toThrow("forbidden");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt cap so one message cannot stall a scan", async () => {
    const get = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("nope"), { status: 503 }));
    await expect(fetchRawMessage(gmailWith(get), "id4")).rejects.toThrow("nope");
    expect(get).toHaveBeenCalledTimes(4);
  });
});
