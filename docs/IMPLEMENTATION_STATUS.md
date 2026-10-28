# AMORI implementation status

## Implemented on the feature branch

- Responsive React/Vite Telegram Mini App interface with animated discovery cards, likes, matches, profile/preferences and a Premium preview.
- Telegram WebApp initialization and a separate Render static-site deployment.
- Separate Node.js API service with Telegram initData signature verification and freshness checks.
- API endpoints for profile read/write, discovery, likes and mutual matches, blocks, reports, admin report review, and authenticated Telegram identity.
- Initial PostgreSQL schema and a versioned migration runner.
- Automated unit tests for Telegram WebApp authentication validation.
- Numeric Telegram user IDs, rather than usernames, are used for server-side admin authorization.

## Still needs configuration or implementation

- API environment variables `BOT_TOKEN`, `DATABASE_URL`, `OWNER_TELEGRAM_ID`, and `ADMIN_TELEGRAM_IDS` must be configured in Render. Do not put secrets in GitHub or send them in chat.
- Apply the initial migration after the database connection is configured.
- The frontend still uses demo profiles and local-only interaction state; connect the UI to the API before calling this a working dating service.
- Persistent chat messages, private photo uploads/storage, photo moderation, full moderation UI, rate limiting, data export/deletion, and payment webhooks remain to be implemented.
- The current Render free Postgres instance is a temporary development database and expires on 2026-11-27. Choose a durable database plan before production use.
- Premium is a preview only; no payments are enabled.

## Release gates

1. Configure and verify bot/database credentials in hosting.
2. Run tests and apply migrations.
3. Connect Mini App UI to the authenticated API and replace demo data.
4. Add chat persistence, media safety/moderation, rate limits, block/report enforcement, and privacy controls.
5. Verify owner/admin IDs and test end-to-end inside Telegram.
6. Only then promote the branch to main.
