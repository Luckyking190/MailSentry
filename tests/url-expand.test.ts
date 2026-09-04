import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns", () => ({
  promises: {
    lookup: vi.fn(async (host: string) => {
      const map: Record<string, { address: string }[]> = {
        "internal.example.test": [{ address: "10.0.0.5" }],
        "metadata.example.test": [{ address: "169.254.169.254" }],
        "loopback.example.test": [{ address: "127.0.0.1" }],
      };
      if (map[host]) return map[host];
      throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    }),
  },
}));

const { expandUrl } = await import("@/server/intel/url-expand");

describe("expandUrl SSRF guard", () => {
  it("refuses a host that resolves to a private address", async () => {
    const r = await expandUrl("http://internal.example.test/x");
    expect(r.blocked).toMatch(/non-public/);
    expect(r.chain.at(-1)?.status).toBeNull();
  });

  it("refuses the cloud metadata address", async () => {
    const r = await expandUrl("http://metadata.example.test/latest/meta-data");
    expect(r.blocked).toMatch(/non-public|169\.254\.169\.254/);
  });

  it("refuses loopback", async () => {
    const r = await expandUrl("https://loopback.example.test/");
    expect(r.blocked).toMatch(/non-public/);
  });

  it("refuses a literal private IP host", async () => {
    const r = await expandUrl("http://10.1.2.3/");
    expect(r.blocked).toMatch(/non-public/);
  });

  it("refuses unknown/unresolvable hosts", async () => {
    const r = await expandUrl("http://does-not-resolve.example.test/");
    expect(r.blocked).toBe("dns-resolution-failed");
  });

  it("rejects non-http schemes", async () => {
    const r = await expandUrl("ftp://files.example.test/x");
    expect(r.blocked).toMatch(/unsupported scheme/);
  });
});
