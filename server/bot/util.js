export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function ageFromISO(iso, now = new Date()) {
  const birth = new Date(iso + 'T00:00:00Z');
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const months = now.getUTCMonth() - birth.getUTCMonth();
  if (months < 0 || (months === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

// Accepts DD.MM.YYYY (also - or /). Returns { iso, age } or null when the date is not real.
export function parseBirthDate(input, now = new Date()) {
  const match = /^\s*(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\s*$/.exec(String(input || ''));
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return { iso, age: ageFromISO(iso, now) };
}

export function parseCommand(text) {
  const match = /^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(String(text || '').trim());
  if (!match) return null;
  return { name: match[1].toLowerCase(), args: (match[2] || '').trim() };
}

// user: { telegram_user_id, username }
export function contactLink(user) {
  if (user?.username) return '@' + user.username;
  return `<a href="tg://user?id=${user.telegram_user_id}">открыть профиль</a>`;
}

export function formatDate(value) {
  return new Date(value).toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function formatDateTime(value) {
  return new Date(value).toLocaleString('ru-RU', { timeZone: 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' UTC';
}
