// Feature-entitlement layer (paywall). Core dating stays free by default.
//
// Add a paid feature without touching other code:
//  1. Add it to FEATURES (premiumOnly: true, or freeDailyLimit: N).
//  2. In the handler: const gate = await check(db, ctx, 'key'); if (!gate.allowed) show gate.message.
//  3. For daily limits add a counter to USAGE.
// While the global paywall is off (/paywall off, the default) everything is available to everyone.

export const FEATURES = {
  like: { title: 'Лайки', freeDailyLimit: 100 },
  see_likes: { title: 'Кто меня лайкнул', premiumOnly: true }
  // Ideas, not wired yet: superlike, boost, rewind, incognito
};

export const PRODUCTS = {
  premium_7: { key: 'premium_7', title: 'Premium на 7 дней', description: 'Все функции без ограничений', stars: 100, days: 7 },
  premium_30: { key: 'premium_30', title: 'Premium на 30 дней', description: 'Все функции без ограничений', stars: 300, days: 30 }
};

export async function getSetting(db, key, fallback = null) {
  const result = await db.query('select value from bot_settings where key=$1', [key]);
  return result.rowCount ? result.rows[0].value : fallback;
}

export async function setSetting(db, key, value) {
  await db.query(
    'insert into bot_settings (key, value) values ($1,$2) on conflict (key) do update set value=excluded.value',
    [key, String(value)]
  );
}

export async function paywallOn(db) {
  return (await getSetting(db, 'paywall', '0')) === '1';
}

export async function isPremium(db, profileId) {
  if (!profileId) return false;
  const result = await db.query(
    `select 1 from entitlements
     where profile_id=$1 and feature_key='premium' and starts_at <= now() and (expires_at is null or expires_at > now())
     limit 1`,
    [profileId]
  );
  return result.rowCount > 0;
}

export async function premiumUntil(db, profileId) {
  if (!profileId) return null;
  const result = await db.query(
    `select max(expires_at) as until from entitlements
     where profile_id=$1 and feature_key='premium' and expires_at > now()`,
    [profileId]
  );
  return result.rows[0]?.until || null;
}

export async function grantPremium(db, profileId, days, source = 'manual') {
  const base = await db.query(
    `select greatest(now(), coalesce(max(expires_at), now())) as base
     from entitlements where profile_id=$1 and feature_key='premium'`,
    [profileId]
  );
  const inserted = await db.query(
    `insert into entitlements (profile_id, feature_key, source, starts_at, expires_at)
     values ($1, 'premium', $2, now(), $3::timestamptz + make_interval(days => $4::int))
     returning expires_at`,
    [profileId, source, base.rows[0].base, days]
  );
  return inserted.rows[0].expires_at;
}

export async function freeLimit(db, key, feature) {
  const raw = await getSetting(db, 'limit:' + key);
  if (raw === null) return feature.freeDailyLimit ?? null;
  if (raw === 'none') return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : feature.freeDailyLimit ?? null;
}

export const USAGE = {
  like: async (db, ctx) => {
    const result = await db.query(
      `select count(*)::int as n from likes
       where from_profile_id=$1 and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'`,
      [ctx.profile.id]
    );
    return result.rows[0].n;
  }
};

// ctx: { isStaff, profile }
export async function check(db, ctx, key) {
  const feature = FEATURES[key];
  if (!feature) throw new Error('Unknown feature: ' + key);
  if (ctx.isStaff) return { allowed: true };
  if (await isPremium(db, ctx.profile?.id)) return { allowed: true };
  if (!(await paywallOn(db))) return { allowed: true };
  if (feature.premiumOnly) {
    return { allowed: false, reason: 'premium_only', message: `⭐ Функция «${feature.title}» доступна в Premium.` };
  }
  const limit = await freeLimit(db, key, feature);
  if (limit !== null && ctx.profile && USAGE[key]) {
    const used = await USAGE[key](db, ctx);
    if (used >= limit) {
      return {
        allowed: false,
        reason: 'limit',
        message: `Лимит «${feature.title}» на сегодня исчерпан (${limit}). Счётчик обнулится завтра, или оформи ⭐ Premium без ограничений.`
      };
    }
  }
  return { allowed: true };
}
