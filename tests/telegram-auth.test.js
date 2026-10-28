import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyTelegramInitData } from '../server/telegram-auth.js';

const token = 'test-bot-token';
const now = 1_800_000_000;
function signedData(fields) {
  const params = new URLSearchParams(fields);
  const checkString = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => k + '=' + v).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}
const validFields = {
  auth_date: String(now - 10),
  query_id: 'AAExample',
  user: JSON.stringify({ id: 123456789, first_name: 'AMORI Tester', username: 'test_user' })
};

test('accepts correctly signed fresh initData', () => {
  const result = verifyTelegramInitData(signedData(validFields), token, now);
  assert.equal(result.id, '123456789');
  assert.equal(result.firstName, 'AMORI Tester');
  assert.equal(result.username, 'test_user');
});

test('rejects modified user data', () => {
  const signed = signedData(validFields);
  const modified = signed.replace('123456789', '987654321');
  assert.equal(verifyTelegramInitData(modified, token, now), null);
});

test('rejects stale initData', () => {
  const fields = { ...validFields, auth_date: String(now - 86401) };
  assert.equal(verifyTelegramInitData(signedData(fields), token, now), null);
});

test('rejects future initData beyond clock tolerance', () => {
  const fields = { ...validFields, auth_date: String(now + 31) };
  assert.equal(verifyTelegramInitData(signedData(fields), token, now), null);
});

test('rejects missing token and malformed payload', () => {
  assert.equal(verifyTelegramInitData(signedData(validFields), '', now), null);
  assert.equal(verifyTelegramInitData('not-init-data', token, now), null);
});
