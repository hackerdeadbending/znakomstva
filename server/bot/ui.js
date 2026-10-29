import { escapeHtml, formatDate } from './util.js';

export const BTN = {
  browse: '🔍 Анкеты',
  likes: '💌 Лайки',
  matches: '💬 Пары',
  profile: '👤 Профиль',
  premium: '⭐ Premium',
  admin: '🛠 Админка'
};

export const REPORT_REASONS = {
  sp: { value: 'spam', label: 'Спам / реклама' },
  ha: { value: 'harassment', label: 'Оскорбления' },
  fk: { value: 'fake_profile', label: 'Фейк' },
  ua: { value: 'underage', label: 'Выглядит младше 18' },
  ic: { value: 'inappropriate_content', label: '18+ контент' },
  ot: { value: 'other', label: 'Другое' }
};

export const LOOKING_RU = { m: 'парней', f: 'девушек', a: 'всех' };

export function replyKeyboard(rows, oneTime = false) {
  return {
    keyboard: rows.map(row => row.map(item => (typeof item === 'string' ? { text: item } : item))),
    resize_keyboard: true,
    one_time_keyboard: oneTime
  };
}

export function inlineKeyboard(rows) {
  return { inline_keyboard: rows.map(row => row.map(([text, callback_data]) => ({ text, callback_data }))) };
}

export function mainMenu({ paymentsEnabled, miniAppUrl, isStaff }) {
  const rows = [[BTN.browse, BTN.likes], [BTN.matches, BTN.profile]];
  if (paymentsEnabled) rows[1].push(BTN.premium);
  if (isStaff) rows.push([BTN.admin]);
  if (miniAppUrl) rows.push([{ text: '💗 Mini App', web_app: { url: miniAppUrl } }]);
  return replyKeyboard(rows);
}

export function reactionMarkup(profileId) {
  return inlineKeyboard([
    [['❤️', `l:${profileId}`], ['👎', `d:${profileId}`]],
    [['⚠️ Пожаловаться / заблокировать', `m:${profileId}`]]
  ]);
}

export function moreMarkup(profileId) {
  const rows = [[['🚫 Заблокировать', `b:${profileId}`]]];
  for (const [code, reason] of Object.entries(REPORT_REASONS)) rows.push([[reason.label, `rp:${code}:${profileId}`]]);
  rows.push([['↩️ Назад', `bk:${profileId}`]]);
  return inlineKeyboard(rows);
}

export function upsellMarkup(cfg) {
  return cfg.paymentsEnabled ? inlineKeyboard([[['⭐ Premium', 'premium:open']]]) : undefined;
}

export function cardText(p) {
  let head = `<b>${escapeHtml(p.display_name)}</b>, ${p.age}`;
  if (p.is_verified) head += ' ✅';
  if (p.city) head += ' · ' + escapeHtml(p.city);
  return p.bio ? `${head}\n\n${escapeHtml(p.bio)}` : head;
}

export function profileText(p, until) {
  const filter = p.age_min || p.age_max ? `${p.age_min || 18}–${p.age_max || 99}` : 'любой';
  const lines = [
    cardText(p),
    '',
    `Статус анкеты: ${p.is_visible ? '✅ показывается' : '🙈 скрыта'}`,
    `Ищу: ${LOOKING_RU[p.looking_for] || 'всех'}`,
    `Возраст: ${filter}`
  ];
  if (until) lines.push(`⭐ Premium до ${formatDate(until)}`);
  return lines.join('\n');
}

export function profileMarkup(p) {
  return inlineKeyboard([
    [['✏️ Заполнить заново', 'p:redo']],
    [[p.is_visible ? '🙈 Скрыть анкету' : '👁 Показать анкету', 'p:toggle']],
    [['🎯 Фильтр по возрасту', 'p:age']],
    [['🗑 Удалить анкету', 'p:del']]
  ]);
}

// Photo with a text fallback when Telegram rejects the file_id.
export async function sendCardTo(tg, chatId, profile, caption, markup) {
  const extra = markup ? { reply_markup: markup } : {};
  try {
    await tg.sendPhoto(chatId, profile.photo_file_id, caption, extra);
  } catch (error) {
    await tg.sendMessage(chatId, caption, extra);
  }
}
