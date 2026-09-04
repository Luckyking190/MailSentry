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
  { name: "kotak", aliases: ["kotak", "kotak mahindra"], domains: ["kotak.com", "kotakbank.com"] },
  { name: "pnb", aliases: ["pnb", "punjab national bank"], domains: ["pnbindia.in", "netpnb.com"] },
  { name: "indusind", aliases: ["indusind"], domains: ["indusind.com"] },
  { name: "lic", aliases: ["lic", "life insurance corporation"], domains: ["licindia.in"] },
  { name: "rbi", aliases: ["rbi", "reserve bank of india"], domains: ["rbi.org.in"] },
  { name: "epfo", aliases: ["epfo", "provident fund"], domains: ["epfindia.gov.in"] },
  { name: "gst", aliases: ["gst", "gst portal", "goods and services tax"], domains: ["gst.gov.in"] },
  { name: "passport seva", aliases: ["passport seva", "passport"], domains: ["passportindia.gov.in"] },
  { name: "jio", aliases: ["jio", "reliance jio"], domains: ["jio.com"] },
  { name: "airtel", aliases: ["airtel"], domains: ["airtel.in"] },
  { name: "vodafone idea", aliases: ["vodafone idea", "vi customer care"], domains: ["myvi.in"] },
  { name: "flipkart", aliases: ["flipkart"], domains: ["flipkart.com"] },
  { name: "swiggy", aliases: ["swiggy"], domains: ["swiggy.com"] },
  { name: "zomato", aliases: ["zomato"], domains: ["zomato.com"] },
  { name: "ola", aliases: ["ola", "ola cabs"], domains: ["olacabs.com"] },
  { name: "uber", aliases: ["uber"], domains: ["uber.com"] },
  { name: "zoom", aliases: ["zoom"], domains: ["zoom.us"] },
  { name: "slack", aliases: ["slack"], domains: ["slack.com"] },
  { name: "github", aliases: ["github"], domains: ["github.com"] },
  { name: "stripe", aliases: ["stripe"], domains: ["stripe.com"] },
  { name: "x", aliases: ["twitter", "x corp"], domains: ["twitter.com", "x.com"] },
  { name: "chase", aliases: ["chase", "jpmorgan chase"], domains: ["chase.com"] },
  { name: "bank of america", aliases: ["bank of america", "bofa"], domains: ["bankofamerica.com"] },
  { name: "wells fargo", aliases: ["wells fargo"], domains: ["wellsfargo.com"] },
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
