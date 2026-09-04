import { describe, expect, it, vi } from "vitest";

import { singleFlight } from "@/server/intel/single-flight";

describe("singleFlight", () => {
  it("runs the work once for concurrent callers and gives them all the result", async () => {
    const work = vi.fn(
      () => new Promise<string>((r) => setTimeout(() => r("value"), 20)),
    );
    const results = await Promise.all(
      Array.from({ length: 8 }, () => singleFlight("k", work)),
    );
    expect(work).toHaveBeenCalledTimes(1);
    expect(results).toEqual(Array(8).fill("value"));
  });

  it("does not keep the entry after settling, so later callers re-run", async () => {
    const work = vi.fn(async () => "v");
    await singleFlight("k2", work);
    await singleFlight("k2", work);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("propagates a rejection to every concurrent caller without caching it", async () => {
    const work = vi.fn(async () => {
      throw new Error("boom");
    });
    const settled = await Promise.allSettled([
      singleFlight("k3", work),
      singleFlight("k3", work),
    ]);
    expect(work).toHaveBeenCalledTimes(1);
    expect(settled.every((s) => s.status === "rejected")).toBe(true);
    await expect(singleFlight("k3", async () => "ok")).resolves.toBe("ok");
  });
});
