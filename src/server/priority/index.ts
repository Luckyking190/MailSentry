import { prisma } from "@/server/db";

/**
 * Priority index — "how much does this user want to see this mail?"
 *
 * The learned half is a per-sender read rate, smoothed so a sender with one
 * observation cannot swing the score. The rest is recency, explicit user
 * signals (star / Gmail "important"), and a penalty that pushes dangerous mail
 * DOWN rather than up: a convincing phishing mail from a sender you always read
 * would otherwise score highest, which is exactly backwards for this product.
 *
 * Deliberately statistical, not a neural net: it is meaningful from the first
 * scan, costs no API call, and every number it produces can be explained.
 */

/** Laplace/beta smoothing: an unseen sender starts at 0.5, not 0 or 1. */
export function affinity(read: number, seen: number): number {
  return (read + 1) / (seen + 2);
}

/** 1.0 today, decaying to ~0 over a fortnight. */
export function recency(sentAt: Date | null, now: number = Date.now()): number {
  if (!sentAt) return 0.3;
  const days = (now - sentAt.getTime()) / 86_400_000;
  if (days <= 0) return 1;
  return Math.max(0, 1 - days / 14);
}

/**
 * Risk drags priority down, steeply at the top of the scale. A SAFE mail is
 * untouched; a CRITICAL one is buried regardless of how much the user likes
 * the sender, because it belongs in the threat feed, not the "read this" list.
 */
export function riskPenalty(score: number | null | undefined): number {
  if (score == null) return 0;
  const s = Math.min(100, Math.max(0, score)) / 100;
  return s * s; // 0 at safe, 0.25 at 50, 1.0 at 100
}

export type PriorityInput = {
  read: number;
  seen: number;
  sentAt: Date | null;
  isStarred: boolean;
  isImportant: boolean;
  riskScore: number | null;
};

/** 0-100. */
export function priorityScore(input: PriorityInput, now?: number): number {
  const explicit = input.isStarred || input.isImportant ? 1 : 0;
  const raw =
    0.5 * affinity(input.read, input.seen) +
    0.3 * recency(input.sentAt, now) +
    0.2 * explicit -
    riskPenalty(input.riskScore);

  return Math.round(Math.min(1, Math.max(0, raw)) * 100);
}

/**
 * Fold a freshly scanned batch into the per-sender counters.
 *
 * `isUnread` is inverted into a "read" count: Gmail drops the UNREAD label the
 * moment a message is opened, so absence of the label is the read signal.
 * Counters are incremented rather than recomputed so the statistics survive
 * the mailbox wipe on sign-out and keep accumulating across sessions.
 */
export async function recordEngagement(
  userId: string,
  rows: { senderDomain: string; isUnread: boolean; isStarred: boolean }[],
): Promise<void> {
  const bySender = new Map<string, { seen: number; read: number; starred: number }>();
  for (const r of rows) {
    const key = r.senderDomain.toLowerCase();
    if (!key) continue;
    const acc = bySender.get(key) ?? { seen: 0, read: 0, starred: 0 };
    acc.seen += 1;
    if (!r.isUnread) acc.read += 1;
    if (r.isStarred) acc.starred += 1;
    bySender.set(key, acc);
  }

  await Promise.all(
    [...bySender.entries()].map(([sender, acc]) =>
      prisma.senderEngagement
        .upsert({
          where: { userId_sender: { userId, sender } },
          create: {
            userId,
            sender,
            seen: acc.seen,
            read: acc.read,
            starred: acc.starred,
          },
          update: {
            seen: { increment: acc.seen },
            read: { increment: acc.read },
            starred: { increment: acc.starred },
            lastSeenAt: new Date(),
          },
        })
        .catch(() => {
          // A counter is a nice-to-have; never fail a scan over one.
        }),
    ),
  );
}

/** Current per-sender counts, for scoring a batch without N queries. */
export async function engagementFor(
  userId: string,
  senders: string[],
): Promise<Map<string, { read: number; seen: number }>> {
  const unique = [...new Set(senders.map((s) => s.toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return new Map();

  const rows = await prisma.senderEngagement
    .findMany({
      where: { userId, sender: { in: unique } },
      select: { sender: true, read: true, seen: true },
    })
    .catch(() => []);

  return new Map(rows.map((r) => [r.sender, { read: r.read, seen: r.seen }]));
}
