import { getDomain } from "tldts";
import type { Severity } from "../types";

export function severityFromScore(score: number): Severity {
  if (score >= 0.85) return "critical";
  if (score >= 0.6) return "high";
  if (score >= 0.35) return "medium";
  if (score > 0) return "low";
  return "info";
}

export function registrableDomain(addressOrHost: string | null): string | null {
  if (!addressOrHost) return null;
  const host = addressOrHost.includes("@")
    ? addressOrHost.split("@").pop() ?? ""
    : addressOrHost;
  const h = host.trim().toLowerCase();
  return getDomain(h) ?? (h || null);
}

export const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "ymail.com",
  "outlook.com", "hotmail.com", "live.com", "aol.com", "icloud.com",
  "proton.me", "protonmail.com", "pm.me", "yandex.com", "gmx.com",
  "mail.com", "zoho.com", "rediffmail.com",
]);

export const CORP_TITLE_RE =
  /\b(ceo|cfo|coo|cto|president|director|chairman|managing director|head of finance|accounts payable|payroll|hr manager|vice president|vp of)\b/i;
