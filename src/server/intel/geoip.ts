import { prisma } from "@/server/db";
import { reversePtr } from "./dns";

export type GeoRecord = {
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  asn: string | null;
  org: string | null;
  ptr: string | null;
  provider: "ipinfo" | "unknown";
};

const memCache = new Map<string, { value: GeoRecord; expires: number }>();
const MEM_TTL_MS = 10 * 60_000;
const DB_TTL_S = 7 * 86_400;

function parseAsnOrg(org: string | undefined): { asn: string | null; org: string | null } {
  if (!org) return { asn: null, org: null };
  const m = org.match(/^(AS\d+)\s+(.*)$/i);
  return m ? { asn: m[1].toUpperCase(), org: m[2] } : { asn: null, org };
}

function empty(ip: string): GeoRecord {
  return {
    ip,
    country: null,
    region: null,
    city: null,
    lat: null,
    lon: null,
    asn: null,
    org: null,
    ptr: null,
    provider: "unknown",
  };
}

async function fetchFromIpinfo(ip: string): Promise<GeoRecord> {
  const token = process.env.IPINFO_TOKEN;
  if (!token) return empty(ip);

  try {
    const res = await fetch(
      `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return empty(ip);
    const data = (await res.json()) as {
      city?: string;
      region?: string;
      country?: string;
      loc?: string;
      org?: string;
      bogon?: boolean;
    };
    if (data.bogon) return empty(ip);

    const [lat, lon] = (data.loc ?? "")
      .split(",")
      .map((n) => (n ? Number(n) : NaN));
    const { asn, org } = parseAsnOrg(data.org);

    return {
      ip,
      country: data.country ?? null,
      region: data.region ?? null,
      city: data.city ?? null,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      asn,
      org,
      ptr: null,
      provider: "ipinfo",
    };
  } catch {
    return empty(ip);
  }
}

/** Cached IP → geo/ASN lookup (ipinfo.io), with reverse-DNS PTR attached. */
export async function geolocateIp(ip: string): Promise<GeoRecord> {
  const now = Date.now();
  const mem = memCache.get(ip);
  if (mem && mem.expires > now) return mem.value;

  const key = `GEO:${ip}`;
  const row = await prisma.dnsCache.findUnique({ where: { key } }).catch(() => null);
  if (row && row.fetchedAt.getTime() + row.ttlSeconds * 1000 > now) {
    const v = row.value as GeoRecord;
    memCache.set(ip, { value: v, expires: now + MEM_TTL_MS });
    return v;
  }

  const [geo, ptr] = await Promise.all([fetchFromIpinfo(ip), reversePtr(ip)]);
  const value: GeoRecord = { ...geo, ptr };

  memCache.set(ip, { value, expires: now + MEM_TTL_MS });
  await prisma.dnsCache
    .upsert({
      where: { key },
      create: { key, value: value as object, ttlSeconds: DB_TTL_S },
      update: { value: value as object, ttlSeconds: DB_TTL_S, fetchedAt: new Date() },
    })
    .catch(() => {});

  return value;
}

/** Geolocate several IPs with bounded concurrency, deduping repeats. */
export async function geolocateMany(ips: string[]): Promise<Map<string, GeoRecord>> {
  const unique = [...new Set(ips)];
  const CONCURRENCY = 3;
  const out = new Map<string, GeoRecord>();
  let i = 0;
  async function worker() {
    while (i < unique.length) {
      const ip = unique[i++];
      out.set(ip, await geolocateIp(ip));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
  return out;
}
