import test from 'node:test';
import assert from 'node:assert/strict';
import { adminScreens } from '../server/bot/admin.js';

const row = {
  users: 5, new24: 1, new7: 2, dau: 3, wau: 4, profiles: 4, active: 3, men: 2, women: 2, banned: 0,
  likes: 10, likes24: 2, matches: 3, matches24: 1, open_reports: 1, premium: 1, purchases: 2, stars: 200,
  city: 'москва', n: 3, value: '50', until: new Date(), sent: 4, got: 5, reports: 0,
  telegram_user_id: '42', username: 'neo', role: 'user', is_banned: false, ban_reason: null,
  display_name: 'Нео', age: 25, is_visible: true, id: 'p1', created_at: new Date(), last_seen_at: new Date(),
  action: 'ban_user', target_id: '42', actor_id: '9'
};
const db = { async query() { return { rowCount: 1, rows: [row] }; } };
const ctx = {
  db, isOwner: true, isStaff: true, user: { telegram_user_id: '9' }, from: { id: 9 }, chatId: 1, tg: {},
  cfg: { paymentsEnabled: true, miniAppUrl: '' }
};

function assertValid(screen) {
  assert.equal(typeof screen.text, 'string');
  assert.ok(screen.text.length > 0 && screen.text.length < 4000);
  const rows = screen.markup.inline_keyboard;
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(r.length > 0 && r.length <= 5);
    for (const button of r) {
      assert.ok(button.text.length > 0);
      assert.ok(Buffer.byteLength(button.callback_data) <= 64, button.callback_data);
    }
  }
}

test('every admin screen renders with valid Telegram keyboards (owner)', async () => {
  for (const screen of [
    await adminScreens.home(ctx), await adminScreens.stats(ctx), await adminScreens.users(ctx, 0),
    await adminScreens.user(ctx, '42'), await adminScreens.monetization(ctx), await adminScreens.team(ctx),
    await adminScreens.log(ctx), await adminScreens.system(ctx), adminScreens.segments()
  ]) assertValid(screen);
});

test('plain admins do not get owner-only buttons', async () => {
  const admin = { ...ctx, isOwner: false };
  const home = await adminScreens.home(admin);
  const data = home.markup.inline_keyboard.flat().map(b => b.callback_data);
  assert.ok(!data.includes('ad:mon') && !data.includes('ad:team'));
  const user = await adminScreens.user(admin, '42');
  const userData = user.markup.inline_keyboard.flat().map(b => b.callback_data);
  assert.ok(!userData.some(d => d.startsWith('ad:ug:') || d.startsWith('ad:ur:')));
});

test('unknown user gives a safe message', async () => {
  const empty = { ...ctx, db: { async query() { return { rowCount: 0, rows: [] }; } } };
  const screen = await adminScreens.user(empty, '1');
  assert.match(screen.text, /не найден/i);
});
