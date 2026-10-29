import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBirthDate, parseCommand, escapeHtml, contactLink } from '../server/bot/util.js';
import { check, FEATURES } from '../server/bot/access.js';

function fakeDb({ paywall = '0', premium = false, likesToday = 0, limit = null } = {}) {
  return {
    async query(sql, params = []) {
      if (sql.includes('from bot_settings')) {
        const key = params[0];
        const value = key === 'paywall' ? paywall : key.startsWith('limit:') ? limit : null;
        return value === null ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ value }] };
      }
      if (sql.includes('from entitlements')) return { rowCount: premium ? 1 : 0, rows: [] };
      if (sql.includes('from likes')) return { rowCount: 1, rows: [{ n: likesToday }] };
      throw new Error('unexpected query: ' + sql);
    }
  };
}
const ctx = { isStaff: false, profile: { id: 'p1' } };

test('parseBirthDate accepts real dates and computes age', () => {
  const now = new Date('2026-10-29T00:00:00Z');
  assert.deepEqual(parseBirthDate('25.03.2000', now), { iso: '2000-03-25', age: 26 });
  assert.equal(parseBirthDate('29.10.2008', now).age, 18);
  assert.equal(parseBirthDate('30.10.2008', now).age, 17);
});

test('parseBirthDate rejects impossible dates and junk', () => {
  assert.equal(parseBirthDate('31.02.2000'), null);
  assert.equal(parseBirthDate('2000-03-25'), null);
  assert.equal(parseBirthDate('привет'), null);
});

test('parseCommand handles bot suffix and args', () => {
  assert.deepEqual(parseCommand('/ban@my_bot 123 spam'), { name: 'ban', args: '123 spam' });
  assert.deepEqual(parseCommand('/start'), { name: 'start', args: '' });
  assert.equal(parseCommand('hello'), null);
});

test('escapeHtml and contactLink are safe', () => {
  assert.equal(escapeHtml('<b>&'), '&lt;b&gt;&amp;');
  assert.equal(contactLink({ telegram_user_id: '5', username: 'neo' }), '@neo');
  assert.match(contactLink({ telegram_user_id: '5', username: null }), /tg:\/\/user\?id=5/);
});

test('everything is free while the paywall is off', async () => {
  assert.equal((await check(fakeDb({ paywall: '0' }), ctx, 'see_likes')).allowed, true);
  assert.equal((await check(fakeDb({ paywall: '0', likesToday: 9999 }), ctx, 'like')).allowed, true);
});

test('premium-only feature is gated when the paywall is on', async () => {
  const gate = await check(fakeDb({ paywall: '1' }), ctx, 'see_likes');
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, 'premium_only');
});

test('premium users and staff bypass the paywall', async () => {
  assert.equal((await check(fakeDb({ paywall: '1', premium: true }), ctx, 'see_likes')).allowed, true);
  assert.equal((await check(fakeDb({ paywall: '1' }), { ...ctx, isStaff: true }, 'see_likes')).allowed, true);
});

test('daily like limit applies only to free users when the paywall is on', async () => {
  const limit = FEATURES.like.freeDailyLimit;
  assert.equal((await check(fakeDb({ paywall: '1', likesToday: limit - 1 }), ctx, 'like')).allowed, true);
  const gate = await check(fakeDb({ paywall: '1', likesToday: limit }), ctx, 'like');
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, 'limit');
});

test('runtime limit override and "none" are respected', async () => {
  assert.equal((await check(fakeDb({ paywall: '1', likesToday: 5, limit: '5' }), ctx, 'like')).allowed, false);
  assert.equal((await check(fakeDb({ paywall: '1', likesToday: 99999, limit: 'none' }), ctx, 'like')).allowed, true);
});

test('unknown feature keys fail loudly', async () => {
  await assert.rejects(() => check(fakeDb(), ctx, 'nope'));
});
