import { getDomain } from "tldts";

import {
  BRANDS,
  brandSkeletonIndex,
  isKnownBrandDomain,
} from "@/server/watchlist/brands";
import { isPunycode, skeleton } from "@/lib/homoglyph";
import { damerauLevenshtein } from "@/lib/textdistance";
import type { Detector, DetectorResult, Evidence } from "../types";
import { severityFromScore } from "./_util";

export const lookalikeDomainDetector: Detector = {
  id: "domain.lookalike",
  category: "impersonation",
  defaultWeight: 0.2,

  run(ctx): DetectorResult {
    const { email, settings } = ctx;
    const domain = email.senderDomain.toLowerCase();
    const evidence: Evidence[] = [];
    let score = 0;
    let confidence = 0.75;
    const tags: string[] = [];

    // Exact legitimate brand domain → never a lookalike.
    if (isKnownBrandDomain(domain)) {
      return none();
    }

    const label = domain.split(".")[0];
    const skel = skeleton(label);

    // 1. A brand name appears in the sender's subdomain / hyphenated prefix
    //    (paypal.com.secure-login.ru, paypal-security.info) while the
    //    registrable domain isn't the brand's.
    const registrable = getDomain(domain) ?? domain;
    const ownLabel = registrable.split(".")[0];
    const subLabels = domain.split(".").slice(0, -2);
    for (const brand of BRANDS) {
      for (const bd of brand.domains) {
        const bl = bd.split(".")[0];
        if (bl.length < 4) continue;
        const asSubLabel = subLabels.includes(bl);
        const asPrefix =
          new RegExp(`(^|\\.)${bl}[-.]`, "i").test(domain) && ownLabel !== bl;
        if (asSubLabel || asPrefix) {
          score = Math.max(score, 0.82);
          tags.push(brand.name);
          evidence.push({
            label: "Brand name in domain",
            value: `"${bl}" appears in ${domain} but the registrable domain is ${registrable}`,
            kind: "comparison",
          });
          break;
        }
      }
      if (score >= 0.82) break;
    }

    // 2. Homoglyph / confusable skeleton match — exact, or the domain's
    //    skeleton starts with the brand's skeleton followed by a separator
    //    (m1crosoft-secure-support.com still folds to "m1crosoft" up front).
    if (score < 0.8) {
      for (const entry of brandSkeletonIndex()) {
        if (entry.domain === domain) continue;
        const exact = entry.skel === skel;
        const prefixed =
          !exact &&
          skel.startsWith(entry.skel) &&
          /[^a-z0-9]/.test(skel[entry.skel.length] ?? "");
        if ((exact || prefixed) && entry.domain.split(".")[0] !== label) {
          score = Math.max(score, exact ? 0.86 : 0.8);
          tags.push(entry.brand.name);
          evidence.push({
            label: "Homoglyph lookalike",
            value: `${domain} is a visual imitation of ${entry.domain} (confusable-character match)`,
            kind: "comparison",
          });
          break;
        }
      }
    }

    // 3. Small edit distance to a real brand domain.
    if (score < 0.8) {
      for (const brand of BRANDS) {
        for (const bd of brand.domains) {
          if (bd === domain) continue;
          const d = damerauLevenshtein(domain, bd, 2);
          if (d >= 1 && d <= 2) {
            score = Math.max(score, d === 1 ? 0.84 : 0.72);
            tags.push(brand.name);
            evidence.push({
              label: "Typosquat",
              value: `${domain} is ${d} edit${d === 1 ? "" : "s"} away from ${bd}`,
              kind: "metric",
            });
            break;
          }
        }
        if (score >= 0.7) break;
      }
    }

    // 4. Punycode.
    if (isPunycode(domain)) {
      let decoded = domain;
      try {
        decoded = new URL(`http://${domain}`).hostname;
      } catch {
        /* keep raw */
      }
      score = Math.max(score, 0.6);
      confidence = 0.65;
      evidence.push({
        label: "Punycode domain",
        value: `${domain}${decoded !== domain ? ` → "${decoded}"` : ""} — internationalised domain often used for spoofing`,
        kind: "fact",
      });
    }

    // 5. User's custom watchlist (brand token in domain that isn't theirs).
    for (const term of settings.brandWatchlist) {
      if (term.length >= 3 && label.includes(term) && !domain.startsWith(term + ".")) {
        score = Math.max(score, 0.55);
        evidence.push({
          label: "Watchlist term",
          value: `"${term}" from your brand watchlist appears in ${domain}`,
          kind: "fact",
        });
      }
    }

    return {
      detectorId: "domain.lookalike",
      category: "impersonation",
      triggered: score > 0,
      score,
      confidence,
      severity: severityFromScore(score),
      evidence,
      tags: tags.length ? [...new Set(tags)] : undefined,
    };
  },
};

function none(): DetectorResult {
  return {
    detectorId: "domain.lookalike",
    category: "impersonation",
    triggered: false,
    score: 0,
    confidence: 0.9,
    severity: "info",
    evidence: [{ label: "Sender domain", value: "recognised, not a lookalike", kind: "fact" }],
  };
}
