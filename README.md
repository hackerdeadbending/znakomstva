# Znakomstva — Telegram dating bot

A Telegram-first dating experience focused on simple discovery, mutual matches, privacy, and safety.

## Current status
The repository initially contained no application source code, so implementation starts with a documented modular foundation. See [the architecture](docs/ARCHITECTURE.md) and [the roadmap](docs/ROADMAP.md).

## Planned core experience
- Profile creation and editing, with photos and preferences.
- One-at-a-time discovery cards, like/pass, and mutual matches.
- Privacy controls, profile pause, block, and report.
- Owner/admin tools with auditable moderation.
- A modular entitlement system reserved for future Premium features.

## Security notes
- Never commit bot tokens, database credentials, or populated environment files.
- Use numeric Telegram user IDs for privileged authorization; usernames can change.
- Billing stays disabled until a payment provider and verified webhook flow are implemented.
- Do not deploy as production-ready until the runtime and current hosting configuration are confirmed and end-to-end tests pass.

## Setup
See `.env.example` for the safe configuration template. The runtime and database must be selected or confirmed before implementation of the bot entry point.
