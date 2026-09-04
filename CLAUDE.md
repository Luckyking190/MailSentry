@AGENTS.md
@docs/SIH26106-SPEC.md
@phase.md

# MailSentry — SIH26106

AI-powered email threat detection, geolocation & forensic intelligence platform.

- **Spec:** `docs/SIH26106-SPEC.md` (the hackathon brief)
- **Implementation plan:** `phase.md` (8 phases, status tracker at the top)
- **Stack:** Next.js (App Router, TS) · Auth.js v5 + Google OAuth (`gmail.readonly`) · Prisma + Neon
  Postgres · Featherless AI (OpenAI-compatible) for NLP · `ipinfo.io` for geolocation · Vercel

## Local development

Node is installed at `~/.local/node` (not on the system PATH by default). Prefix commands with:

```
export PATH="$HOME/.local/node/bin:$PATH"
```

Then `npm run dev`. Environment variables go in `.env.local` — see `.env.example`.
