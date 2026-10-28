# AMORI — Telegram Mini App

A polished, mobile-first dating Mini App for Telegram, built around profile discovery, mutual matches, privacy and safety.

## Start locally

Requirements: Node.js 20+.

    npm install
    npm run dev

Vite prints a local development URL. To create a production bundle:

    npm test
    npm run build
    npm run preview

The interface initializes Telegram WebApp when opened inside Telegram and remains viewable in a normal browser for UI development.

## Current status

The current feature branch contains a front-end prototype, an initial authenticated API, and the initial database design. Demo profiles, likes and match feedback are not yet backed by a server and reset on refresh. Do not treat the prototype as a live dating service.

See:
- [Architecture](docs/ARCHITECTURE.md)
- [Telegram Mini App plan](docs/TELEGRAM_MINI_APP.md)
- [Roadmap](docs/ROADMAP.md)
- [Implementation status and release gates](docs/IMPLEMENTATION_STATUS.md)
- [Initial PostgreSQL schema](db/migrations/001_initial_schema.sql)

## Safety and privacy

- The service is intended for adults 18+ only.
- Telegram WebApp initData must be signature-verified by a backend before identifying a user.
- Admin access must use numeric Telegram user IDs configured as secret environment variables. Usernames can change and are not authorization.
- Never commit bot tokens, database credentials, or populated .env files.
- Premium is a preview only; payment is not connected.
- Block/report enforcement, moderation, and backend authorization are release blockers.

## Deployment

A Render Blueprint is provided in render.yaml for the static front-end prototype on the feature branch. The existing Render service found in the connected workspace belongs to another repository, so it has deliberately not been modified. Deploy this repository as its own service after reviewing the branch and hosting settings.
