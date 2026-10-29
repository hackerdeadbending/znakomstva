const AGE = 'extract(year from age(current_date, p.birth_date))::int';
const CARD_COLUMNS = `p.id, p.telegram_user_id, p.display_name, ${AGE} as age, p.bio, p.city, p.photo_file_id, p.is_verified`;
const NOT_BLOCKED = `not exists (select 1 from blocks b where (b.blocker_profile_id=$1 and b.blocked_profile_id=p.id) or (b.blocker_profile_id=p.id and b.blocked_profile_id=$1))`;
const NOT_BANNED = `not exists (select 1 from bot_users u where u.telegram_user_id=p.telegram_user_id and u.is_banned)`;

// ---------- users ----------
export async function touchUser(db, from) {
  const result = await db.query(
    `insert into bot_users (telegram_user_id, username) values ($1,$2)
     on conflict (telegram_user_id) do update set username=excluded.username, last_seen_at=now()
     returning *`,
    [from.id, from.username ? from.username.toLowerCase() : null]
  );
  return result.rows[0];
}

export async function setState(db, telegramId, state, stateData = {}) {
  await db.query('update bot_users set state=$2, state_data=$3 where telegram_user_id=$1', [telegramId, state, JSON.stringify(stateData)]);
}

export async function setRole(db, telegramId, role) {
  await db.query('update bot_users set role=$2 where telegram_user_id=$1', [telegramId, role]);
}

export async function findUser(db, ref) {
  const value = String(ref || '').trim().replace(/^@/, '');
  if (!value) return null;
  const result = /^\d+$/.test(value)
    ? await db.query('select * from bot_users where telegram_user_id=$1', [value])
    : await db.query('select * from bot_users where lower(username)=lower($1)', [value]);
  return result.rows[0] || null;
}

export async function listStaff(db) {
  const result = await db.query(`select telegram_user_id, username, role from bot_users where role in ('admin','owner') order by role desc, created_at`);
  return result.rows;
}

export async function broadcastRecipients(db) {
  const result = await db.query(
    `select u.telegram_user_id from bot_users u
     where not u.is_banned and exists (select 1 from profiles p where p.telegram_user_id=u.telegram_user_id)`
  );
  return result.rows.map(row => row.telegram_user_id);
}

// ---------- profiles ----------
export async function getProfile(db, telegramId) {
  const result = await db.query(`select p.*, ${AGE} as age from profiles p where p.telegram_user_id=$1`, [telegramId]);
  return result.rows[0] || null;
}

export async function getProfileById(db, profileId) {
  const result = await db.query(
    `select p.*, ${AGE} as age, u.username from profiles p
     left join bot_users u on u.telegram_user_id=p.telegram_user_id where p.id=$1`,
    [profileId]
  );
  return result.rows[0] || null;
}

export async function saveProfile(db, telegramId, d) {
  await db.query(
    `insert into profiles (telegram_user_id, display_name, birth_date, bio, city, gender, looking_for, photo_file_id, is_visible)
     values ($1,$2,$3,$4,$5,$6,$7,$8,true)
     on conflict (telegram_user_id) do update set
       display_name=excluded.display_name, birth_date=excluded.birth_date, bio=excluded.bio, city=excluded.city,
       gender=excluded.gender, looking_for=excluded.looking_for, photo_file_id=excluded.photo_file_id,
       is_visible=true, updated_at=now()`,
    [telegramId, d.name, d.birth, d.bio || '', d.city, d.gender, d.looking, d.photoFileId]
  );
  return getProfile(db, telegramId);
}

export async function toggleVisibility(db, telegramId) {
  const result = await db.query('update profiles set is_visible = not is_visible, updated_at=now() where telegram_user_id=$1 returning is_visible', [telegramId]);
  return result.rows[0]?.is_visible ?? null;
}

export async function setAgeFilter(db, telegramId, min, max) {
  await db.query('update profiles set age_min=$2, age_max=$3, updated_at=now() where telegram_user_id=$1', [telegramId, min, max]);
}

export async function deleteProfile(db, telegramId) {
  await db.query('delete from profiles where telegram_user_id=$1', [telegramId]);
}

// ---------- discovery ----------
export async function nextProfile(db, me) {
  const result = await db.query(
    `select ${CARD_COLUMNS}
     from profiles p
     where p.id <> $1 and p.is_visible = true and p.photo_file_id is not null
       and p.birth_date <= (current_date - interval '18 years')::date
       and ($2::text = 'a' or p.gender = $2::text)
       and p.looking_for in ('a', $3::text)
       and ($4::int is null or ${AGE} >= $4::int)
       and ($5::int is null or ${AGE} <= $5::int)
       and (p.age_min is null or p.age_min <= $6::int)
       and (p.age_max is null or p.age_max >= $6::int)
       and not exists (select 1 from likes l where l.from_profile_id=$1 and l.to_profile_id=p.id)
       and not exists (select 1 from passes s where s.from_profile_id=$1 and s.to_profile_id=p.id)
       and ${NOT_BLOCKED}
       and ${NOT_BANNED}
     order by (lower(p.city) = lower($7::text)) desc,
              exists (select 1 from likes l2 where l2.from_profile_id = p.id and l2.to_profile_id = $1) desc,
              random()
     limit 1`,
    [me.id, me.looking_for || 'a', me.gender, me.age_min, me.age_max, me.age, me.city || '']
  );
  return result.rows[0] || null;
}

// Idempotent: a repeated update returns { duplicate: true } and never creates a second like or match.
export async function like(db, me, targetId) {
  const client = await db.connect();
  try {
    await client.query('begin');
    const target = await client.query('select id, is_visible from profiles where id=$1', [targetId]);
    const blocked = await client.query(
      'select 1 from blocks where (blocker_profile_id=$1 and blocked_profile_id=$2) or (blocker_profile_id=$2 and blocked_profile_id=$1)',
      [me.id, targetId]
    );
    if (!target.rowCount || !target.rows[0].is_visible || target.rows[0].id === me.id || blocked.rowCount) {
      await client.query('rollback');
      return { ok: false };
    }
    const inserted = await client.query(
      'insert into likes (from_profile_id, to_profile_id) values ($1,$2) on conflict do nothing',
      [me.id, targetId]
    );
    if (!inserted.rowCount) {
      await client.query('rollback');
      return { ok: true, duplicate: true, matched: false };
    }
    await client.query('delete from passes where from_profile_id=$1 and to_profile_id=$2', [me.id, targetId]);
    const back = await client.query('select 1 from likes where from_profile_id=$1 and to_profile_id=$2', [targetId, me.id]);
    let matched = false;
    if (back.rowCount) {
      const [first, second] = [me.id, targetId].sort();
      const match = await client.query(
        'insert into matches (profile_a_id, profile_b_id) values ($1,$2) on conflict do nothing',
        [first, second]
      );
      matched = match.rowCount > 0;
    }
    await client.query('commit');
    return { ok: true, matched };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function pass(db, me, targetId) {
  await db.query(
    'insert into passes (from_profile_id, to_profile_id) values ($1,$2) on conflict do nothing',
    [me.id, targetId]
  );
}

export async function block(db, me, targetId) {
  const target = await db.query('select id from profiles where id=$1', [targetId]);
  if (!target.rowCount || target.rows[0].id === me.id) return false;
  await db.query('insert into blocks (blocker_profile_id, blocked_profile_id) values ($1,$2) on conflict do nothing', [me.id, targetId]);
  await db.query(
    'delete from matches where (profile_a_id=$1 and profile_b_id=$2) or (profile_a_id=$2 and profile_b_id=$1)',
    [me.id, targetId]
  );
  return true;
}

export async function report(db, me, targetId, reason) {
  const recent = await db.query(
    `select count(*)::int as n from reports where reporter_profile_id=$1 and created_at > now() - interval '24 hours'`,
    [me.id]
  );
  if (recent.rows[0].n >= 10) return { ok: false, reason: 'rate_limited' };
  const target = await db.query('select id from profiles where id=$1', [targetId]);
  if (!target.rowCount || target.rows[0].id === me.id) return { ok: false, reason: 'invalid_target' };
  await db.query('insert into reports (reporter_profile_id, reported_profile_id, reason) values ($1,$2,$3)', [me.id, targetId, reason]);
  await pass(db, me, targetId);
  return { ok: true };
}

// ---------- incoming likes / matches ----------
const INCOMING = `
  from likes l join profiles p on p.id = l.from_profile_id
  where l.to_profile_id = $1 and p.is_visible = true and p.photo_file_id is not null
    and not exists (select 1 from likes m where m.from_profile_id=$1 and m.to_profile_id=p.id)
    and not exists (select 1 from passes s where s.from_profile_id=$1 and s.to_profile_id=p.id)
    and ${NOT_BLOCKED} and ${NOT_BANNED}`;

export async function countIncoming(db, me) {
  const result = await db.query(`select count(*)::int as n ${INCOMING}`, [me.id]);
  return result.rows[0].n;
}

export async function nextIncoming(db, me) {
  const result = await db.query(`select ${CARD_COLUMNS} ${INCOMING} order by l.created_at limit 1`, [me.id]);
  return result.rows[0] || null;
}

export async function listMatches(db, me, limit = 10) {
  const result = await db.query(
    `select ${CARD_COLUMNS}, u.username
     from matches m
     join profiles p on p.id = case when m.profile_a_id=$1 then m.profile_b_id else m.profile_a_id end
     left join bot_users u on u.telegram_user_id = p.telegram_user_id
     where (m.profile_a_id=$1 or m.profile_b_id=$1) and p.is_visible = true
       and ${NOT_BLOCKED} and ${NOT_BANNED}
     order by m.created_at desc limit $2`,
    [me.id, limit]
  );
  return result.rows;
}

// ---------- moderation ----------
export async function nextReport(db) {
  const result = await db.query(
    `select r.id as report_id, r.reason, r.created_at as reported_at, ${CARD_COLUMNS}
     from reports r join profiles p on p.id = r.reported_profile_id
     where r.status in ('open','reviewing') order by r.created_at limit 1`
  );
  return result.rows[0] || null;
}

export async function getReport(db, reportId) {
  const result = await db.query(
    `select r.*, p.telegram_user_id as reported_telegram_id from reports r
     join profiles p on p.id = r.reported_profile_id where r.id=$1`,
    [reportId]
  );
  return result.rows[0] || null;
}

export async function setReportStatus(db, reportId, status) {
  await db.query(
    `update reports set status=$2, resolved_at = case when $2 in ('resolved','dismissed') then now() else null end where id=$1`,
    [reportId, status]
  );
}

export async function banUser(db, telegramId, reason) {
  await db.query('update bot_users set is_banned=true, ban_reason=$2 where telegram_user_id=$1', [telegramId, (reason || '').slice(0, 200) || null]);
  await db.query('update profiles set is_visible=false where telegram_user_id=$1', [telegramId]);
  await db.query(
    `update reports set status='resolved', resolved_at=now()
     where status in ('open','reviewing') and reported_profile_id in (select id from profiles where telegram_user_id=$1)`,
    [telegramId]
  );
}

export async function unbanUser(db, telegramId) {
  await db.query('update bot_users set is_banned=false, ban_reason=null where telegram_user_id=$1', [telegramId]);
  await db.query('update profiles set is_visible=true where telegram_user_id=$1', [telegramId]);
}

export async function stats(db) {
  const result = await db.query(`
    select
      (select count(*)::int from bot_users) as users,
      (select count(*)::int from profiles) as profiles,
      (select count(*)::int from profiles where is_visible and photo_file_id is not null) as active,
      (select count(*)::int from bot_users where is_banned) as banned,
      (select count(*)::int from bot_users where created_at > now() - interval '24 hours') as new24,
      (select count(*)::int from likes) as likes,
      (select count(*)::int from matches) as matches,
      (select count(*)::int from reports where status in ('open','reviewing')) as open_reports,
      (select count(distinct profile_id)::int from entitlements
         where feature_key='premium' and starts_at <= now() and (expires_at is null or expires_at > now())) as premium,
      (select count(*)::int from purchases) as purchases`);
  return result.rows[0];
}

export async function audit(db, actorTelegramId, action, targetType, targetId, metadata = {}) {
  await db.query(
    'insert into admin_audit_log (actor_telegram_user_id, action, target_type, target_id, metadata) values ($1,$2,$3,$4,$5)',
    [actorTelegramId, action, targetType, targetId == null ? null : String(targetId), JSON.stringify(metadata)]
  );
}

export async function recordPurchase(db, telegramId, productKey, stars, chargeId) {
  const result = await db.query(
    'insert into purchases (telegram_user_id, product_key, stars, charge_id) values ($1,$2,$3,$4) on conflict (charge_id) do nothing returning id',
    [telegramId, productKey, stars, chargeId]
  );
  return result.rowCount > 0;
}
