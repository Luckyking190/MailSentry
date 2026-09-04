import { DEFAULT_BAND_THRESHOLDS } from "@/lib/scoring";
import type { ParsedEmail } from "@/server/mail/types";
import { analyzeReceivedChain } from "@/server/intel/received-chain";
import type {
  DetectorContext,
  ParsedAuthResults,
  ResolvedSettings,
} from "@/server/detect/types";
import type { CombinedAnalysis } from "@/server/llm/schemas";
import type { LlmAnalysis } from "@/server/llm/analyze";

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

export function makeCombinedAnalysis(
  over: Partial<{
    content: Partial<CombinedAnalysis["content"]>;
    bec: Partial<CombinedAnalysis["bec"]>;
    social: Partial<CombinedAnalysis["social"]>;
  }> = {},
): CombinedAnalysis {
  return {
    content: {
      phishing_likelihood: 0,
      writing_quality: "adequate",
      grammar_issues: [],
      emotional_manipulation: [],
      requests_sensitive_info: false,
      sensitive_info_types: [],
      contains_threat: false,
      contains_reward_bait: false,
      impersonated_entity: null,
      suspicious_phrases: [],
      rationale: "",
      ...over.content,
    },
    bec: {
      is_bec: false,
      subtype: "none",
      confidence: 0,
      target_action: null,
      spoofed_authority: null,
      urgency_pressure: false,
      out_of_band_evasion: false,
      monetary_amount: null,
      evidence_quotes: [],
      rationale: "",
      ...over.bec,
    },
    social: {
      social_engineering_score: 0,
      tactics: [],
      pretext_summary: null,
      call_to_action: null,
      evidence_quotes: [],
      rationale: "",
      ...over.social,
    },
  };
}

export function makeLlm(
  data: Partial<{
    content: Partial<CombinedAnalysis["content"]>;
    bec: Partial<CombinedAnalysis["bec"]>;
    social: Partial<CombinedAnalysis["social"]>;
  }> = {},
): LlmAnalysis {
  return { model: "test-model", degraded: false, data: makeCombinedAnalysis(data) };
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
    llm: over.llm ?? null,
    sink: over.sink ?? { urls: [], attachments: [] },
  };
}
