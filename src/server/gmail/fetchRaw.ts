import type { gmail_v1 } from "googleapis";

export type RawMessage = {
  gmailId: string;
  raw: Buffer;
  snippet: string | null;
  internalDate: Date | null;
  labelIds: string[];
};

/** Fetch a single message as raw RFC 822 bytes (base64url in the API). */
export async function fetchRawMessage(
  gmail: gmail_v1.Gmail,
  id: string,
): Promise<RawMessage> {
  const res = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "raw",
  });

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
