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
| `FEATHERLESS_API_KEY` | ⬜ (Phase 5) | Featherless AI key. Without it, analysis runs deterministic-only. |
| `FEATHERLESS_BASE_URL` | ⬜ | Default `https://api.featherless.ai/v1`. |
| `FEATHERLESS_MODEL` | ⬜ | Default `Qwen/Qwen2.5-72B-Instruct` (needs the $25 Premium plan; use an ≤15B model on Basic). |
| `FEATHERLESS_MAX_CONCURRENCY` | ⬜ | Default `3`. |
| `IPINFO_TOKEN` | ⬜ (Phase 6) | ipinfo.io token for sender-IP geolocation. |
| `SCAN_BATCH_SIZE` | ⬜ | Default `5` emails per `/api/scan/tick`. |

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
