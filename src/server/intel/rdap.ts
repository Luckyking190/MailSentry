import { getDomain } from "tldts";

import { prisma } from "@/server/db";

export type DomainAge = {
  domain: string;
  createdOn: Date | null;
  ageDays: number | null;
  registrar: string | null;
  source: "rdap" | "unknown";
};

const memCache = new Map<string, { value: DomainAge; expires: number }>();

type RdapEvent = { eventAction?: string; eventDate?: string };
type RdapEntity = {
  roles?: string[];
  vcardArray?: [string, unknown[]];
};

function extractRegistrar(entities: RdapEntity[] | undefined): string | null {
  const reg = entities?.find((e) => e.roles?.includes("registrar"));
  const vcard = reg?.vcardArray?.[1] as unknown[] | undefined;
  const fn = vcard?.find(
    (row): row is [string, unknown, string, string] =>
      Array.isArray(row) && row[0] === "fn",
  );
  return (fn?.[3] as string) ?? null;
}

/**
 * Registration date + registrar via RDAP (rdap.org bootstraps to the right
 * registry). Two-tier cache. A lookup failure yields `source: "unknown"` —
 * callers must treat that as neutral, never as malicious.
 */
export async function getDomainAge(input: string): Promise<DomainAge> {
  const domain = (getDomain(input) ?? input).toLowerCase();
  const now = Date.now();

  const mem = memCache.get(domain);
  if (mem && mem.expires > now) return mem.value;

  const key = `RDAP:${domain}`;
  const row = await prisma.dnsCache.findUnique({ where: { key } }).catch(() => null);
  if (row && row.fetchedAt.getTime() + row.ttlSeconds * 1000 > now) {
    const v = reviveAge(domain, row.value);
    memCache.set(domain, { value: v, expires: now + 5 * 60_000 });
    return v;
  }

  let value: DomainAge = {
    domain,
    createdOn: null,
    ageDays: null,
    registrar: null,
    source: "unknown",
  };

  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: "application/rdap+json" },
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        events?: RdapEvent[];
        entities?: RdapEntity[];
      };
      const created = data.events?.find(
        (e) => e.eventAction === "registration" && e.eventDate,
      )?.eventDate;
      if (created) {
        const d = new Date(created);
        if (!Number.isNaN(d.getTime())) {
          value = {
            domain,
            createdOn: d,
            ageDays: Math.max(0, Math.floor((now - d.getTime()) / 86_400_000)),
            registrar: extractRegistrar(data.entities),
            source: "rdap",
          };
        }
      }
    }
  } catch {
    /* leave as unknown */
  }

  const ttl = value.source === "rdap" ? 7 * 86_400 : 3600;
  memCache.set(domain, { value, expires: now + 5 * 60_000 });
  await prisma.dnsCache
    .upsert({
      where: { key },
      create: {
        key,
        value: serializeAge(value),
        ttlSeconds: ttl,
      },
      update: {
        value: serializeAge(value),
        ttlSeconds: ttl,
        fetchedAt: new Date(),
      },
    })
    .catch(() => {});

  return value;
}

function serializeAge(a: DomainAge) {
  return {
    createdOn: a.createdOn ? a.createdOn.toISOString() : null,
    ageDays: a.ageDays,
    registrar: a.registrar,
    source: a.source,
  };
}

function reviveAge(domain: string, raw: unknown): DomainAge {
  const r = (raw ?? {}) as {
    createdOn?: string | null;
    ageDays?: number | null;
    registrar?: string | null;
    source?: "rdap" | "unknown";
  };
  const createdOn = r.createdOn ? new Date(r.createdOn) : null;
  return {
    domain,
    createdOn,
    ageDays: createdOn
      ? Math.max(0, Math.floor((Date.now() - createdOn.getTime()) / 86_400_000))
      : (r.ageDays ?? null),
    registrar: r.registrar ?? null,
    source: r.source ?? "unknown",
  };
}
