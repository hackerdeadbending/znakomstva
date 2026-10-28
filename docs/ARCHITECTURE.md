# Dating bot architecture

## Product principles
- Telegram-first onboarding with a short, skippable profile wizard.
- Discovery cards with like, pass, profile details, and report/block actions.
- A match is created only when both users like each other.
- Respect privacy: never expose a user's Telegram phone number; reveal only fields they explicitly publish.
- Moderation and abuse reporting are first-class flows, not afterthoughts.
- Accessible Russian-first copy, with localization kept separate from business logic.

## Modules
- `bot/`: Telegram handlers and keyboards only; handlers call services.
- `services/`: profile, discovery, likes/matches, chat, moderation, subscriptions.
- `repositories/`: persistence queries and transactions.
- `domain/`: entities, enums, and validation rules.
- `config/`: environment-backed settings; no secrets in source.
- `migrations/`: versioned database schema changes.
- `tests/`: unit and integration tests.

## Suggested data model
- `users`: Telegram user ID, account status, created_at, last_active_at.
- `profiles`: display name, birth date (validate adult-only use), bio, city, gender/preferences, visibility state.
- `profile_photos`: file reference, ordering, moderation state.
- `likes`: actor_id, target_id, created_at; unique actor/target pair.
- `matches`: canonical user pair, created_at, state; unique pair.
- `blocks`: blocker_id, blocked_id, created_at.
- `reports`: reporter_id, target_id, category, details, status, reviewed_by, timestamps.
- `admin_audit_log`: actor, action, target, timestamp, metadata.
- `subscriptions`: user_id, plan_id, status, starts_at, expires_at, provider_reference.
- `plans` and `entitlements`: configurable features and limits without coupling them to dating logic.

## Admin access
The intended Telegram usernames are `regentdvdd` (owner) and `makson_ss` (admin). Usernames are mutable and are not a strong identity boundary. Before enabling privileged actions in production, resolve and configure the numeric Telegram user IDs in trusted environment variables. Never let a normal user self-assign admin status. Owner-only actions (admin grants/revocations, billing configuration, critical settings) must be separate from moderator actions. Record sensitive admin actions in an audit log.

## Paid features, later
Keep the free product fully functional. Paid features should be expressed as entitlements checked by a single service, not scattered conditionals. Add payment-provider adapters and verified webhook handling only when the provider is chosen. Never trust a client-side payment success message. Keep subscription state and payment events auditable.

## Reliability and security
- Use database transactions for likes/matches and payment state transitions.
- Use parameterized queries and least-privilege database credentials.
- Rate-limit discovery, likes, messages, and reports.
- Validate all user-provided text and media; add report/block controls in key flows.
- Store secrets only in deployment environment variables.
- Use migrations and automated tests before production schema changes.
- Do not silently delete profiles or conversations as an authentication failure response.
