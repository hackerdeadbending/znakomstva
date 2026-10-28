import crypto from 'node:crypto';

export function verifyTelegramInitData(raw, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!botToken || typeof raw !== 'string' || raw.length === 0 || raw.length > 12000) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(authDate)) return null;
  if (authDate > nowSeconds + 30 || nowSeconds - authDate > 86400) return null;
  const checkString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '=' + value)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(checkString).digest();
  const supplied = Buffer.from(hash, 'hex');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) return null;
    return { id: String(user.id), firstName: String(user.first_name || '').slice(0, 40), username: String(user.username || '').slice(0, 64) };
  } catch {
    return null;
  }
}
