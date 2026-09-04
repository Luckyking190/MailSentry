# MailSentry — SIH26106

**AI-powered email threat detection, geolocation & forensic intelligence platform.**

Connects to a user's Gmail (Google OAuth, read-only), analyzes every message for
phishing, sender spoofing / impersonation, malicious URLs & attachments, social
engineering and Business Email Compromise, assigns a **0–100 fraud/risk score**
with a human-readable explanation, and adds **geolocation + forensic
intelligence** per mail (originating IP, mail-server hop timeline,
SPF/DKIM/DMARC authenticity).

Smart India Hackathon — problem statement **SIH26106**.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) — deployed on **Vercel**
- **Auth.js v5** + Google OAuth (`gmail.readonly`)
- **Prisma 6** + **Neon** Postgres
- **Featherless AI** (OpenAI-compatible) for NLP / BEC / social-engineering analysis
- **ipinfo.io** for sender-IP geolocation
- `mailparser` + `mailauth` for MIME parsing and SPF/DKIM/DMARC + Received-chain

## Local development

Node 24 is vendored at `~/.local/node` (not on the system PATH). Prefix commands:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

Then:

```bash
npm install
cp docs/ENV.md …          # see docs/ENV.md, create .env.local
npm run db:push           # push schema to Neon
npm run dev               # http://localhost:3000
```

See **[docs/ENV.md](docs/ENV.md)** for every environment variable and the
Google OAuth / Neon setup steps.

## Documentation

- **[docs/SIH26106-SPEC.md](docs/SIH26106-SPEC.md)** — the hackathon brief
- **[phase.md](phase.md)** — 8-phase implementation plan with a status tracker

## Project status

Phase 1 (scaffold, auth, app shell) in progress — see the tracker in `phase.md`.
