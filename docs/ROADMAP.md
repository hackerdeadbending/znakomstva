# Implementation roadmap

## Phase 0 — Verify the existing deployment
- Identify the current runtime, entry point, persistence layer, hosting, and bot webhook/polling mode.
- Inventory existing environment variable names without exposing their values.
- Confirm current bot commands and deployment workflow before replacing anything.

## Phase 1 — Core experience
- Welcome / start flow and profile creation/editing.
- Photo upload and profile preview.
- Discovery preferences and a clean one-profile-at-a-time flow.
- Like / pass with duplicate prevention.
- Mutual match creation and notifications.
- My profile, pause/hide profile, and account deletion.

## Phase 2 — Safety and administration
- Block and report flows.
- Moderation queue and user suspension tools.
- Owner/admin role separation for regentdvdd and makson_ss.
- Audit log for privileged actions.
- Rate limits and basic abuse detection.

## Phase 3 — Quality
- Database migrations, tests, structured logging, error handling.
- Recovery from Telegram API failures and idempotent updates.
- Localization and accessibility review.
- Deployment smoke tests and documented rollback.

## Phase 4 — Optional monetization
- Feature-entitlement service with a free default plan.
- Configurable Premium plans and limits.
- Payment adapter and verified payment events after provider selection.
- Subscription expiry, cancellation, refunds, and admin reporting.
- Feature flags so paid features can be launched gradually.

## Release gate
Do not claim the bot is production-ready until the existing deployment has been identified, the core flows are implemented, admin IDs are verified, migrations and tests pass, and a real Telegram smoke test succeeds.
