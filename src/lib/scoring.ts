import type { RiskBand } from "@prisma/client";

export type BandThresholds = {
  low: number;
  medium: number;
  high: number;
  critical: number;
};

export const DEFAULT_BAND_THRESHOLDS: BandThresholds = {
  low: 20,
  medium: 40,
  high: 65,
  critical: 85,
};

export function scoreToBand(
  score: number,
  t: BandThresholds = DEFAULT_BAND_THRESHOLDS,
): RiskBand {
  if (score >= t.critical) return "CRITICAL";
  if (score >= t.high) return "HIGH";
  if (score >= t.medium) return "MEDIUM";
  if (score >= t.low) return "LOW";
  return "SAFE";
}

export const BAND_ORDER: RiskBand[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "SAFE",
];

export const BAND_META: Record<
  RiskBand,
  { label: string; text: string; bg: string; ring: string; dot: string }
> = {
  CRITICAL: {
    label: "Critical",
    text: "text-rose-300",
    bg: "bg-rose-500/10",
    ring: "ring-rose-500/30",
    dot: "bg-rose-500",
  },
  HIGH: {
    label: "High",
    text: "text-orange-300",
    bg: "bg-orange-500/10",
    ring: "ring-orange-500/30",
    dot: "bg-orange-500",
  },
  MEDIUM: {
    label: "Medium",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/30",
    dot: "bg-amber-500",
  },
  LOW: {
    label: "Low",
    text: "text-sky-300",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/30",
    dot: "bg-sky-500",
  },
  SAFE: {
    label: "Safe",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
    dot: "bg-emerald-500",
  },
};

export const SIGNAL_CATEGORIES = [
  "phishing",
  "spoofing",
  "impersonation",
  "malicious_url",
  "malicious_attachment",
  "social_engineering",
  "bec",
  "header_anomaly",
] as const;

export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<SignalCategory, string> = {
  phishing: "Phishing",
  spoofing: "Spoofing",
  impersonation: "Impersonation",
  malicious_url: "Malicious URL",
  malicious_attachment: "Malicious attachment",
  social_engineering: "Social engineering",
  bec: "Business Email Compromise",
  header_anomaly: "Header anomaly",
};
