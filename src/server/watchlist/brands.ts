import { skeleton } from "@/lib/homoglyph";

export type Brand = {
  /** canonical name, lower-case */
  name: string;
  /** display-name tokens that imply this brand */
  aliases: string[];
  /** all legitimate registrable domains for this brand */
  domains: string[];
};

export const BRANDS: Brand[] = [
  { name: "microsoft", aliases: ["microsoft", "office 365", "microsoft 365", "outlook", "onedrive", "ms support"], domains: ["microsoft.com", "office.com", "office365.com", "live.com", "outlook.com", "microsoftonline.com", "sharepoint.com", "azure.com"] },
  { name: "google", aliases: ["google", "gmail", "google workspace", "google drive"], domains: ["google.com", "gmail.com", "googlemail.com", "googleworkspace.com", "google.co.in"] },
  { name: "apple", aliases: ["apple", "icloud", "apple id", "app store"], domains: ["apple.com", "icloud.com"] },
  { name: "amazon", aliases: ["amazon", "aws", "amazon prime", "amazon pay"], domains: ["amazon.com", "amazon.in", "amazon.co.uk", "aws.amazon.com", "amazonaws.com", "primevideo.com"] },
  { name: "paypal", aliases: ["paypal"], domains: ["paypal.com", "paypal.co.uk", "paypal.in"] },
  { name: "netflix", aliases: ["netflix"], domains: ["netflix.com"] },
  { name: "meta", aliases: ["facebook", "meta", "instagram", "whatsapp"], domains: ["facebook.com", "fb.com", "meta.com", "instagram.com", "whatsapp.com"] },
  { name: "linkedin", aliases: ["linkedin"], domains: ["linkedin.com"] },
  { name: "dhl", aliases: ["dhl"], domains: ["dhl.com", "dhl.de"] },
  { name: "fedex", aliases: ["fedex"], domains: ["fedex.com"] },
  { name: "ups", aliases: ["ups", "united parcel"], domains: ["ups.com"] },
  { name: "dpd", aliases: ["dpd"], domains: ["dpd.com", "dpd.co.uk"] },
  { name: "hdfc", aliases: ["hdfc", "hdfc bank"], domains: ["hdfcbank.com", "hdfcbank.net"] },
  { name: "icici", aliases: ["icici", "icici bank"], domains: ["icicibank.com"] },
  { name: "sbi", aliases: ["sbi", "state bank of india", "yono"], domains: ["sbi.co.in", "onlinesbi.com", "onlinesbi.sbi", "sbi.com"] },
  { name: "axis", aliases: ["axis bank"], domains: ["axisbank.com"] },
  { name: "paytm", aliases: ["paytm"], domains: ["paytm.com", "paytmbank.com"] },
  { name: "phonepe", aliases: ["phonepe"], domains: ["phonepe.com"] },
  { name: "irctc", aliases: ["irctc", "indian railway"], domains: ["irctc.co.in"] },
  { name: "income tax", aliases: ["income tax", "incometax", "it department"], domains: ["incometax.gov.in", "incometaxindia.gov.in"] },
  { name: "uidai", aliases: ["uidai", "aadhaar"], domains: ["uidai.gov.in"] },
  { name: "docusign", aliases: ["docusign"], domains: ["docusign.com", "docusign.net"] },
  { name: "dropbox", aliases: ["dropbox"], domains: ["dropbox.com", "dropboxmail.com"] },
  { name: "adobe", aliases: ["adobe", "adobe sign"], domains: ["adobe.com", "adobesign.com"] },
  { name: "coinbase", aliases: ["coinbase"], domains: ["coinbase.com"] },
  { name: "binance", aliases: ["binance"], domains: ["binance.com"] },
];

const DOMAIN_SET = new Set(BRANDS.flatMap((b) => b.domains));
const SKELETON_INDEX: { skel: string; brand: Brand; domain: string }[] =
  BRANDS.flatMap((b) =>
    b.domains.map((d) => ({ skel: skeleton(d.split(".")[0]), brand: b, domain: d })),
  );

export function isKnownBrandDomain(registrableDomain: string): boolean {
  return DOMAIN_SET.has(registrableDomain.toLowerCase());
}

export function brandForDomain(registrableDomain: string): Brand | null {
  const d = registrableDomain.toLowerCase();
  return BRANDS.find((b) => b.domains.includes(d)) ?? null;
}

/** Brands whose alias appears in a display name. */
export function brandsInDisplayName(display: string | null | undefined): Brand[] {
  if (!display) return [];
  const d = display.toLowerCase();
  return BRANDS.filter((b) => b.aliases.some((a) => d.includes(a)));
}

export function brandSkeletonIndex() {
  return SKELETON_INDEX;
}
