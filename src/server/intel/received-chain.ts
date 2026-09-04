import ipaddr from "ipaddr.js";
import { parseReceived } from "mailauth/lib/parse-received.js";

export type ParsedHop = {
  /** 0 = topmost / newest Received header */
  index: number;
  raw: string;
  fromHost: string | null;
  fromIp: string | null;
  byHost: string | null;
  with: string | null;
  timestamp: Date | null;
  isPublicIp: boolean;
  /** true when a known mailbox-provider / gateway added this hop */
  byTrustedRelay: boolean;
};

export type ReceivedChain = {
  hops: ParsedHop[];
  /** The hop that first accepted the message from the public internet. */
  originHop: ParsedHop | null;
  originIp: string | null;
  /** true when every public hop is a provider relay (real origin hidden). */
  originObscured: boolean;
  /** Hops older than the earliest trusted relay — attacker-controllable. */
  unverifiedFromIndex: number | null;
};

const TRUSTED_RELAY_SUFFIXES = [
  "google.com",
  "googlemail.com",
  "gmail.com",
  "outlook.com",
  "office365.com",
  "protection.outlook.com",
  "hotmail.com",
  "amazonses.com",
  "amazonaws.com",
  "pphosted.com",
  "ppops.net",
  "mimecast.com",
  "messagelabs.com",
  "mailgun.org",
  "sendgrid.net",
  "sparkpostmail.com",
  "zoho.com",
  "protonmail.ch",
];

const IP_IN_BRACKETS = /\[([0-9a-f:.]+)\]/i;
const IP_IN_PARENS = /\(([^)]*?\b(?:\d{1,3}\.){3}\d{1,3}[^)]*?)\)/i;
const BARE_IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const BARE_IPV6 = /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/i;

function extractIp(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const m =
      c.match(IP_IN_BRACKETS) ??
      c.match(IP_IN_PARENS) ??
      c.match(BARE_IPV6) ??
      c.match(BARE_IPV4);
    if (!m) continue;
    const raw = (m[1] ?? m[0]).replace(/^::ffff:/i, "").trim();
    if (ipaddr.isValid(raw)) return raw;
  }
  return null;
}

export function isPublicIp(ip: string | null): boolean {
  if (!ip || !ipaddr.isValid(ip)) return false;
  try {
    const range = ipaddr.parse(ip).range();
    return range === "unicast";
  } catch {
    return false;
  }
}

function hostSuffixMatch(host: string | null, suffixes: string[]): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return suffixes.some((s) => h === s || h.endsWith(`.${s}`));
}

function parseTimestamp(ts: unknown): Date | null {
  if (!ts) return null;
  const d = new Date(String(ts).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseReceivedChain(receivedHeaders: string[]): ParsedHop[] {
  return receivedHeaders.map((raw, index) => {
    let parsed: Record<string, { value?: string; comment?: string }> & {
      timestamp?: string;
    } = {};
    try {
      parsed = parseReceived(`Received: ${raw}`) || {};
    } catch {
      parsed = {};
    }

    const fromHost =
      parsed.from?.value?.replace(/[[\]()]/g, "").trim() || null;
    const byHost = parsed.by?.value?.replace(/[[\]()]/g, "").trim() || null;
    const fromIp = extractIp(
      parsed.from?.comment,
      parsed.from?.value,
      raw.split(/\bby\b/i)[0],
    );

    return {
      index,
      raw,
      fromHost,
      fromIp,
      byHost,
      with: parsed.with?.value ?? null,
      timestamp: parseTimestamp(parsed.timestamp),
      isPublicIp: isPublicIp(fromIp),
      byTrustedRelay: hostSuffixMatch(byHost, TRUSTED_RELAY_SUFFIXES),
    };
  });
}

/**
 * Received headers are prepended, so `hops[0]` is newest. Walk from the oldest
 * end toward the newest: the earliest hop that a trusted relay added, whose
 * `from` IP is public, is the originating MTA. Anything older is unverified.
 */
export function analyzeReceivedChain(receivedHeaders: string[]): ReceivedChain {
  const hops = parseReceivedChain(receivedHeaders);
  if (hops.length === 0) {
    return {
      hops,
      originHop: null,
      originIp: null,
      originObscured: false,
      unverifiedFromIndex: null,
    };
  }

  // Oldest → newest.
  const oldestFirst = [...hops].reverse();

  let originHop: ParsedHop | null = null;
  let unverifiedFromIndex: number | null = null;

  const firstTrusted = oldestFirst.find((h) => h.byTrustedRelay);
  if (firstTrusted) {
    // Everything older than the earliest trusted relay is attacker-controlled.
    unverifiedFromIndex = firstTrusted.index + 1 <= hops.length - 1
      ? firstTrusted.index + 1
      : null;
    originHop = firstTrusted.isPublicIp ? firstTrusted : null;
  }

  if (!originHop) {
    originHop =
      oldestFirst.find((h) => h.isPublicIp && h.byTrustedRelay) ??
      oldestFirst.find((h) => h.isPublicIp) ??
      null;
  }

  const anyPublic = hops.some((h) => h.isPublicIp);
  const originObscured = !originHop && anyPublic;

  return {
    hops,
    originHop,
    originIp: originHop?.fromIp ?? null,
    originObscured,
    unverifiedFromIndex,
  };
}
