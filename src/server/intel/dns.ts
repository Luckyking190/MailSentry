import { promises as dns } from "node:dns";

import { singleFlight } from "./single-flight";

type Rrtype = "TXT" | "MX" | "A" | "AAAA" | "CNAME" | "NS";

const memCache = new Map<string, { value: unknown; expires: number }>();
const POS_TTL_MS = 30 * 60_000;
const NEG_TTL_MS = 5 * 60_000;
const DNS_TIMEOUT_MS = 2_500;

function keyFor(name: string, rrtype: Rrtype) {
  return `DNS:${rrtype}:${name.toLowerCase()}`;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * Cached DNS resolve that mimics `dns.promises.resolve(name, rrtype)`.
 *
 * Deliberately in-process only. This used to also read/write a `DnsCache`
 * row per lookup, but a Neon round trip measured ~261ms read / ~348ms write
 * against a ~243ms real DNS query — i.e. the "cache" cost roughly 2.5x what
 * it saved, and an SPF evaluation (up to 10 chained lookups under RFC 7208)
 * paid that on every one of them, blowing past its own timeout. The OS
 * resolver already caches, and this Map keeps a warm process fast.
 *
 * Lookup failures resolve to `[]` and are cached briefly so a dead domain
 * never repeatedly stalls a scan.
 */
export async function dnsResolve<T = string[]>(
  name: string,
  rrtype: Rrtype,
): Promise<T> {
  const key = keyFor(name, rrtype);
  const now = Date.now();

  const mem = memCache.get(key);
  if (mem && mem.expires > now) return mem.value as T;

  return singleFlight(key, async () => {
    let value: unknown = [];
    let ttl = POS_TTL_MS;
    try {
      value = await withTimeout(
        dns.resolve(name, rrtype as "TXT"),
        DNS_TIMEOUT_MS,
        [] as unknown as string[][],
      );
      if (Array.isArray(value) && value.length === 0) ttl = NEG_TTL_MS;
    } catch {
      value = [];
      ttl = NEG_TTL_MS;
    }

    memCache.set(key, { value, expires: Date.now() + ttl });
    return value as T;
  });
}

export async function resolveTxtRecords(name: string): Promise<string[]> {
  const rows = await dnsResolve<string[][]>(name, "TXT");
  return rows.map((chunks) => chunks.join(""));
}

export async function getSpfRecord(domain: string): Promise<string | null> {
  const txt = await resolveTxtRecords(domain);
  return txt.find((r) => /^v=spf1\b/i.test(r.trim())) ?? null;
}

/** Resolver in the shape mailauth's spf() expects: `(name, rrtype) => Promise<any[]>`. */
export function mailauthResolver() {
  return async (name: string, rrtype: string) =>
    dnsResolve(name, rrtype.toUpperCase() as Rrtype);
}

export async function reversePtr(ip: string): Promise<string | null> {
  const key = `DNS:PTR:${ip}`;
  const mem = memCache.get(key);
  if (mem && mem.expires > Date.now()) return (mem.value as string) || null;
  return singleFlight(key, async () => {
    let ptr: string | null = null;
    try {
      const names = await withTimeout(dns.reverse(ip), DNS_TIMEOUT_MS, [] as string[]);
      ptr = names[0] ?? null;
    } catch {
      ptr = null;
    }
    memCache.set(key, { value: ptr ?? "", expires: Date.now() + POS_TTL_MS });
    return ptr;
  });
}
