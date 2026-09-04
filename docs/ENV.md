# Environment variables

Create `.env.local` in the project root (git-ignored). All of these are read at
runtime; the `NEXT_PUBLIC_` prefix is not used — everything here is server-side.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon **pooled** connection string (`...-pooler...`). Used by the app. |
| `DIRECT_URL` | ✅ | Neon **direct** connection string (no `-pooler`). Used by `prisma db push` / `migrate`. |
| `AUTH_SECRET` | ✅ | `npx auth secret` or `openssl rand -base64 33`. |
| `AUTH_URL` | ✅ (prod) | Full deployment URL, e.g. `https://mailsentry.vercel.app`. Local dev can omit. |
| `GOOGLE_CLIENT_ID` | ✅ | Google Cloud → APIs & Services → Credentials → OAuth client (Web). |
| `GOOGLE_CLIENT_SECRET` | ✅ | Same OAuth client. |
| `FEATHERLESS_API_KEY` | ⬜ | Featherless AI key (featherless.ai → Settings → API keys). Without it the NLP/BEC/social-engineering detectors report "AI analysis unavailable" and the score is deterministic-only — nothing crashes. |
| `FEATHERLESS_BASE_URL` | ⬜ | Default `https://api.featherless.ai/v1`. |
| `FEATHERLESS_MODEL` | ⬜ | Default `Qwen/Qwen2.5-14B-Instruct`. See **Choosing a Featherless model** below before switching to a larger one. |
| `FEATHERLESS_MAX_CONCURRENCY` | ⬜ | Default `4` in-flight requests. Match this to your plan's concurrency-unit limit — see below. |
| `IPINFO_TOKEN` | ⬜ (Phase 6) | ipinfo.io token for sender-IP geolocation. |
| `SCAN_BATCH_SIZE` | ⬜ | Default `8` emails per `/api/scan/tick`. |

## Choosing a Featherless model

Featherless bills concurrency in **per-model units**, not a flat request
count, and the cost scales steeply with model size (measured against a
`feather_pro_plus` key with a 4-unit plan limit):

| Model | Cost | Concurrent requests on a 4-unit plan |
|---|---|---|
| `Qwen/Qwen2.5-7B-Instruct` / `Qwen/Qwen2.5-14B-Instruct` | 1 unit | 4 |
| `Qwen/Qwen2.5-32B-Instruct` | 2 units | 2 |
| `Qwen/Qwen2.5-72B-Instruct` | 4 units | **1** |

A 70B-class model isn't just slower per call — on most plans it consumes
the *entire* concurrency budget, so every other "concurrent" request from
the scan batch immediately 429s and burns a retry (each retry adds ~1.5–9s
of pure backoff). That compounds fast across a batch and was the primary
cause of a very slow scan in testing. Unless you're on a large enough plan
to run several 70B calls at once, prefer a ≤15B model — the analysis
quality difference is modest for this use case, and the throughput gain is
roughly 4x. Set `FEATHERLESS_MAX_CONCURRENCY` to match your plan's *unit*
limit divided by the chosen model's unit cost, not the raw plan number.

## Google OAuth setup (one-time)

1. Google Cloud Console → create a project.
2. **APIs & Services → Library** → enable **Gmail API**.
3. **OAuth consent screen** → External → publishing status **Testing** →
   add scope `https://www.googleapis.com/auth/gmail.readonly` → add each
   tester's Google email under **Test users** (up to 100).
4. **Credentials → Create OAuth client ID → Web application**:
   - Authorized JavaScript origins: `http://localhost:3000`, your Vercel URL
   - Authorized redirect URIs:
     `http://localhost:3000/api/auth/callback/google`,
     `https://<your-vercel-url>/api/auth/callback/google`
5. Copy the client ID/secret into `.env.local` / Vercel env.

## Database setup (one-time)

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # if node isn't on PATH
npm run db:push        # creates all tables in Neon from prisma/schema.prisma
```
