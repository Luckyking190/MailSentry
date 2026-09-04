import { promises as dns } from "node:dns";

import { prisma } from "@/server/db";

type Rrtype = "TXT" | "MX" | "A" | "AAAA" | "CNAME" | "NS";

const memCache = new Map<string, { value: unknown; expires: number }>();
const MEM_TTL_MS = 5 * 60_000;
const NEG_TTL_S = 300;
const POS_TTL_S = 3600;

function keyFor(name: string, rrtype: Rrtype) {
  return `DNS:${rrtype}:${name.toLowerCase()}`;
}

/**
 * Cached DNS resolve that mimics `dns.promises.resolve(name, rrtype)`.
 * Two tiers: in-process Map (warm lambda) + `DnsCache` table (cross-invocation).
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

  const row = await prisma.dnsCache.findUnique({ where: { key } }).catch(() => null);
  if (row && row.fetchedAt.getTime() + row.ttlSeconds * 1000 > now) {
    memCache.set(key, { value: row.value, expires: now + MEM_TTL_MS });
    return row.value as T;
  }

  let value: unknown = [];
  let ttl = POS_TTL_S;
  try {
    value = await dns.resolve(name, rrtype as "TXT");
  } catch {
    value = [];
    ttl = NEG_TTL_S;
  }

  memCache.set(key, { value, expires: now + MEM_TTL_MS });
  await prisma.dnsCache
    .upsert({
      where: { key },
      create: { key, value: value as object, ttlSeconds: ttl },
      update: { value: value as object, ttlSeconds: ttl, fetchedAt: new Date() },
    })
    .catch(() => {});

  return value as T;
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
  let ptr: string | null = null;
  try {
    const names = await dns.reverse(ip);
    ptr = names[0] ?? null;
  } catch {
    ptr = null;
  }
  memCache.set(key, { value: ptr ?? "", expires: Date.now() + MEM_TTL_MS });
  return ptr;
}
