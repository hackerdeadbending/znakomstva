# Telegram Mini App product plan

## Product direction
Build a Telegram Mini App as the primary dating interface, with a Telegram bot as the entry point for launch, deep links, notifications, and support. The Mini App should feel like a polished mobile application rather than a command-driven bot.

## Main navigation
- Discover: profile cards, filters, like/pass, report/block.
- Likes: incoming likes and mutual matches; premium gating may be added later through entitlements.
- Chats: list of mutual matches and links to conversations.
- My profile: photos, bio, city, preferences, visibility and pause controls.
- Settings: privacy, language, safety, account deletion and help.

## Architecture
- `webapp/`: Mini App frontend; responsive, mobile-first UI.
- `bot/`: Telegram bot for /start, Web App launch button, notifications, deep links and support.
- `api/`: authenticated backend endpoints; validate Telegram initData server-side on every session exchange.
- `services/`: profile, discovery, likes/matches, moderation and entitlements.
- `repositories/`: persistence and transactions.
- `migrations/`: versioned schema.
- `tests/`: unit, integration and security tests.

## Authentication and security
- The frontend must not trust Telegram user fields supplied by the client. Verify Telegram Mini App initData on the server using Telegram's documented HMAC validation, check auth_date freshness, and create a short-lived application session.
- Do not put the bot token in frontend code or expose it in public configuration.
- Authorize the owner and administrator by numeric Telegram IDs configured in trusted environment variables. Usernames `regentdvdd` and `makson_ss` are useful display labels only, not authorization credentials.
- Enforce access control on the server, not just by hiding frontend controls.
- Add rate limits, input validation, audit logs, secure file handling, and report/block flows.
- Do not reveal Telegram phone numbers.

## Suggested data model
users, profiles, profile_photos, likes, matches, blocks, reports, admin_audit_log, plans, entitlements, subscriptions, payment_events.

## Premium-ready design
Keep core dating functionality free. Model optional paid capabilities as named entitlements and check them through one backend service. Use feature flags and a payment-provider adapter; do not hardcode payment-specific logic into discovery or matching. Payment webhooks must be verified and idempotent.

## Deployment sequence
1. Inspect the existing repository and deployment settings.
2. Confirm the bot framework, database and hosting already connected.
3. Implement a working Mini App shell and bot launch button.
4. Implement Telegram initData verification and secure API sessions.
5. Build profile onboarding and persistence.
6. Build discovery, likes and mutual matches.
7. Add moderation/admin and automated tests.
8. Test on Telegram mobile clients before production release.
