declare module "mailauth" {
  export function spf(opts: {
    sender: string;
    ip: string;
    helo?: string;
    mta?: string;
    maxResolveCount?: number;
    maxVoidCount?: number;
    resolver?: (name: string, rrtype: string) => Promise<unknown>;
  }): Promise<{
    domain?: string;
    "client-ip"?: string;
    status?: { result?: string; comment?: string | false };
    header?: string;
    info?: string;
  }>;

  export function authenticate(
    message: Buffer | string,
    opts?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;

  export function dkimVerify(
    message: Buffer | string,
    opts?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;

  export function dmarc(
    opts: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

declare module "mailauth/lib/parse-received.js" {
  export function parseReceived(buf: string | Buffer): Record<
    string,
    { value?: string; comment?: string }
  > & { timestamp?: string; full?: string; tls?: { value: string; comment?: string } };
}

declare module "mailauth/lib/spf" {
  export { spf } from "mailauth";
}
