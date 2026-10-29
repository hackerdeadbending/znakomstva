import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pg from 'pg';
import { verifyTelegramInitData } from './telegram-auth.js';
import { startTelegramBot } from './telegram-bot.js';

const { Pool } = pg;
const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',').map(v => v.trim()) : true, methods: ['GET','POST','PUT','PATCH','OPTIONS'], allowedHeaders: ['Content-Type','X-Telegram-Init-Data'] }));
app.use(express.json({ limit: '64kb' }));

const PORT = Number(process.env.PORT || 3001);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const OWNER_ID = process.env.OWNER_TELEGRAM_ID || '';
const ADMIN_IDS = new Set([OWNER_ID, ...(process.env.ADMIN_TELEGRAM_IDS || '').split(',')].map(v => v.trim()).filter(Boolean));
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000 }) : null;

app.get('/health', (_req, res) => res.json({ ok: true, service: 'amori-api', configured: Boolean(BOT_TOKEN && pool) }));
app.get('/api/status', (_req, res) => res.json({ name: 'AMORI API', ready: Boolean(BOT_TOKEN && pool), missing: [!BOT_TOKEN && 'BOT_TOKEN', !pool && 'DATABASE_URL'].filter(Boolean) }));

function verifyInitData(raw) { return verifyTelegramInitData(raw, BOT_TOKEN); }

function requireConfig(_req, res, next) {
  if (!BOT_TOKEN || !pool) return res.status(503).json({ error: 'service_not_configured', message: 'The API needs BOT_TOKEN and DATABASE_URL in the hosting environment.' });
  next();
}
function auth(req, res, next) {
  const user = verifyInitData(req.get('X-Telegram-Init-Data') || '');
  if (!user) return res.status(401).json({ error: 'invalid_telegram_session' });
  req.telegramUser = user;
  next();
}
function requireAdmin(req, res, next) {
  if (!ADMIN_IDS.has(req.telegramUser.id)) return res.status(403).json({ error: 'admin_only' });
  next();
}
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
function ageFromDate(value) {
  const birth = new Date(value + 'T00:00:00Z');
  if (!value || Number.isNaN(birth.getTime()) || birth.toISOString().slice(0,10) !== value) return -1;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

app.use('/api', requireConfig);

app.get('/api/whoami', auth, (req, res) => res.json({ telegramUserId: req.telegramUser.id, isAdmin: ADMIN_IDS.has(req.telegramUser.id) }));

app.get('/api/me', auth, asyncRoute(async (req, res) => {
  const result = await pool.query('select id, display_name, birth_date, bio, city, interests, is_visible, is_verified, created_at, updated_at from profiles where telegram_user_id = $1', [req.telegramUser.id]);
  res.json({ profile: result.rows[0] || null });
}));

app.put('/api/me', auth, asyncRoute(async (req, res) => {
  const { displayName, birthDate, bio = '', city = '', interests = [] } = req.body || {};
  if (typeof displayName !== 'string' || displayName.trim().length < 1 || displayName.trim().length > 40) return res.status(400).json({ error: 'invalid_display_name' });
  const age = ageFromDate(birthDate);
  if (age < 18 || age > 110) return res.status(400).json({ error: 'adults_only' });
  if (typeof bio !== 'string' || bio.length > 500 || typeof city !== 'string' || city.length > 100 || !Array.isArray(interests) || interests.length > 20 || interests.some(x => typeof x !== 'string' || x.length > 40)) return res.status(400).json({ error: 'invalid_profile_fields' });
  const result = await pool.query(
    `insert into profiles (telegram_user_id, display_name, birth_date, bio, city, interests)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (telegram_user_id) do update set display_name=excluded.display_name, birth_date=excluded.birth_date, bio=excluded.bio, city=excluded.city, interests=excluded.interests, updated_at=now()
     returning id, display_name, birth_date, bio, city, interests, is_visible, is_verified, created_at, updated_at`,
    [req.telegramUser.id, displayName.trim(), birthDate, bio.trim(), city.trim(), interests]
  );
  res.json({ profile: result.rows[0] });
}));

app.get('/api/likes/incoming', auth, asyncRoute(async (req, res) => {
  const me = await pool.query('select id from profiles where telegram_user_id=$1', [req.telegramUser.id]);
  if (!me.rowCount) return res.status(409).json({ error: 'profile_required' });
  const result = await pool.query(
    `select p.id, p.display_name, extract(year from age(current_date, p.birth_date))::int as age,
       p.bio, p.city, p.interests, p.is_verified,
       (select storage_key from profile_photos ph where ph.profile_id=p.id and ph.moderation_status='approved' order by ph.position limit 1) as photo_key,
       l.created_at as liked_at
     from likes l join profiles p on p.id=l.from_profile_id
     where l.to_profile_id=$1 and p.is_visible=true
       and not exists (select 1 from blocks b where (b.blocker_profile_id=$1 and b.blocked_profile_id=p.id) or (b.blocker_profile_id=p.id and b.blocked_profile_id=$1))
     order by l.created_at desc limit 100`,
    [me.rows[0].id]
  );
  res.json({ profiles: result.rows });
}));

app.get('/api/matches', auth, asyncRoute(async (req, res) => {
  const me = await pool.query('select id from profiles where telegram_user_id=$1', [req.telegramUser.id]);
  if (!me.rowCount) return res.status(409).json({ error: 'profile_required' });
  const result = await pool.query(
    `select m.id as match_id, m.created_at as matched_at,
       p.id, p.display_name, extract(year from age(current_date, p.birth_date))::int as age,
       p.bio, p.city, p.interests, p.is_verified,
       (select storage_key from profile_photos ph where ph.profile_id=p.id and ph.moderation_status='approved' order by ph.position limit 1) as photo_key
     from matches m
     join profiles p on p.id = case when m.profile_a_id=$1 then m.profile_b_id else m.profile_a_id end
     where (m.profile_a_id=$1 or m.profile_b_id=$1) and p.is_visible=true
       and not exists (select 1 from blocks b where (b.blocker_profile_id=$1 and b.blocked_profile_id=p.id) or (b.blocker_profile_id=p.id and b.blocked_profile_id=$1))
     order by m.created_at desc limit 100`,
    [me.rows[0].id]
  );
  res.json({ matches: result.rows });
}));

app.get('/api/discovery', auth, asyncRoute(async (req, res) => {
  const me = await pool.query('select id from profiles where telegram_user_id=$1', [req.telegramUser.id]);
  if (!me.rowCount) return res.status(409).json({ error: 'profile_required' });
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 15));
  const result = await pool.query(
    `select p.id, p.display_name, extract(year from age(current_date, p.birth_date))::int as age, p.bio, p.city, p.interests, p.is_verified,
       (select storage_key from profile_photos ph where ph.profile_id=p.id and ph.moderation_status='approved' order by ph.position limit 1) as photo_key
     from profiles p
     where p.id <> $1 and p.is_visible=true and p.birth_date <= current_date - interval '18 years'
       and not exists (select 1 from likes l where l.from_profile_id=$1 and l.to_profile_id=p.id)
       and not exists (select 1 from blocks b where (b.blocker_profile_id=$1 and b.blocked_profile_id=p.id) or (b.blocker_profile_id=p.id and b.blocked_profile_id=$1))
       and not exists (select 1 from reports r where r.reporter_profile_id=$1 and r.reported_profile_id=p.id and r.status in ('open','reviewing'))
     order by p.created_at desc limit $2`,
    [me.rows[0].id, limit]
  );
  res.json({ profiles: result.rows });
}));

app.post('/api/likes/:profileId', auth, asyncRoute(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const mine = await client.query('select id from profiles where telegram_user_id=$1', [req.telegramUser.id]);
    if (!mine.rowCount) { await client.query('rollback'); return res.status(409).json({ error: 'profile_required' }); }
    const target = await client.query('select id, is_visible from profiles where id=$1', [req.params.profileId]);
    if (!target.rowCount || !target.rows[0].is_visible || target.rows[0].id === mine.rows[0].id) { await client.query('rollback'); return res.status(404).json({ error: 'profile_unavailable' }); }
    const [a,b] = [mine.rows[0].id, target.rows[0].id];
    const blocked = await client.query('select 1 from blocks where (blocker_profile_id=$1 and blocked_profile_id=$2) or (blocker_profile_id=$2 and blocked_profile_id=$1)', [a,b]);
    if (blocked.rowCount) { await client.query('rollback'); return res.status(404).json({ error: 'profile_unavailable' }); }
    await client.query('insert into likes (from_profile_id,to_profile_id) values ($1,$2) on conflict do nothing', [a,b]);
    const reciprocal = await client.query('select 1 from likes where from_profile_id=$1 and to_profile_id=$2', [b,a]);
    let match = null;
    if (reciprocal.rowCount) {
      const [first, second] = [a,b].sort();
      const inserted = await client.query('insert into matches (profile_a_id,profile_b_id) values ($1,$2) on conflict (profile_a_id,profile_b_id) do update set profile_a_id=excluded.profile_a_id returning id, created_at', [first,second]);
      match = inserted.rows[0];
    }
    await client.query('commit');
    res.status(201).json({ liked: true, matched: Boolean(match), match });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}));

app.post('/api/blocks/:profileId', auth, asyncRoute(async (req, res) => {
  const me = await pool.query('select id from profiles where telegram_user_id=$1', [req.telegramUser.id]);
  if (!me.rowCount) return res.status(409).json({ error: 'profile_required' });
  const target = await pool.query('select id from profiles where id=$1', [req.params.profileId]);
  if (!target.rowCount || target.rows[0].id === me.rows[0].id) return res.status(400).json({ error: 'invalid_target' });
  await pool.query('insert into blocks (blocker_profile_id,blocked_profile_id) values ($1,$2) on conflict do nothing', [me.rows[0].id,target.rows[0].id]);
  await pool.query('delete from matches where (profile_a_id=$1 and profile_b_id=$2) or (profile_a_id=$2 and profile_b_id=$1)', [me.rows[0].id,target.rows[0].id]);
  res.status(201).json({ blocked: true });
}));

app.post('/api/reports/:profileId', auth, asyncRoute(async (req, res) => {
  const me = await pool.query('select id from profiles where telegram_user_id=$1', [req.telegramUser.id]);
  if (!me.rowCount) return res.status(409).json({ error: 'profile_required' });
  const { reason, details = '' } = req.body || {};
  const allowed = ['spam','harassment','fake_profile','underage','inappropriate_content','other'];
  if (!allowed.includes(reason) || typeof details !== 'string' || details.length > 2000) return res.status(400).json({ error: 'invalid_report' });
  const target = await pool.query('select id from profiles where id=$1', [req.params.profileId]);
  if (!target.rowCount || target.rows[0].id === me.rows[0].id) return res.status(400).json({ error: 'invalid_target' });
  const result = await pool.query('insert into reports (reporter_profile_id,reported_profile_id,reason,details) values ($1,$2,$3,$4) returning id,status,created_at', [me.rows[0].id,target.rows[0].id,reason,details]);
  res.status(201).json({ report: result.rows[0] });
}));

app.get('/api/admin/reports', auth, requireAdmin, asyncRoute(async (_req, res) => {
  const result = await pool.query(
    `select r.id,r.reason,r.details,r.status,r.created_at,p.display_name as reported_name,p.telegram_user_id as reported_telegram_id
     from reports r join profiles p on p.id=r.reported_profile_id
     where r.status in ('open','reviewing') order by r.created_at asc limit 100`
  );
  res.json({ reports: result.rows });
}));

app.patch('/api/admin/reports/:reportId', auth, requireAdmin, asyncRoute(async (req, res) => {
  const { status } = req.body || {};
  if (!['reviewing','resolved','dismissed'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
  const result = await pool.query('update reports set status=$1, resolved_at=case when $1 in (\'resolved\',\'dismissed\') then now() else null end where id=$2 returning id,status,resolved_at', [status, req.params.reportId]);
  if (!result.rowCount) return res.status(404).json({ error: 'report_not_found' });
  await pool.query('insert into admin_audit_log (actor_telegram_user_id,action,target_type,target_id,metadata) values ($1,$2,$3,$4,$5)', [req.telegramUser.id,'report_status_changed','report',req.params.reportId,JSON.stringify({status})]);
  res.json({ report: result.rows[0] });
}));

app.use((err, _req, res, _next) => {
  console.error('API error:', err?.message || 'unknown error');
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`AMORI API listening on ${PORT}`);
  startTelegramBot(BOT_TOKEN, { db: pool, ownerId: OWNER_ID, adminIds: ADMIN_IDS });
});
