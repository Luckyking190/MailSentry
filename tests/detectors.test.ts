import { describe, expect, it } from "vitest";

import { authSpfDetector } from "@/server/detect/detectors/auth-spf";
import { authDkimDmarcDetector } from "@/server/detect/detectors/auth-dkim-dmarc";
import { senderImpersonationDetector } from "@/server/detect/detectors/sender-impersonation";
import { lookalikeDomainDetector } from "@/server/detect/detectors/lookalike-domain";
import { attachmentBasicDetector } from "@/server/detect/detectors/attachment-basic";
import { contentHeuristicDetector } from "@/server/detect/detectors/content-heuristic";
import { makeContext, makeEmail, makeAuthResults } from "./helpers";

describe("auth.spf", () => {
  it("fires on a hard SPF fail against a published record", async () => {
    const ctx = makeContext({
      spfCheck: {
        result: "fail",
        domain: "paypal.com",
        clientIp: "203.0.113.9",
        record: "v=spf1 include:_spf.google.com -all",
        comment: "not authorized",
      },
    });
    const r = await authSpfDetector.run(ctx);
    expect(r.triggered).toBe(true);
    expect(r.severity).toBe("critical");
    expect(r.evidence.some((e) => e.value.includes("203.0.113.9"))).toBe(true);
  });

  it("stays quiet on SPF pass", async () => {
    const ctx = makeContext({ authResults: makeAuthResults({ spf: "pass" }) });
    const r = await authSpfDetector.run(ctx);
    expect(r.triggered).toBe(false);
  });
});

describe("auth.dkim-dmarc", () => {
  it("escalates to critical when SPF and DMARC both fail", async () => {
    const ctx = makeContext({
      authResults: makeAuthResults({ dmarc: "fail", dmarcDomain: "corp.com" }),
      spfCheck: {
        result: "fail",
        domain: "corp.com",
        clientIp: "203.0.113.9",
        record: "v=spf1 -all",
        comment: null,
      },
    });
    const r = await authDkimDmarcDetector.run(ctx);
    expect(r.severity).toBe("critical");
  });
});

describe("sender.impersonation", () => {
  it("flags a brand display name on a non-brand domain", async () => {
    const ctx = makeContext({
      email: makeEmail({
        fromDisplay: "Microsoft Support",
        fromAddress: "support@m1crosoft-security.com",
        senderDomain: "m1crosoft-security.com",
      }),
    });
    const r = await senderImpersonationDetector.run(ctx);
    expect(r.triggered).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.8);
  });

  it("flags reply-to on a different domain", async () => {
    const ctx = makeContext({
      email: makeEmail({
        fromAddress: "billing@acme.com",
        senderDomain: "acme.com",
        replyTo: "collections@acme-invoices.net",
      }),
    });
    const r = await senderImpersonationDetector.run(ctx);
    expect(r.triggered).toBe(true);
  });
});

describe("domain.lookalike", () => {
  it("catches a homoglyph of a known brand", async () => {
    const ctx = makeContext({
      email: makeEmail({ senderDomain: "m1crosoft.com" }),
    });
    const r = await lookalikeDomainDetector.run(ctx);
    expect(r.triggered).toBe(true);
    expect(r.evidence[0].value.toLowerCase()).toContain("microsoft");
  });

  it("catches a one-edit typosquat", async () => {
    const ctx = makeContext({
      email: makeEmail({ senderDomain: "paypa1.com" }),
    });
    const r = await lookalikeDomainDetector.run(ctx);
    expect(r.triggered).toBe(true);
  });

  it("does not flag the real brand domain", async () => {
    const ctx = makeContext({
      email: makeEmail({ senderDomain: "microsoft.com" }),
    });
    const r = await lookalikeDomainDetector.run(ctx);
    expect(r.triggered).toBe(false);
  });

  it("does not flag an unrelated domain", async () => {
    const ctx = makeContext({
      email: makeEmail({ senderDomain: "some-random-startup.io" }),
    });
    const r = await lookalikeDomainDetector.run(ctx);
    expect(r.triggered).toBe(false);
  });
});

describe("attachment.basic", () => {
  it("flags a double extension as critical", async () => {
    const ctx = makeContext({
      email: makeEmail({
        hasAttachments: true,
        attachments: [
          { filename: "invoice.pdf.exe", contentType: null, sizeBytes: 12, extension: "exe" },
        ],
      }),
    });
    const r = await attachmentBasicDetector.run(ctx);
    expect(r.severity).toBe("critical");
  });
});

describe("content.heuristic", () => {
  it("flags BEC language", async () => {
    const ctx = makeContext({
      email: makeEmail({
        subject: "Quick task",
        bodyText: "Are you available? I need you to process this payment urgently and change the bank details for our vendor.",
      }),
    });
    const r = await contentHeuristicDetector.run(ctx);
    expect(r.triggered).toBe(true);
    expect(r.category).toBe("bec");
  });
});
