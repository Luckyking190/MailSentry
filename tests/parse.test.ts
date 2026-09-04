import { describe, expect, it } from "vitest";

import { parseEmail } from "@/server/mail/parse";

const EML = `Delivered-To: victim@corp.com
Received: by mx.google.com with SMTPS id abc; Mon, 01 Sep 2026 03:00:02 -0700 (PDT)
Received: from mailer.m1crosoft-security.com (mailer.m1crosoft-security.com [203.0.113.66]) by mx.google.com with ESMTPS; Mon, 01 Sep 2026 03:00:01 -0700 (PDT)
Authentication-Results: mx.google.com; spf=fail (google.com: domain of admin@m1crosoft-security.com does not designate 203.0.113.66) smtp.mailfrom=admin@m1crosoft-security.com; dkim=none; dmarc=fail (p=REJECT) header.from=m1crosoft-security.com
Return-Path: <admin@m1crosoft-security.com>
Reply-To: security-team@account-verify.net
From: "Microsoft Support" <admin@m1crosoft-security.com>
To: victim@corp.com
Subject: Urgent: Verify your account within 24 hours
Message-ID: <9911@m1crosoft-security.com>
Date: Mon, 01 Sep 2026 10:00:00 +0000
Content-Type: text/html; charset=utf-8

<html><body><p>Your account will be suspended. <a href="http://bit.ly/xy12">Click here to verify at microsoft.com</a></p></body></html>
`;

describe("parseEmail", () => {
  it("extracts sender, domain, reply-to, and headers", async () => {
    const p = await parseEmail(EML);
    expect(p.fromAddress).toBe("admin@m1crosoft-security.com");
    expect(p.fromDisplay).toBe("Microsoft Support");
    expect(p.senderDomain).toBe("m1crosoft-security.com");
    expect(p.replyTo).toBe("security-team@account-verify.net");
    expect(p.returnPath).toBe("admin@m1crosoft-security.com");
    expect(p.subject).toContain("Verify your account");
    expect(p.messageIdHdr).toBe("<9911@m1crosoft-security.com>");
  });

  it("captures the Received chain newest-first", async () => {
    const p = await parseEmail(EML);
    expect(p.receivedChain).toHaveLength(2);
    expect(p.receivedChain[0]).toContain("SMTPS id abc");
    expect(p.receivedChain[1]).toContain("203.0.113.66");
  });

  it("exposes Authentication-Results", async () => {
    const p = await parseEmail(EML);
    expect(p.authenticationResults).toContain("spf=fail");
    expect(p.authenticationResults).toContain("dmarc=fail");
  });

  it("extracts links with anchor text", async () => {
    const p = await parseEmail(EML);
    const link = p.urls.find((u) => u.host === "bit.ly");
    expect(link).toBeTruthy();
    expect(link?.anchorText?.toLowerCase()).toContain("microsoft.com");
  });
});
