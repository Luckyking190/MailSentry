import { getDomain } from "tldts";

import { prisma } from "@/server/db";
import { dnsResolve, getSpfRecord } from "./dns";
import { getDomainAge } from "./rdap";

export type DomainReputationSnapshot = {
  domain: string;
  spfRecord: string | null;
  dmarcPolicy: string | null;
  domainAgeDays: number | null;
  registrar: string | null;
  mxHosts: string[];
};

/**
 * Fetch (and cache in `DomainReputation`) SPF, DMARC policy, registration age
 * and MX hosts for a registrable domain. Used to enrich the sender domain and
 * the final hosts of expanded URLs.
 */
export async function getDomainReputation(
  input: string,
): Promise<DomainReputationSnapshot> {
  const domain = (getDomain(input) ?? input).toLowerCase();

  const existing = await prisma.domainReputation
    .findUnique({ where: { domain } })
    .catch(() => null);
  if (
    existing &&
    existing.refreshedAt.getTime() + existing.ttlSeconds * 1000 > Date.now()
  ) {
    return {
      domain,
      spfRecord: existing.spfRecord,
      dmarcPolicy: existing.dmarcPolicy,
      domainAgeDays: existing.domainAgeDays,
      registrar: existing.registrar,
      mxHosts: existing.mxHosts,
    };
  }

  const [spfRecord, age, dmarcTxt, mx] = await Promise.all([
    getSpfRecord(domain).catch(() => null),
    getDomainAge(domain).catch(() => null),
    dnsResolve<string[][]>(`_dmarc.${domain}`, "TXT").catch(() => []),
    dnsResolve<{ exchange: string }[]>(domain, "MX").catch(() => []),
  ]);

  const dmarcRecord = dmarcTxt
    .map((c) => (Array.isArray(c) ? c.join("") : String(c)))
    .find((r) => /^v=DMARC1/i.test(r.trim()));
  const dmarcPolicy = dmarcRecord?.match(/\bp=([a-z]+)/i)?.[1]?.toLowerCase() ?? null;

  const mxHosts = Array.isArray(mx)
    ? mx.map((m) => m.exchange).filter(Boolean).slice(0, 8)
    : [];

  const snapshot: DomainReputationSnapshot = {
    domain,
    spfRecord: spfRecord ?? null,
    dmarcPolicy,
    domainAgeDays: age?.ageDays ?? null,
    registrar: age?.registrar ?? null,
    mxHosts,
  };

  await prisma.domainReputation
    .upsert({
      where: { domain },
      create: {
        domain,
        spfRecord: snapshot.spfRecord,
        dmarcPolicy: snapshot.dmarcPolicy,
        domainAgeDays: snapshot.domainAgeDays,
        createdOn: age?.createdOn ?? null,
        registrar: snapshot.registrar,
        mxHosts: snapshot.mxHosts,
        ttlSeconds: 86_400,
      },
      update: {
        spfRecord: snapshot.spfRecord,
        dmarcPolicy: snapshot.dmarcPolicy,
        domainAgeDays: snapshot.domainAgeDays,
        createdOn: age?.createdOn ?? null,
        registrar: snapshot.registrar,
        mxHosts: snapshot.mxHosts,
        refreshedAt: new Date(),
      },
    })
    .catch(() => {});

  return snapshot;
}
