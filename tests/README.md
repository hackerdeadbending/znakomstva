# Test coverage checklist

- Profile validation and adult-only eligibility policy.
- Discovery excludes self, blocked users, hidden profiles, and previously passed profiles according to product rules.
- A like creates a match only when the reverse like exists.
- Repeated Telegram updates do not create duplicate likes or matches.
- Blocking prevents further discovery and interaction in both directions.
- Reports are rate-limited and visible to authorized moderators only.
- Admin authorization uses configured numeric Telegram IDs, not display names alone.
- Premium entitlements default to free when subscription data is absent or invalid.
- Payment webhook events are signature-verified and idempotent before billing is enabled.
