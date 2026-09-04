import { DEFAULT_BAND_THRESHOLDS } from "@/lib/scoring";
import type { ParsedEmail } from "@/server/mail/types";
import { analyzeReceivedChain } from "@/server/intel/received-chain";
import type {
  DetectorContext,
  ParsedAuthResults,
  ResolvedSettings,
} from "@/server/detect/types";

export function makeEmail(over: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageIdHdr: "<abc@example.com>",
    fromAddress: "sender@example.com",
    fromDisplay: "Example Sender",
    senderDomain: "example.com",
    replyTo: null,
    returnPath: "sender@example.com",
    toAddresses: ["victim@corp.com"],
    subject: "Hello",
    sentAt: new Date("2026-09-01T10:00:00Z"),
    bodyText: "Just a normal email.",
    bodyHtml: null,
    snippet: "Just a normal email.",
    headers: {},
    receivedChain: [],
    authenticationResults: null,
    attachments: [],
    urls: [],
    hasAttachments: false,
    ...over,
  };
}

export function makeAuthResults(
  over: Partial<ParsedAuthResults> = {},
): ParsedAuthResults {
  return {
    raw: null,
    spf: null,
    spfDomain: null,
    dkim: null,
    dkimDomain: null,
    dmarc: null,
    dmarcDomain: null,
    ...over,
  };
}

export function makeSettings(
  over: Partial<ResolvedSettings> = {},
): ResolvedSettings {
  return {
    detectorWeights: {},
    bandThresholds: DEFAULT_BAND_THRESHOLDS,
    brandWatchlist: [],
    enableLlm: true,
    ...over,
  };
}

export function makeContext(
  over: Partial<DetectorContext> = {},
): DetectorContext {
  const email = over.email ?? makeEmail();
  return {
    email,
    userId: "u_test",
    settings: over.settings ?? makeSettings(),
    received: over.received ?? analyzeReceivedChain(email.receivedChain),
    authResults: over.authResults ?? makeAuthResults(),
    spfCheck: over.spfCheck ?? null,
  };
}
