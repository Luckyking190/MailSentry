import { describe, expect, it } from "vitest";

import { analyzeReceivedChain, isPublicIp } from "@/server/intel/received-chain";

describe("isPublicIp", () => {
  it("classifies ranges", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("10.0.0.5")).toBe(false);
    expect(isPublicIp("192.168.1.1")).toBe(false);
    expect(isPublicIp("127.0.0.1")).toBe(false);
    expect(isPublicIp("169.254.1.1")).toBe(false);
    expect(isPublicIp("100.64.0.1")).toBe(false);
    expect(isPublicIp(null)).toBe(false);
  });
});

describe("analyzeReceivedChain", () => {
  it("picks the sender IP from the oldest Google-added hop", () => {
    // newest-first, as they appear in the message
    const chain = [
      "by mx.google.com with SMTPS id abc for <victim@corp.com>; Mon, 01 Sep 2026 03:00:02 -0700 (PDT)",
      "from evil-sender.example (evil-sender.example [185.220.101.66]) by mx.google.com with ESMTPS id def; Mon, 01 Sep 2026 03:00:01 -0700 (PDT)",
      "from localhost (localhost [127.0.0.1]) by evil-sender.example; Mon, 01 Sep 2026 10:00:00 +0000",
    ];
    const res = analyzeReceivedChain(chain);
    expect(res.originIp).toBe("185.220.101.66");
    expect(res.originHop?.byTrustedRelay).toBe(true);
    // the localhost hop below the trusted boundary is unverified
    expect(res.unverifiedFromIndex).not.toBeNull();
  });

  it("marks origin obscured when every hop is a provider relay", () => {
    const chain = [
      "from mail-sor-f41.google.com (mail-sor-f41.google.com [209.85.220.41]) by mx.google.com with SMTPS; Mon, 01 Sep 2026 03:00:01 -0700",
    ];
    const res = analyzeReceivedChain(chain);
    expect(res.hops).toHaveLength(1);
    expect(res.originIp).toBe("209.85.220.41");
  });

  it("handles an empty chain", () => {
    const res = analyzeReceivedChain([]);
    expect(res.hops).toHaveLength(0);
    expect(res.originIp).toBeNull();
  });
});
