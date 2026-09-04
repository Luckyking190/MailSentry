import { promises as dns } from "node:dns";
import ipaddr from "ipaddr.js";
import { Agent, buildConnector, request } from "undici";

import { isPublicIp } from "./received-chain";

export type RedirectHop = {
  url: string;
  status: number | null;
  host: string;
  ip: string | null;
};

export type ExpandResult = {
  chain: RedirectHop[];
  finalUrl: string;
  finalHost: string | null;
  /** non-null when resolution was aborted for SSRF / safety reasons */
  blocked: string | null;
  reachedLimit: boolean;
};

const BLOCKED_LITERALS = new Set([
  "0.0.0.0",
  "169.254.169.254", // cloud metadata
  "::",
  "::1",
]);

async function resolveAndVet(
  host: string,
): Promise<{ ips: string[]; bad: string | null }> {
  // host is already a hostname from a parsed URL we extracted from an email.
  if (ipaddr.isValid(host)) {
    return BLOCKED_LITERALS.has(host) || !isPublicIp(host)
      ? { ips: [host], bad: `non-public address ${host}` }
      : { ips: [host], bad: null };
  }
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    return { ips: [], bad: "dns-resolution-failed" };
  }
  const ips = addrs.map((a) => a.address);
  if (ips.length === 0) return { ips, bad: "no-address" };
  for (const ip of ips) {
    if (BLOCKED_LITERALS.has(ip) || !isPublicIp(ip)) {
      return { ips, bad: `resolves to non-public address ${ip}` };
    }
  }
  return { ips, bad: null };
}

function pinnedDispatcher(ip: string): Agent {
  const base = buildConnector({ timeout: 3000 });
  return new Agent({
    connections: 1,
    connect(opts, cb) {
      base(
        { ...opts, hostname: ip, servername: opts.servername ?? opts.hostname },
        cb,
      );
    },
  });
}

/**
 * Follow an HTTP(S) redirect chain with an SSRF guard:
 *  - every hop's host is DNS-resolved and every A/AAAA vetted before connecting
 *  - the connection is pinned to the vetted IP (defeats DNS rebinding)
 *  - hop cap, per-request + overall time budget, HEAD-then-GET, no cookies
 * Only ever called with URLs already extracted from a parsed email.
 */
export async function expandUrl(
  rawUrl: string,
  opts: { maxHops?: number; budgetMs?: number } = {},
): Promise<ExpandResult> {
  const maxHops = opts.maxHops ?? 4;
  const deadline = Date.now() + (opts.budgetMs ?? 4500);
  const chain: RedirectHop[] = [];
  let current = rawUrl;
  let blocked: string | null = null;

  for (let i = 0; i < maxHops; i++) {
    if (Date.now() > deadline) break;

    let u: URL;
    try {
      u = new URL(current);
    } catch {
      blocked = "invalid-url";
      break;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      blocked = `unsupported scheme (${u.protocol})`;
      break;
    }

    const { ips, bad } = await resolveAndVet(u.hostname);
    if (bad) {
      chain.push({ url: current, status: null, host: u.hostname, ip: ips[0] ?? null });
      blocked = bad;
      break;
    }

    const pinnedIp = ips[0];
    const dispatcher = pinnedDispatcher(pinnedIp);
    let status: number | null = null;
    let location: string | null = null;

    try {
      for (const method of ["HEAD", "GET"] as const) {
        const timeLeft = deadline - Date.now();
        if (timeLeft <= 0) break;
        try {
          const res = await request(current, {
            method,
            dispatcher,
            headers: {
              "user-agent": "MailSentry-URLScanner/1.0 (+security-scan)",
              accept: "*/*",
            },
            signal: AbortSignal.timeout(Math.min(3000, timeLeft)),
          });
          status = res.statusCode;
          const loc = res.headers["location"];
          location = Array.isArray(loc) ? loc[0] : (loc ?? null);
          await res.body.dump().catch(() => {});
          break; // got a response; don't try GET
        } catch {
          if (method === "GET") throw new Error("request-failed");
        }
      }
    } catch {
      chain.push({ url: current, status, host: u.hostname, ip: pinnedIp });
      await dispatcher.close().catch(() => {});
      break;
    }
    await dispatcher.close().catch(() => {});

    chain.push({ url: current, status, host: u.hostname, ip: pinnedIp });

    if (status && status >= 300 && status < 400 && location) {
      try {
        current = new URL(location, current).toString();
      } catch {
        blocked = "invalid-redirect-target";
        break;
      }
      continue;
    }
    break;
  }

  const reachedLimit = chain.length >= maxHops && !blocked;
  const finalUrl = chain[chain.length - 1]?.url ?? rawUrl;
  let finalHost: string | null = null;
  try {
    finalHost = new URL(finalUrl).hostname.toLowerCase();
  } catch {
    /* ignore */
  }

  return { chain, finalUrl, finalHost, blocked, reachedLimit };
}

export function ipFamily(ip: string): 4 | 6 {
  return ipaddr.isValid(ip) && ipaddr.parse(ip).kind() === "ipv6" ? 6 : 4;
}
