# SIH26106 — Phase-wise Implementation Plan

> **Status tracker**
>
> | Phase | Title | State |
> |---|---|---|
> | 1 | Scaffold, deploy, auth | ✅ code complete — build + typecheck green; deploy/login pending Neon + Google OAuth credentials |
> | 2 | Gmail ingest + minimal analysis + dashboard (vertical slice) | ✅ code complete — Gmail client, MIME parsing, stub heuristic scorer, batched scan job (start/tick/status), live loading screen + dashboard; needs a real inbox to verify |
> | 3 | Detector framework + deterministic detectors | ✅ code complete — pluggable pipeline, mailauth SPF re-check + Received-chain origin, DKIM/DMARC, impersonation, homoglyph/typosquat lookalike, header anomaly, interim attachment/url/content detectors; 31 unit tests green |
> | 4 | URL + attachment analysis + domain intel (RDAP) | ✅ code complete — SSRF-guarded redirect resolver (IP-pinned), RDAP domain-age lookup, DomainReputation cache, upgraded url.analysis + attachment.analysis detectors, enriched UrlMeta/AttachmentMeta persistence; 38 tests green |
> | 5 | Featherless LLM layer (content, BEC, social engineering) | ✅ code complete — OpenAI-compatible client, semaphore + backoff + Zod + repair-retry call layer, one combined prompt → 3 LLM-backed detectors, gated by `enableLlm` + degrades to deterministic-only with no API key; 53 tests green |
> | 6 | Geolocation & forensic intelligence | ✅ code complete — ipinfo.io geolocation + PTR (cached), GeoIntel populated per public Received hop, `/mail/[id]` detail page: score gauge, signal blocks, hop timeline, Leaflet map, auth-authenticity card, links/attachments, raw headers |
> | 7 | Demo mode, dashboard filters, mail page, settings | ⬜ not started |
> | 8 | Hardening, tests, performance, submission polish | ⬜ not started |

---

## Context

Smart India Hackathon problem **SIH26106**. Build an AI engine that connects to a user's Gmail
(Google OAuth, `gmail.readonly`), analyzes every message for **phishing / sender spoofing /
impersonation / malicious URLs & attachments / social engineering / Business Email Compromise**,
assigns a **0–100 fraud/risk score** with a **human-readable "why it was flagged" explanation**, and
adds **geolocation + forensic intelligence** per mail (originating IP, mail-server hop timeline,
SPF/DKIM/DMARC authenticity).

Deploy target: **Vercel**. Final deliverable: a 5-page web app — Google login → loading/"training"
screen → homepage summary dashboard → per-mail analysis page with geolocation → settings — plus a
**seeded demo mailbox** so judging never depends on a live inbox.

## Confirmed decisions

| Area | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript + Tailwind + shadcn-style UI |
| Deploy | Vercel (Hobby assumed) |
| Auth | Auth.js (NextAuth v5), Google provider, scope `gmail.readonly`, `access_type=offline` + `prompt=consent`, JWT session + `Account` rows for refresh token |
| Mail access | Gmail API via `googleapis` — `messages.list` + `format=raw` |
| Parsing / email-auth | `mailparser` (MIME) + `mailauth` (SPF/DKIM/DMARC + parsed Received chain in one call) |
| Database | Neon Postgres + Prisma |
| NLP / LLM | **Featherless AI** (OpenAI-compatible) via `openai` SDK with custom `baseURL` |
| Geo | `ipinfo.io` (key held); MaxMind `.mmdb` adapter as offline fallback |
| Demo | Real OAuth **and** on-demand seeded demo mailbox from curated `.eml` fixtures |

## Verified external facts (checked Sept 2026)

- **Featherless**: base URL `https://api.featherless.ai/v1`, OpenAI-compatible `/chat/completions`,
  auth `Authorization: Bearer $FEATHERLESS_API_KEY`, HF-style model IDs
  (`Qwen/Qwen2.5-72B-Instruct`, `meta-llama/Llama-3.3-70B-Instruct`, `meta-llama/Meta-Llama-3.1-8B-Instruct`).
  **No guaranteed structured-output** — send `response_format:{type:"json_object"}` best-effort, but
  rely on prompt-enforced JSON + Zod + a repair retry. Limit is **concurrency** (2–4 "units", 429 on
  exceed), not tokens — use a client semaphore (~3 in-flight) + backoff. Basic $10 plan caps models
  at ≤15B; recommend $25 Premium.
- **Vercel**: Hobby function max **300s**; Hobby **cron = once/day only** → the scan loop must be
  **client-orchestrated batched API calls**, not cron.
- **Gmail `gmail.readonly` is a restricted scope** → unverified app works for up to **100 OAuth test
  users** with no verification. Add judges as test users; keep app in "Testing" status; demo mode
  covers the rest.

## Required environment variables

```
DATABASE_URL / DIRECT_URL            # Neon pooled + direct (Prisma migrations)
AUTH_SECRET
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
FEATHERLESS_API_KEY                  # NEW — user must obtain
FEATHERLESS_BASE_URL                 # default https://api.featherless.ai/v1
FEATHERLESS_MODEL                    # default Qwen/Qwen2.5-72B-Instruct
FEATHERLESS_MAX_CONCURRENCY          # default 3
IPINFO_TOKEN                         # held
NEXTAUTH_URL / AUTH_URL              # deployment URL
```

---

## Project structure (target)

```
src/
  app/
    login/page.tsx                        # UI 1
    (app)/layout.tsx                      # session guard + nav
    (app)/scan/page.tsx                   # UI 2 — loading / "training"
    (app)/dashboard/page.tsx              # UI 3 — summary + filters
    (app)/mail/page.tsx , mail/[id]/page.tsx   # UI 4 — grouped list + forensic detail
    (app)/settings/page.tsx               # UI 5
    api/auth/[...nextauth]/route.ts
    api/scan/{start,tick,status}/route.ts
    api/emails/route.ts , emails/[id]/route.ts , emails/[id]/reanalyze/route.ts
    api/demo/load/route.ts , api/settings/route.ts
  server/
    auth.ts  db.ts
    gmail/{client,list,fetchRaw}.ts
    mail/{parse,types}.ts
    detect/{types,registry,aggregate,explain,pipeline}.ts
    detect/detectors/{auth-spf,auth-dkim-dmarc,sender-impersonation,lookalike-domain,
                      url-analysis,attachment-analysis,header-anomaly,
                      nlp-content,bec-classifier,social-engineering}.ts
    intel/{dns,rdap,geoip,received-chain,url-expand,reputation-cache}.ts
    llm/{client,callJson,schemas,prompts}.ts
    scan/{job,worker}.ts
    watchlist/brands.ts
  lib/{scoring,homoglyph,entropy,util}.ts
  components/{RiskBadge,ScoreGauge,SignalBlock,HopTimeline,GeoMap,Filters}.tsx , components/ui/*
prisma/{schema.prisma, seed.ts}
fixtures/eml/{phishing,bec,spoof,malicious-url,benign}/  + manifest.json
tests/{detectors,intel,llm,aggregate}/*.test.ts
```

## Prisma data model (key entities)

- **Auth.js**: `User`, `Account` (holds `refresh_token`/`access_token`/`expires_at`), `Session`, `VerificationToken`
- `UserSettings` — `detectorWeights` (JSON overrides), `bandThresholds`, `llmModel`, `enableLlm`,
  `scanWindowDays` (90), `maxEmails` (300), `brandWatchlist[]`
- `ScanJob` — `phase` (QUEUED→LISTING→FETCHING→ANALYZING→DOMAIN_INTEL→DONE/FAILED), `total`,
  `processed`, `failed`, `messageQueue` (JSON string[] — stateless resume), `bandHistogram`
- `EmailRecord` — parsed sender/display/domain/replyTo, subject, dates, truncated `bodyText`/`bodyHtml`,
  `rawHeaders` (JSON), unique `(userId, source, gmailId)`; relations to analysis/geo/urls/attachments
- `AnalysisResult` — `score` (0–100), `band` (SAFE/LOW/MEDIUM/HIGH/CRITICAL), `categories[]`,
  `summary` (explanation), `engineVersion`, `llmModel`; has many `Signal`
- `Signal` — `detectorId`, `category`, `triggered`, `rawScore`, `weight`, `contribution`, `severity`,
  `evidence` (JSON `Evidence[]`)
- `GeoIntel` — per Received hop: `hopIndex`, `ip`, `isTrustedOrigin`, `ptr`, country/city/lat/lon/asn/org, `timestamp`
- `DomainReputation` — cache: `spfRecord`, `spfAuthorizedIps`, `dmarcPolicy`, `domainAgeDays`, `mxHosts`,
  `lookalikeOf`, TTL
- `UrlMeta` / `AttachmentMeta` — per-artifact analysis rows
- `DnsCache` — low-level TXT/RDAP/GEO cache keyed by query string + TTL

## Detector / Signal interface

Every detector implements `Detector { id, category, defaultWeight, requires?, run(ctx) }` and returns
`DetectorResult { detectorId, category, triggered, score 0..1, confidence 0..1, severity, evidence: Evidence[], tags? }`.
`Evidence { label, value, kind: fact|quote|metric|comparison, ref? }`.

`DetectorContext` gives each detector: `email` (parsed), `auth` (mailauth SPF/DKIM/DMARC + Received
chain), cached `domainRep`, extracted `urls`/`attachments`, an `llm` gateway (no-op if disabled),
`intel` services (dns/rdap/geoip/expandUrl), and resolved `settings`.

**Aggregator** (`aggregate.ts`): `contribution_i = score_i × confidence_i × weight_i` (weight =
settings override ?? default); `score = 100 × Σcontribution / Σweight`; **critical-severity floor**
(any triggered `critical` signal → `score = max(score, 85)`); `band` from `settings.bandThresholds`;
`categories` ordered by summed contribution.

**Explainability** (`explain.ts`): deterministic template (no LLM) — leads with top category, quotes
the 2–3 highest-weighted `Evidence` items verbatim, states band + reason. UI renders per-signal blocks
with an evidence list and a contribution bar.

---

## Phase plan (8 phases, ~16–17 dev-days; phases 3–4 vs 5 parallelizable)

### Phase 1 — Scaffold, deploy, auth · ~0.5d
- `create-next-app` (App Router, TS, Tailwind, ESLint) → new git repo + GitHub; Vercel project linked.
- Neon project; Prisma init with auth models + `UserSettings` only; `prisma migrate deploy` in build.
- `src/server/auth.ts`: Google provider with offline/consent params + `gmail.readonly` scope; jwt/session
  callbacks persist tokens. `middleware.ts` guards `(app)`. `/login` page (app name, one-liner, Google button).
- **Done when:** deployed URL; sign in as a Google test user; `Account.refresh_token` non-null; protected route redirects when logged out.

### Phase 2 — Gmail ingest + minimal analysis + dashboard (vertical slice) · ~1.5d
- `src/server/gmail/*`: list IDs (`q = newer_than:{scanWindowDays}`, capped by `maxEmails`), fetch `format=raw`, base64url-decode.
- `src/server/mail/parse.ts` (`mailparser`) → `ParsedEmail` (from/display/replyTo, subject, dates, text/html, headers map, attachments, extracted URLs).
- Token-refresh helper (refresh when `expires_at` passed, update `Account`).
- Add `EmailRecord`/`AttachmentMeta`/`UrlMeta`/`AnalysisResult`/`Signal`/`ScanJob` migrations.
- `POST /api/scan/start` (create job, list IDs into `messageQueue`), `POST /api/scan/tick` (process a
  batch of 5 with a **stub heuristic** score), `GET /api/scan/status`.
- `/scan` loading page: call `start`, poll `tick` in a loop with animated progress + rotating status text.
- `/dashboard` (count tiles + band histogram), `/mail` (grouped by `senderDomain`).
- **Done when:** fresh login → `/scan` completes for ~100 mails → dashboard shows real subjects/senders + a crude score; refresh token survives access-token expiry.

### Phase 3 — Detector framework + deterministic detectors (headers, impersonation, lookalike) · ~2d
- `detect/types.ts` + `registry.ts` + `pipeline.ts` + `aggregate.ts` + `explain.ts` (real weighted score, band, explanation).
- Integrate `mailauth.authenticate()` once per email into context.
- Detectors: `auth-spf` (full spec steps — see below), `auth-dkim-dmarc` (+ compare with the
  `Authentication-Results` the provider already stamped; disagreement → `header-anomaly`),
  `sender-impersonation` (display-name shows brand but domain mismatch; reply-to ≠ from domain;
  freemail claiming corporate identity), `lookalike-domain` (`lib/homoglyph.ts` skeleton +
  Damerau-Levenshtein vs `watchlist/brands.ts` + user watchlist; `xn--`/punycode), `header-anomaly`
  (Date vs earliest-Received skew, missing Message-ID, chain anomalies).
- `DomainReputation` + `DnsCache` models; `intel/dns.ts` cached `resolveTxt`.
- Replace stub aggregator in `scan/tick` with the real pipeline (LLM detectors skipped for now).
- **Done when:** fixture unit tests pass — spoofed-SPF sample → SPF `fail` signal + HIGH/CRITICAL band;
  `m1crosoft-security.com` → lookalike signal citing `microsoft.com` + edit distance + homoglyph; benign newsletter → SAFE/LOW.

### Phase 4 — URL + attachment analysis + domain intel (RDAP) · ~2d
- `url-analysis`: extract from text + html (`cheerio`), anchor-text-vs-href mismatch, scheme, punycode,
  length, Shannon entropy (`lib/entropy.ts`), shortener list, **SSRF-guarded** redirect resolution
  (`intel/url-expand.ts`), final-domain age via RDAP.
- `attachment-analysis`: high-risk extensions (`.exe .bat .cmd .js .vbs .scr .ps1 .jar .hta .lnk .iso .msi`),
  double extension (`invoice.pdf.exe`), archives, MIME/extension mismatch.
- `intel/rdap.ts`: RDAP via `rdap.org` → `events` registration date → `domainAgeDays`; `whoiser` WHOIS
  fallback; cache in `DomainReputation`. Lookup failure = "unknown" (neutral 0.3), never "malicious".
- **Done when:** `bit.ly` → young punycode domain fixture → malicious-URL signal with redirect chain +
  age evidence; `report.pdf.scr` → CRITICAL attachment signal; SSRF test — URL resolving to
  `127.0.0.1` / `169.254.169.254` / `10.x` is refused.

### Phase 5 — Featherless LLM layer (content, BEC, social engineering) · ~2d
- `llm/client.ts`: `new OpenAI({ baseURL: FEATHERLESS_BASE_URL, apiKey: FEATHERLESS_API_KEY })`.
- `llm/callJson.ts`: shared `p-limit(3)` semaphore, 2 retries w/ backoff on 429/5xx, 25s AbortController
  timeout, best-effort `response_format:json_object` (retry without on HTTP 400), fence-strip + Zod
  `safeParse`, one **repair call** on failure, neutral degraded signal on second failure.
- `llm/schemas.ts` (Zod) + `prompts.ts`. **Prompt-injection defense:** system says email content is
  untrusted data; body wrapped in delimiters; body never in system role.
- **One combined call** per email returning `{ content, bec, social }` (spends 1 concurrency unit):
  - `content` — phishing likelihood, writing quality, grammar issues, emotional-manipulation tactics,
    requests-sensitive-info + types, threat/reward flags, impersonated entity, suspicious phrase quotes
  - `bec` — `is_bec`, `subtype` (payment_diversion / fake_invoice / ceo_fraud / payroll_change /
    vendor_fraud / gift_card_request / wire_transfer / w2_data_request), target action, spoofed
    authority, out-of-band-evasion flag, monetary amount, evidence quotes
  - `social` — score, tactics[], pretext summary, call-to-action, evidence quotes
- Detectors `nlp-content` / `bec-classifier` / `social-engineering` map sub-results → Signals.
- `enableLlm` toggle / missing key → pipeline runs deterministic-only.
- **Done when:** mocked-response tests cover parse + repair + degraded paths; live smoke test returns
  valid JSON; CEO-fraud fixture → `subtype: "ceo_fraud"` with quoted evidence; gift-card fixture → `subtype: "gift_card_request"`.

### Phase 6 — Geolocation & forensic intelligence · ~1.5d
- `intel/received-chain.ts`: use `mailauth` parsed `receivedChain`; select **earliest trusted hop** —
  walk oldest→newest, skip private/loopback/CGNAT IPs (`ipaddr.js`) and known provider inbound relays
  (`*.google.com`, `*.outlook.com`, SES, mimecast, pphosted — configurable); first remaining public-IP
  hop = originating MTA (`isTrustedOrigin`). Anything older than the earliest trusted-relay hop is
  attacker-controlled → shown but labelled "unverified / possibly forged".
- `intel/geoip.ts`: `GeoIpService` adapter — `ipinfo` impl now (`/{ip}/json?token=`), MaxMind stub;
  `p-limit(2)` + dedupe + cache (`DnsCache` key `GEO:<ip>`, 7d TTL). PTR via `dns.reverse` → mismatch feeds `header-anomaly`.
- Create `GeoIntel` rows for every public hop during `scan/tick`.
- `emails/[id]` returns hop list; `HopTimeline.tsx` (vertical stepper: host, IP, geo, timestamp, delta)
  + `GeoMap.tsx` (`react-leaflet` + OSM tiles, markers per hop, origin→delivery polyline) + header
  authenticity card (SPF/DKIM/DMARC chips, origin country, chain continuous?, timestamps monotonic?).
- **Done when:** multi-hop fixture → correct originating IP (unit test); map + timeline render; benign
  Gmail-relayed mail → origin resolves to a Google IP, authenticity card all-pass.

### Phase 7 — Demo mode, dashboard filters, mail page, settings · ~2d
- `fixtures/eml/` curated set (~15–20: phishing, 3–4 BEC subtypes, spoofed SPF-fail, lookalike domain,
  malicious shortened URL, double-extension attachment, 3–4 benign) + `manifest.json` (expected band).
- `prisma/seed.ts` + `POST /api/demo/load`: parse fixtures → insert `EmailRecord`s (`source="demo"`)
  for the current user → run full pipeline in batches synchronously. `/login` gets a "Try demo" button.
- `/dashboard` filters: free-text (subject/body), sender domain, category chips
  (phishing/BEC/spoof/malicious-URL/social-eng), risk band, time range — server-side Prisma `where` in `GET /api/emails`.
- `/mail` + `/mail/[id]`: accordion grouped by domain; each email expands into analysis **blocks**
  (Sender Auth / Content-NLP / URLs / Attachments / BEC / Geolocation) — each a `SignalBlock.tsx` with
  contribution + evidence bullets; mini-map per mail.
- `/settings`: detector-weight sliders (→ `UserSettings.detectorWeights`), band-threshold inputs, LLM
  model dropdown + enable toggle, scan window / max emails, brand-watchlist editor, "re-run analysis"
  (single + bulk via `emails/[id]/reanalyze`), "Delete my data".
- **Done when:** with an empty inbox, "Try demo" → populated dashboard in <30s; every demo email lands
  in its expected band (±1); moving a weight slider + re-run visibly shifts scores; filters combine correctly.

### Phase 8 — Hardening, tests, performance, submission polish · ~1.5d
- Vitest: every detector vs fixtures, received-chain selection, SSRF guard, homoglyph skeleton,
  aggregator math, LLM schema/repair (mocked), **golden test** — full pipeline over all fixtures
  asserts final band matches `manifest.json` (±1) = the detection-accuracy gate.
- Scan robustness: per-message try/catch (one bad email never fails the job), `tick` idempotency +
  resume via `messageQueue`, soft time budget (return early ~45s), `failed` counter in UI.
- Cache warm-up: dedupe DNS/RDAP/geo per domain within a job. Global 429 backoff with user-visible
  "AI analysis rate-limited, retrying" state.
- Error boundaries, empty states, loading skeletons; body truncation (≤32KB text / ≤64KB html); PII note.
- `README.md` (architecture diagram, env table, local setup, demo script, requirement→detector map);
  seed ~40-brand watchlist; `vercel.json` (`maxDuration: 300` for `scan/tick`, optional `@daily` cron).
- **Done when:** `pnpm test` green; full demo run recorded end-to-end; cold login→dashboard <90s for demo mailbox; no unhandled rejections in Vercel logs.

---

## SPF detector — explicit steps (`auth-spf.ts`, per spec)

1. `senderDomain` = domain of `From` address (public-suffix aware via `tldts`); also compute
   `Return-Path`/envelope-from domain and flag mismatch.
2. `spfRecord` = cached `dns.resolveTxt(senderDomain)` → record starting `v=spf1`; resolve
   `include:`/`redirect=`/`a`/`mx` within the RFC 7208 10-lookup limit (`mailauth` handles this);
   cache authorized `ip4:`/`ip6:` CIDRs in `DomainReputation.spfAuthorizedIps`.
3. `senderIp` = originating IP from the **earliest trusted Received hop** (`intel/received-chain.ts`).
4. Compare `senderIp` against authorized CIDRs (`ipaddr.js`).
5. Fold into risk: `pass` → 0; `none`/`neutral` → 0.3; `softfail` → 0.6; `fail`/`permerror` with real
   mismatch → 1.0 (severity `critical` when combined with display-name/domain deception).

## Scan job design (the Vercel-constraint core)

Client-orchestrated, server-persisted queue (no cron, no long-running process):
1. `/scan` mounts → `POST /api/scan/start` → creates `ScanJob`, lists all message IDs into
   `ScanJob.messageQueue`, sets `total`, returns `{ jobId, total }`.
2. Client loops: `POST /api/scan/tick { jobId }` → pops `BATCH_SIZE` (5) IDs → fetch raw + parse +
   store + build context (DNS/RDAP/geo with per-job cache) + run pipeline + persist
   `AnalysisResult`/`Signal`/`GeoIntel` → update `processed`/`bandHistogram`/queue → return progress.
   Target <60s/tick (ceiling 300s); early-return at ~45s elapsed.
3. Phases surfaced to the loading screen with rotating copy ("Resolving sender SPF records…",
   "Geolocating mail servers…", "Scoring 43 of 210 messages…").
4. Progress via the `tick` response; `GET /api/scan/status` is the reload-resilience fallback (resume
   an unfinished job on remount).
5. Idempotent: `EmailRecord` unique `(userId, source, gmailId)` → re-processing is a no-op upsert.
6. Demo mode: `POST /api/demo/load` runs the same batched pipeline over fixtures — no Gmail calls.

## URL redirect SSRF guard (`intel/url-expand.ts`)

Reject non-http(s). DNS-resolve host first (`dns.lookup {all:true}`); reject if any A/AAAA is
private/loopback/link-local/unique-local/CGNAT/reserved or `169.254.169.254` / `0.0.0.0` / `::1`.
Manual redirect loop with `undici` (`maxRedirections:0`), re-run the IP check on every hop, max 5 hops,
3s/hop timeout, 1MB cap, no cookies. Pin the connection to the vetted IP (custom `lookup`) to stop
DNS-rebinding TOCTOU. Only ever process URLs already extracted+stored from parsed emails — never a
host supplied by the client.

## Key risks & mitigations

| Risk | Mitigation |
|---|---|
| `gmail.readonly` restricted scope / "unverified app" | Add judges as OAuth **test users** (≤100), keep app in "Testing"; **demo mode** covers live demo; document verification path in README |
| Vercel 300s timeout on large mailboxes / slow LLM | Batched `tick` (5), soft time budget + early return, persisted resumable queue, `maxEmails` cap (300) |
| Featherless latency / 429 concurrency cap | Global `p-limit(3)`, backoff, degraded-signal fallback (deterministic score still valid), one combined call/email, `enableLlm` toggle, cache results so re-runs are free; recommend $25 Premium |
| Featherless JSON unreliability | best-effort `json_object` + fence strip + Zod + repair call + neutral fallback; prefer Qwen2.5-72B / Llama-3.3-70B; unit-test the repair path |
| DNS / RDAP / WHOIS rate limits | `DnsCache` + `DomainReputation` TTL caches, per-job domain dedupe, `p-limit(4)`, RDAP→WHOIS fallback, failure = "unknown" not "malicious" |
| Prompt injection via email body | Untrusted-data framing, delimited body, body never in system role, Zod-constrained output |
| SSRF via redirect resolution | Full guard above (pre-resolve, classify, block, pin, cap, timeout, server-only URLs) |
| Storing users' email content (PII) in Neon | Truncate bodies, "Delete my data" (cascade), retention note, only derived domains/IPs sent to intel APIs |
| Google refresh token only issued on first consent | `access_type=offline` + `prompt=consent`, store on every sign-in, force re-consent if missing |
| Homoglyph false positives (real `microsoft.com` flagged) | Exact allowlist of brand canonical domains + known senders; flag only when skeleton matches a brand AND domain ∉ that brand's known-good set |

## Verification / testing strategy

- **Unit (Vitest):** table-driven per detector over `fixtures/eml/*` + `manifest.json`; aggregator
  score math + band + critical floor; `received-chain` originating-IP selection (multi-hop / private-IP
  / forged-trailing fixtures); `url-expand` SSRF refusals + redirect-chain capture; homoglyph skeleton
  + false-positive guards; `callJson` parse / repair / degraded paths (mocked Featherless).
- **Golden test:** full pipeline over all fixtures → final band == expected band (±1) — the detection-accuracy gate.
- **Integration:** mock Gmail (`msw`/`nock`) → drive `/api/scan/start` + `/tick` → assert rows created,
  job reaches `DONE`, resumes after mid-batch kill.
- **OAuth:** manual checklist (test-user sign-in, `refresh_token` non-null, force-expire → refresh
  works) + Playwright with an `E2E=true` fake-credentials provider that mints a session for a seeded
  user, then E2E the full app flow against demo data.
- **Demo procedure (judges):** `/login` → "Try demo" → real Google sign-in (test user) → `/scan`
  phased progress over ~15 curated emails (~20–30s) → `/dashboard` filter "BEC" → open CEO-fraud email
  → walk signal blocks (SPF fail, lookalike math, LLM BEC subtype + quotes, URL redirect chain, hop
  timeline + world map) → `/settings` raise SPF weight + re-run → score increases. Keep a recorded screencast as backup.

## First files to create (everything depends on these)

- `prisma/schema.prisma` — data model
- `src/server/detect/types.ts` — detector / signal / evidence contracts
- `src/server/detect/aggregate.ts` — weighted scoring + band + explainability entry
- `src/server/scan/worker.ts` — batched serverless scan loop
- `src/server/llm/callJson.ts` — Featherless call + Zod + repair/retry + concurrency guard
- `src/server/intel/received-chain.ts` — earliest-trusted-hop selection (feeds SPF + geo)

## Open items for the user (non-blocking)

- Obtain `FEATHERLESS_API_KEY`; confirm plan tier ($25 Premium recommended for 70B models + 4 concurrency).
- Final app name (placeholder used in UI copy until then).
- Add judge/tester Google accounts as OAuth test users before the demo.
