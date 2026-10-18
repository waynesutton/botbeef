# Bot Battle

Live 15/30/45-second AI battles: pick a bot, coach it (or out-type it, or duel a friend), and Jev from TypeSafe scores both sides in real time through the Convex AI Gateway. Anyone with the link can watch.

Convex only: database, realtime, scheduling, workpools, presence, rate limits, the AI Gateway and static hosting (`*.convex.site`). The frontend is React and Vite.

- `app/`: the app. `app/convex` is the backend, `app/src` the SPA, `app/e2e` the Playwright/HTTP suites, `app/scripts/deploy.mjs` the deploy script.
- `art/`: source art and the puppet rig scripts that generate `app/public/c/*`.
- `PRD*.md`, `SETUP_LOG.md`: product and setup notes. `WRITE_CONFLICTS_REPORT.md` and `SECURITY_CHECK.md` are the latest audits.

## Run

```bash
cd app && npm install
cp .env.example .env.local      # then: npx convex dev
npx vite                        # local SPA against your dev deployment
node scripts/deploy.mjs         # build + deploy to prod (static files, then functions)
```

## Security

- **No sign-in, by design.** Each browser keeps a random secret, and the server stores only its SHA-256 (`sessions`). Each game seat has its own token, also stored hashed. Writes that need a seat (typing, lock-in, ending, invites, rematch) compare hashes on the server.
- **Public functions** (all intentionally public, all with `returns` validators that project display fields only; see `convex/returns.ts`):
  - `games.{start, rematch, type, lockIn, endGame, peekInvite, claimInvite, regenerateInvite, view}`
  - `leaderboard.{players, me, agents, recent}`
  - `rotation.suggestions`
  - `presence.{heartbeat, list, disconnect}`
  - HTTP: the SSR page, `robots.txt`, `llms.txt`, `agents.md`, `sitemap.xml`
  - Everything else is `internal*`. Admin and model tools run only via `npx convex run`.
- **Limits:**
  - Per IP (from Convex request metadata, 30 burst / 180 per hour) on everything that starts AI work.
  - Per session: 6 starts per 10 min.
  - Global sharded ceilings on new sessions and starts.
  - Per seat: typing rate.
  - Per host: invite regeneration.
  - Presence: at most 200 viewers per room.
  - Plus a per-session daily AI budget and a monthly spend alert.
- **Models are server-owned.** Clients can only pick a model id from each bot's allowlist. Prompts, tokens and providers never come from the client.
- **Secrets** live only in Convex env (`GROKBOT_ALERT_WEBHOOK_URL`, optional `BB_TRUSTED_IPS`). The AI Gateway uses a service token, so there is no provider key. Never commit `.env*` (only `.env.example`).
- **Pre-commit secret scan:** `git config core.hooksPath .githooks` (needs `gitleaks`).
- **Content and pages:** user text is rendered as text. The SSR page escapes everything and ships a strict CSP, `nosniff` and frame-ancestors rules. A hidden game (`results.hidden`) disappears from every public read path at once.

Characters are fan-made parodies, not affiliated with or endorsed by any AI company.
