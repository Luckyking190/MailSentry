import type { gmail_v1 } from "googleapis";

/**
 * List message IDs for the user's mailbox, newest first, up to `max`.
 * `windowDays` maps to Gmail's `newer_than:` search operator.
 */
export async function listMessageIds(
  gmail: gmail_v1.Gmail,
  opts: { max: number; windowDays: number; query?: string },
): Promise<string[]> {
  const q = [
    `newer_than:${Math.max(1, opts.windowDays)}d`,
    "-in:chats",
    opts.query ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < opts.max) {
    const res = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: Math.min(500, opts.max - ids.length),
      pageToken,
    });

    for (const m of res.data.messages ?? []) {
      if (m.id) ids.push(m.id);
    }

    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  return ids.slice(0, opts.max);
}
