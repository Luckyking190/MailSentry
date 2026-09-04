import { describe, expect, it } from "vitest";

import {
  affinity,
  recency,
  riskPenalty,
  priorityScore,
} from "@/server/priority";

const NOW = Date.UTC(2026, 8, 5);
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000);

const base = {
  read: 0,
  seen: 0,
  sentAt: daysAgo(0),
  isStarred: false,
  isImportant: false,
  riskScore: 0,
};

describe("affinity", () => {
  it("starts an unseen sender at even odds, not zero", () => {
    expect(affinity(0, 0)).toBe(0.5);
  });
  it("rises with reads and falls with ignores", () => {
    expect(affinity(9, 10)).toBeGreaterThan(0.8);
    expect(affinity(0, 10)).toBeLessThan(0.1);
  });
  it("smooths a single observation so it cannot reach an extreme", () => {
    // One read out of one must not outrank a sender read 50 times.
    expect(affinity(1, 1)).toBeLessThan(affinity(50, 50));
  });
});

describe("recency", () => {
  it("is highest today and decays to zero over a fortnight", () => {
    expect(recency(daysAgo(0), NOW)).toBe(1);
    expect(recency(daysAgo(7), NOW)).toBeCloseTo(0.5, 5);
    expect(recency(daysAgo(30), NOW)).toBe(0);
  });
  it("gives undated mail a neutral value", () => {
    expect(recency(null, NOW)).toBe(0.3);
  });
});

describe("riskPenalty", () => {
  it("ignores safe mail and buries critical mail", () => {
    expect(riskPenalty(0)).toBe(0);
    expect(riskPenalty(50)).toBeCloseTo(0.25, 5);
    expect(riskPenalty(100)).toBe(1);
  });
  it("treats an unscored email as unpenalized", () => {
    expect(riskPenalty(null)).toBe(0);
  });
});

describe("priorityScore", () => {
  it("stays within 0-100", () => {
    const hi = priorityScore(
      { ...base, read: 100, seen: 100, isStarred: true, riskScore: 0 },
      NOW,
    );
    const lo = priorityScore(
      { ...base, read: 0, seen: 100, sentAt: daysAgo(60), riskScore: 100 },
      NOW,
    );
    expect(hi).toBeLessThanOrEqual(100);
    expect(lo).toBe(0);
  });

  it("ranks a read sender above one the user ignores", () => {
    const read = priorityScore({ ...base, read: 20, seen: 20 }, NOW);
    const ignored = priorityScore({ ...base, read: 0, seen: 20 }, NOW);
    expect(read).toBeGreaterThan(ignored);
  });

  it("buries a dangerous mail even from a sender the user always reads", () => {
    // The whole point of the risk penalty: a convincing phish from a trusted
    // sender must not top the list just because that sender is usually read.
    const trustedSafe = priorityScore({ ...base, read: 50, seen: 50 }, NOW);
    const trustedPhish = priorityScore(
      { ...base, read: 50, seen: 50, riskScore: 95 },
      NOW,
    );
    expect(trustedPhish).toBeLessThan(trustedSafe);
  });

  it("lifts mail the user explicitly starred or Gmail marked important", () => {
    const plain = priorityScore(base, NOW);
    expect(priorityScore({ ...base, isStarred: true }, NOW)).toBeGreaterThan(plain);
    expect(priorityScore({ ...base, isImportant: true }, NOW)).toBeGreaterThan(plain);
  });
});
