# Project Documentation Rules (Non-Obvious Only)

- `chat-backend/` is a Go app (not Node.js despite the repo root having `package.json`)
- Root `package.json` is solely for semantic-release tooling — it has no runtime code
- `scripts/package.json` is a separate, independent package just for `simulate-chat.js` (load tester)
- `chat-frontend/` is static HTML/CSS/JS served by Nginx via S2I — there is no build step for the frontend
- Message history arrives from the server **newest-first** but is reversed before delivery to clients (oldest-first in UI)
- The `active` flag on `Client` is NOT about WebSocket connectivity — it means "user has sent at least one message and appears in the online list"
- WS endpoint requires `?nickname=` query param validated **server-side**; missing or invalid nickname returns HTTP 400 before upgrade
- `.env.local` contains real credentials for an IBM TechZone cluster (gitignored); cluster expires August 20, 2026
