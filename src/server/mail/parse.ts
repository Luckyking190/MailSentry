import { simpleParser } from "mailparser";
import { getDomain } from "tldts";

import type { ExtractedUrl, ParsedAttachment, ParsedEmail } from "./types";

const MAX_TEXT = 32_000;
const MAX_HTML = 64_000;

function truncate(s: string | undefined | null, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function extractExtension(filename: string): string | null {
  const m = filename.toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return m ? m[1] : null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function schemeOf(url: string): string | null {
  const m = url.match(/^([a-z][a-z0-9+.-]*):/i);
  return m ? m[1].toLowerCase() : null;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]}]+/gi;
const HREF_RE = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

function collectUrls(text: string | null, html: string | null): ExtractedUrl[] {
  const seen = new Map<string, ExtractedUrl>();

  const add = (raw: string, anchorText: string | null) => {
    const rawUrl = raw.replace(/[.,;:!?)\]}'"]+$/, "").trim();
    if (!/^https?:\/\//i.test(rawUrl)) return;
    const key = `${rawUrl}::${anchorText ?? ""}`;
    if (seen.has(key)) return;
    seen.set(key, {
      rawUrl,
      host: hostOf(rawUrl),
      scheme: schemeOf(rawUrl),
      anchorText,
    });
  };

  if (html) {
    for (const m of html.matchAll(HREF_RE)) {
      const href = m[1];
      const anchor = m[2]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      add(href, anchor || null);
    }
    // bare URLs sitting in HTML text nodes
    for (const m of html.replace(/<[^>]+>/g, " ").matchAll(URL_RE)) {
      add(m[0], null);
    }
  }
  if (text) {
    for (const m of text.matchAll(URL_RE)) add(m[0], null);
  }

  return [...seen.values()].slice(0, 200);
}

function firstAddress(
  value?: { address?: string; name?: string }[] | undefined,
): { address: string | null; name: string | null } {
  const a = value?.[0];
  return { address: a?.address?.toLowerCase() ?? null, name: a?.name || null };
}

export async function parseEmail(
  raw: Buffer | string,
  fallbackSnippet?: string,
): Promise<ParsedEmail> {
  const parsed = await simpleParser(raw);

  const headers: Record<string, string> = {};
  const receivedChain: string[] = [];
  for (const { key, line } of parsed.headerLines) {
    const k = key.toLowerCase();
    const v = line.slice(line.indexOf(":") + 1).trim();
    headers[k] = headers[k] ? `${headers[k]}\n${v}` : v;
    if (k === "received") receivedChain.push(v);
  }

  const from = firstAddress(parsed.from?.value);
  const replyTo = firstAddress(parsed.replyTo?.value);
  const toAddresses = (
    Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : []
  )
    .flatMap((a) => a.value)
    .map((a) => a.address?.toLowerCase())
    .filter((a): a is string => !!a);

  const fromAddress = from.address ?? "unknown@unknown.invalid";
  const fromHost = fromAddress.split("@")[1] ?? "unknown.invalid";
  const senderDomain = getDomain(fromHost) ?? fromHost;

  const returnPath =
    headers["return-path"]?.replace(/^<|>$/g, "").toLowerCase() || null;

  const attachments: ParsedAttachment[] = (parsed.attachments ?? []).map(
    (a) => ({
      filename: a.filename ?? "(unnamed)",
      contentType: a.contentType ?? null,
      sizeBytes: typeof a.size === "number" ? a.size : null,
      extension: a.filename ? extractExtension(a.filename) : null,
    }),
  );

  const bodyText = truncate(parsed.text, MAX_TEXT);
  const bodyHtml = truncate(
    typeof parsed.html === "string" ? parsed.html : null,
    MAX_HTML,
  );

  return {
    messageIdHdr: parsed.messageId ?? null,
    fromAddress,
    fromDisplay: from.name,
    senderDomain,
    replyTo: replyTo.address,
    returnPath,
    toAddresses,
    subject: parsed.subject ?? "",
    sentAt: parsed.date ?? null,
    bodyText,
    bodyHtml,
    snippet:
      fallbackSnippet?.trim() ||
      truncate(parsed.text?.replace(/\s+/g, " ").trim(), 240),
    headers,
    receivedChain,
    authenticationResults: headers["authentication-results"] ?? null,
    attachments,
    urls: collectUrls(bodyText, bodyHtml),
    hasAttachments: attachments.length > 0,
  };
}
