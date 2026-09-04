import { z } from "zod";

const clamp01 = z.number().min(0).max(1).catch(0);
const shortStr = z.string().max(600).catch("");

export const ContentAnalysisSchema = z.object({
  phishing_likelihood: clamp01,
  writing_quality: z
    .enum(["professional", "adequate", "poor", "machine_generated"])
    .catch("adequate"),
  grammar_issues: z.array(z.string().max(160)).max(8).catch([]),
  emotional_manipulation: z
    .array(
      z.enum([
        "urgency",
        "fear",
        "authority",
        "scarcity",
        "reward",
        "curiosity",
        "guilt",
      ]),
    )
    .max(7)
    .catch([]),
  requests_sensitive_info: z.boolean().catch(false),
  sensitive_info_types: z.array(z.string().max(60)).max(6).catch([]),
  contains_threat: z.boolean().catch(false),
  contains_reward_bait: z.boolean().catch(false),
  impersonated_entity: z.string().max(120).nullable().catch(null),
  suspicious_phrases: z
    .array(
      z.object({
        quote: z.string().max(240).catch(""),
        why: z.string().max(200).catch(""),
      }),
    )
    .max(6)
    .catch([]),
  rationale: shortStr,
});

export const BecAnalysisSchema = z.object({
  is_bec: z.boolean().catch(false),
  subtype: z
    .enum([
      "none",
      "payment_diversion",
      "fake_invoice",
      "ceo_fraud",
      "payroll_change",
      "vendor_fraud",
      "gift_card_request",
      "wire_transfer",
      "w2_data_request",
    ])
    .catch("none"),
  confidence: clamp01,
  target_action: z.string().max(200).nullable().catch(null),
  spoofed_authority: z.string().max(120).nullable().catch(null),
  urgency_pressure: z.boolean().catch(false),
  out_of_band_evasion: z.boolean().catch(false),
  monetary_amount: z.string().max(60).nullable().catch(null),
  evidence_quotes: z.array(z.string().max(240)).max(5).catch([]),
  rationale: z.string().max(500).catch(""),
});

export const SocialAnalysisSchema = z.object({
  social_engineering_score: clamp01,
  tactics: z
    .array(
      z.enum([
        "pretexting",
        "baiting",
        "quid_pro_quo",
        "authority_impersonation",
        "urgency_manufacturing",
        "trust_exploitation",
        "fear_appeal",
        "familiarity_exploitation",
      ]),
    )
    .max(8)
    .catch([]),
  pretext_summary: z.string().max(300).nullable().catch(null),
  call_to_action: z.string().max(200).nullable().catch(null),
  evidence_quotes: z.array(z.string().max(240)).max(5).catch([]),
  rationale: z.string().max(400).catch(""),
});

export const CombinedAnalysisSchema = z.object({
  content: ContentAnalysisSchema,
  bec: BecAnalysisSchema,
  social: SocialAnalysisSchema,
});

export type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>;
export type BecAnalysis = z.infer<typeof BecAnalysisSchema>;
export type SocialAnalysis = z.infer<typeof SocialAnalysisSchema>;
export type CombinedAnalysis = z.infer<typeof CombinedAnalysisSchema>;

/** JSON-shape hint embedded in the prompt / repair call. */
export const COMBINED_SHAPE = `{
  "content": {
    "phishing_likelihood": 0.0,
    "writing_quality": "professional|adequate|poor|machine_generated",
    "grammar_issues": ["..."],
    "emotional_manipulation": ["urgency|fear|authority|scarcity|reward|curiosity|guilt"],
    "requests_sensitive_info": false,
    "sensitive_info_types": ["password","OTP","bank details"],
    "contains_threat": false,
    "contains_reward_bait": false,
    "impersonated_entity": null,
    "suspicious_phrases": [{"quote":"...","why":"..."}],
    "rationale": "..."
  },
  "bec": {
    "is_bec": false,
    "subtype": "none|payment_diversion|fake_invoice|ceo_fraud|payroll_change|vendor_fraud|gift_card_request|wire_transfer|w2_data_request",
    "confidence": 0.0,
    "target_action": null,
    "spoofed_authority": null,
    "urgency_pressure": false,
    "out_of_band_evasion": false,
    "monetary_amount": null,
    "evidence_quotes": ["..."],
    "rationale": "..."
  },
  "social": {
    "social_engineering_score": 0.0,
    "tactics": ["pretexting|baiting|quid_pro_quo|authority_impersonation|urgency_manufacturing|trust_exploitation|fear_appeal|familiarity_exploitation"],
    "pretext_summary": null,
    "call_to_action": null,
    "evidence_quotes": ["..."],
    "rationale": "..."
  }
}`;
