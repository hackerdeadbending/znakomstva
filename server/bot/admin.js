import * as data from './data.js';
import * as access from './access.js';
import { inlineKeyboard, cardText, sendCardTo } from './ui.js';
import { escapeHtml, formatDate, formatDateTime, sleep } from './util.js';

const STAFF_COMMANDS = new Set(['admin', 'stats', 'reports', 'ban', 'unban', 'user', 'broadcast']);
const OWNER_COMMANDS = new Set(['addadmin', 'deladmin', 'admins', 'grant', 'paywall', 'setlimit']);
const SEGMENTS = { all: '👥 Все', m: '👨 Парни', f: '👩 Девушки', premium: '⭐ Premium' };
const PAGE_SIZE = 8;
const HOME = ['⬅️ В панель', 'ad:home'];

const say = (ctx, text, extra) => ctx.tg.sendMessage(ctx.chatId, text, extra);
const clip = (text, max) => (text.length > max ? text.slice(0, max - 1) + '…' : text);
const isStaffRole = role => role === 'admin' || role === 'owner';
const nameOf = u => u.display_name || (u.username ? '@' + u.username : String(u.telegram_user_id));
const badge = u => (u.role === 'owner' ? '👑 ' : u.role === 'admin' ? '🛡 ' : u.is_banned ? '🚫 ' : '');

// Edits the panel message in place; falls back to a new message (e.g. when the old one is a photo).
async function show(ctx, screen) {
  if (ctx.cq) {
    try {
      await ctx.tg.editText(ctx.chatId, ctx.cq.message.message_id, screen.text, screen.markup);
      return;
    } catch (error) {
      if (/not modified/i.test(error.message)) return;
    }
  }
  await say(ctx, screen.text, { reply_markup: screen.markup });
}

function canManage(ctx, target) {
  if (String(target.telegram_user_id) === String(ctx.user.telegram_user_id)) return false;
  if (target.role === 'owner') return false;
  if (isStaffRole(target.role) && !ctx.isOwner) return false;
  return true;
}

// ---------- screens ----------
async function homeScreen(ctx) {
  const s = await data.stats(ctx.db);
  const rows = [
    [['📊 Статистика', 'ad:stats'], [`🚩 Жалобы (${s.open_reports})`, 'ad:reports']],
    [['👥 Пользователи', 'ad:ul:0'], ['🔎 Найти', 'ad:find']],
    [['📣 Рассылка', 'ad:bc'], ['📜 Журнал', 'ad:log']]
  ];
  if (ctx.isOwner) rows.push([['⭐ Монетизация', 'ad:mon'], ['👑 Команда', 'ad:team']]);
  rows.push([['⚙️ Система', 'ad:sys']]);
  const text = [
    '🛠 <b>Админ-панель</b>',
    '',
    `👥 Пользователей: <b>${s.users}</b> (+${s.new24} за сутки)`,
    `💞 Активных анкет: <b>${s.active}</b>`,
    `🚩 Открытых жалоб: <b>${s.open_reports}</b>`,
    '',
    ctx.isOwner ? '👑 Ты — владелец' : '🛡 Ты — админ'
  ].join('\n');
  return { text, markup: inlineKeyboard(rows) };
}

async function statsScreen(ctx) {
  const s = await data.stats(ctx.db);
  const perHundred = s.likes ? (s.matches * 100 / s.likes).toFixed(1) : '0';
  const cities = s.cities.length ? s.cities.map((c, i) => `${i + 1}. ${escapeHtml(c.city)} — ${c.n}`).join('\n') : '—';
  const text = [
    '📊 <b>Статистика</b>',
    '',
    '<b>Аудитория</b>',
    `Всего: ${s.users} · за сутки +${s.new24} · за неделю +${s.new7}`,
    `Заходили за 24ч: ${s.dau} · за 7 дней: ${s.wau}`,
    '',
    '<b>Анкеты</b>',
    `Всего: ${s.profiles} · активных: ${s.active}`,
    `👨 ${s.men} · 👩 ${s.women}`,
    '',
    '<b>Активность</b>',
    `❤️ Лайков: ${s.likes} (за сутки ${s.likes24})`,
    `💕 Пар: ${s.matches} (за сутки ${s.matches24}) · ${perHundred} на 100 лайков`,
    '',
    '<b>Модерация</b>',
    `🚩 Открытых жалоб: ${s.open_reports} · 🚫 забанено: ${s.banned}`,
    '',
    '<b>Деньги</b>',
    `⭐ Premium: ${s.premium} · покупок: ${s.purchases} · звёзд: ${s.stars}`,
    '',
    '<b>Топ городов</b>',
    cities
  ].join('\n');
  return { text, markup: inlineKeyboard([[['🔄 Обновить', 'ad:stats'], HOME]]) };
}

async function usersScreen(ctx, page) {
  const total = await data.countUsers(ctx.db);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const users = await data.listUsers(ctx.db, current * PAGE_SIZE, PAGE_SIZE);
  const rows = users.map(u => [[clip(`${badge(u)}${nameOf(u)}`, 30), `ad:u:${u.telegram_user_id}`]]);
  const nav = [];
  if (current > 0) nav.push(['◀️', `ad:ul:${current - 1}`]);
  nav.push([`${current + 1}/${pages}`, `ad:ul:${current}`]);
  if (current < pages - 1) nav.push(['▶️', `ad:ul:${current + 1}`]);
  rows.push(nav, [['🔎 Найти', 'ad:find'], HOME]);
  return { text: `👥 <b>Пользователи</b> — всего ${total}\nСначала новые. Нажми на пользователя, чтобы открыть карточку.`, markup: inlineKeyboard(rows) };
}

async function userScreen(ctx, id) {
  const u = id ? await data.findUser(ctx.db, id) : null;
  if (!u) return { text: 'Пользователь не найден.', markup: inlineKeyboard([[HOME]]) };
  const p = await data.getProfile(ctx.db, u.telegram_user_id);
  const until = p ? await access.premiumUntil(ctx.db, p.id) : null;
  const st = p ? await data.userStats(ctx.db, p.id) : null;
  const role = u.role === 'owner' ? '👑 владелец' : u.role === 'admin' ? '🛡 админ' : 'пользователь';
  const lines = [
    `👤 <b>${escapeHtml(p ? p.display_name : 'Без анкеты')}</b>`,
    `ID: <code>${u.telegram_user_id}</code> · ${u.username ? '@' + escapeHtml(u.username) : 'без username'}`,
    `Роль: ${role}`,
    `Статус: ${u.is_banned ? '🚫 забанен' + (u.ban_reason ? ` (${escapeHtml(u.ban_reason)})` : '') : '✅ активен'}`,
    `В боте с ${formatDate(u.created_at)}, был(а) ${formatDateTime(u.last_seen_at)}`
  ];
  if (p) {
    lines.push(
      '',
      `Анкета: ${p.age} лет · ${escapeHtml(p.city || '—')} · ${p.is_visible ? 'видна' : 'скрыта'}`,
      `❤️ поставил(а): ${st.sent} · получил(а): ${st.got} · пар: ${st.matches} · жалоб: ${st.reports}`,
      `⭐ Premium: ${until ? 'до ' + formatDate(until) : 'нет'}`
    );
  }
  const rows = [];
  if (p) rows.push([['🖼 Анкета', `ad:uc:${u.telegram_user_id}`], [p.is_visible ? '🙈 Скрыть' : '👁 Показать', `ad:uv:${u.telegram_user_id}`]]);
  rows.push([u.is_banned ? ['✅ Разбанить', `ad:unban:${u.telegram_user_id}`] : ['🚫 Забанить', `ad:ban:${u.telegram_user_id}`], ['✉️ Написать', `ad:um:${u.telegram_user_id}`]]);
  if (ctx.isOwner && p) rows.push([['⭐ +7 дн', `ad:ug:${u.telegram_user_id}:7`], ['⭐ +30 дн', `ad:ug:${u.telegram_user_id}:30`]]);
  if (ctx.isOwner && u.role !== 'owner') rows.push([u.role === 'admin' ? ['⬇️ Снять админа', `ad:ur:${u.telegram_user_id}:u`] : ['🛡 Сделать админом', `ad:ur:${u.telegram_user_id}:a`]]);
  if (p) rows.push([['🗑 Удалить анкету', `ad:ud:${u.telegram_user_id}`]]);
  rows.push([['⬅️ К списку', 'ad:ul:0'], HOME]);
  return { text: lines.join('\n'), markup: inlineKeyboard(rows) };
}

async function monetizationScreen(ctx) {
  const s = await data.stats(ctx.db);
  const on = await access.paywallOn(ctx.db);
  const limit = await access.freeLimit(ctx.db, 'like', access.FEATURES.like);
  const lines = [
    '⭐ <b>Монетизация</b>',
    '',
    `Paywall: <b>${on ? 'включён' : 'выключен'}</b> ${on ? '(платные функции закрыты для бесплатных)' : '(всё бесплатно)'}`,
    `Оплата Stars (PAYMENTS_ENABLED): <b>${ctx.cfg.paymentsEnabled ? 'включена' : 'выключена'}</b>`,
    `Бесплатный лимит лайков в день: <b>${limit === null ? 'без лимита' : limit}</b>`,
    `Premium сейчас: ${s.premium} · покупок: ${s.purchases} · звёзд: ${s.stars}`,
    '',
    '<b>Товары</b>',
    ...Object.values(access.PRODUCTS).map(p => `• ${escapeHtml(p.title)} — ${p.stars} ⭐`),
    '',
    '<b>Платные функции</b>',
    ...Object.values(access.FEATURES).map(f => `• ${escapeHtml(f.title)} — ${f.premiumOnly ? 'только Premium' : 'лимит для бесплатных'}`)
  ];
  if (on && !ctx.cfg.paymentsEnabled) lines.push('', '⚠️ Paywall включён, а оплата выключена: пользователи не смогут купить Premium.');
  const rows = [
    [[on ? '🔓 Выключить paywall' : '🔒 Включить paywall', 'ad:pw']],
    [['25', 'ad:lim:25'], ['50', 'ad:lim:50'], ['100', 'ad:lim:100'], ['200', 'ad:lim:200'], ['∞', 'ad:lim:none']],
    [['⭐ Выдать Premium (найти)', 'ad:find']],
    [HOME]
  ];
  return { text: lines.join('\n'), markup: inlineKeyboard(rows) };
}

async function teamScreen(ctx) {
  const staff = await data.listStaff(ctx.db);
  const lines = ['👑 <b>Команда</b>', ''];
  const rows = [];
  for (const u of staff) {
    lines.push(`${u.role === 'owner' ? '👑 владелец' : '🛡 админ'} — ${u.username ? '@' + escapeHtml(u.username) : 'без username'} (id ${u.telegram_user_id})`);
    if (u.role === 'admin') rows.push([[`➖ Снять ${clip(u.username ? '@' + u.username : String(u.telegram_user_id), 22)}`, `ad:ur:${u.telegram_user_id}:u:t`]]);
  }
  lines.push('', 'Админы из ADMIN_TELEGRAM_IDS возвращаются при перезапуске: чтобы убрать их насовсем, удали ID в настройках Render.');
  rows.push([['➕ Добавить админа', 'ad:addadm']], [HOME]);
  return { text: lines.join('\n'), markup: inlineKeyboard(rows) };
}

async function logScreen(ctx) {
  const entries = await data.recentAudit(ctx.db, 15);
  const lines = ['📜 <b>Журнал действий</b>', ''];
  if (!entries.length) lines.push('Пока пусто.');
  for (const e of entries) {
    const who = e.username ? '@' + e.username : e.actor_id;
    lines.push(`${formatDateTime(e.created_at)} · ${escapeHtml(who)} · ${escapeHtml(e.action)}${e.target_id ? ' → ' + escapeHtml(e.target_id) : ''}`);
  }
  return { text: lines.join('\n'), markup: inlineKeyboard([[['🔄 Обновить', 'ad:log'], HOME]]) };
}

async function systemScreen(ctx) {
  const started = Date.now();
  await ctx.db.query('select 1');
  const ms = Date.now() - started;
  const up = Math.floor(process.uptime());
  const uptime = `${Math.floor(up / 3600)} ч ${Math.floor((up % 3600) / 60)} мин`;
  const text = [
    '⚙️ <b>Система</b>',
    '',
    `Аптайм: ${uptime}`,
    `База данных: ✅ отвечает (${ms} мс)`,
    `Paywall: ${(await access.paywallOn(ctx.db)) ? 'включён' : 'выключен'}`,
    `Оплата Stars: ${ctx.cfg.paymentsEnabled ? 'включена' : 'выключена'}`,
    `Mini App: ${ctx.cfg.miniAppUrl ? 'подключён' : 'не подключён'}`,
    `Версия: ${(process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || '—'} · Node ${process.version}`
  ].join('\n');
  return { text, markup: inlineKeyboard([[['🔄 Обновить', 'ad:sys'], HOME]]) };
}

function segmentsScreen() {
  const rows = Object.entries(SEGMENTS).map(([key, label]) => [[label, `ad:bcs:${key}`]]);
  rows.push([HOME]);
  return { text: '📣 <b>Рассылка</b>\n\nКому отправляем? Получат только пользователи с анкетой, забаненные — никогда.', markup: inlineKeyboard(rows) };
}

export const adminScreens = {
  home: homeScreen, stats: statsScreen, users: usersScreen, user: userScreen,
  monetization: monetizationScreen, team: teamScreen, log: logScreen, system: systemScreen, segments: segmentsScreen
};

export async function showAdminHome(ctx) {
  await show(ctx, await homeScreen(ctx));
}

// ---------- actions ----------
async function performBan(ctx, target, reason) {
  if (!canManage(ctx, target)) return false;
  await data.banUser(ctx.db, target.telegram_user_id, reason);
  await data.audit(ctx.db, ctx.from.id, 'ban_user', 'user', target.telegram_user_id, { reason: reason || null });
  await ctx.tg.safe('sendMessage', { chat_id: target.telegram_user_id, text: '🚫 Твой аккаунт заблокирован администрацией.' });
  return true;
}

async function setRole(ctx, target, role) {
  await data.setRole(ctx.db, target.telegram_user_id, role);
  if (role === 'user' && target.username) await access.setSetting(ctx.db, 'admin_bound:' + target.username, 'revoked');
  await data.audit(ctx.db, ctx.from.id, role === 'admin' ? 'add_admin' : 'remove_admin', 'user', target.telegram_user_id);
}

async function grant(ctx, target, days) {
  const profile = await data.getProfile(ctx.db, target.telegram_user_id);
  if (!profile) return null;
  const until = await access.grantPremium(ctx.db, profile.id, days, 'manual');
  await data.audit(ctx.db, ctx.from.id, 'grant_premium', 'user', target.telegram_user_id, { days });
  await ctx.tg.safe('sendMessage', { chat_id: target.telegram_user_id, text: `⭐ Тебе выдан Premium до ${formatDate(until)}` });
  return until;
}

async function sendNextReport(ctx) {
  const item = await data.nextReport(ctx.db);
  if (!item) return say(ctx, 'Жалоб нет ✅', { reply_markup: inlineKeyboard([[HOME]]) });
  const caption = `${cardText(item)}\n\n🚩 Причина: ${escapeHtml(item.reason)}\nID: <code>${item.telegram_user_id}</code>`;
  const markup = inlineKeyboard([
    [['🚫 Бан', `ar:b:${item.report_id}`], ['✅ Решено', `ar:r:${item.report_id}`]],
    [['✖️ Отклонить', `ar:d:${item.report_id}`], ['👤 Карточка', `ad:u:${item.telegram_user_id}`]],
    [HOME]
  ]);
  if (item.photo_file_id) return sendCardTo(ctx.tg, ctx.chatId, item, caption, markup);
  return say(ctx, caption, { reply_markup: markup });
}

async function runBroadcast(ctx, ids, text) {
  let ok = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await ctx.tg.sendMessage(id, text);
      ok++;
    } catch (error) {
      if (error.retryAfter) {
        await sleep(error.retryAfter * 1000);
        try { await ctx.tg.sendMessage(id, text); ok++; } catch { failed++; }
      } else {
        failed++;
      }
    }
    await sleep(60);
  }
  await ctx.tg.safe('sendMessage', { chat_id: ctx.chatId, text: `📣 Рассылка завершена: доставлено ${ok}, не доставлено ${failed}.` });
}

export async function handleBroadcastText(ctx, text) {
  if (!text) return say(ctx, 'Пришли текст рассылки (можно HTML-разметку) или /cancel.');
  try {
    await say(ctx, '<b>Предпросмотр:</b>\n\n' + text);
  } catch {
    return say(ctx, 'Некорректная HTML-разметка. Поправь текст и пришли снова.');
  }
  const segment = ctx.user.state_data?.segment || 'all';
  const recipients = await data.broadcastRecipients(ctx.db, segment);
  await data.setState(ctx.db, ctx.user.telegram_user_id, 'admin_broadcast_confirm', { text, segment });
  await say(ctx, `Отправить? Кому: ${SEGMENTS[segment] || SEGMENTS.all}, получателей: <b>${recipients.length}</b>.`, {
    reply_markup: inlineKeyboard([[['✅ Отправить', 'bc:go'], ['✖️ Отмена', 'bc:no']]])
  });
}

// Text answers to panel prompts (state starts with "admin_").
export async function handleAdminText(ctx, text, state) {
  const { db } = ctx;
  const done = () => data.setState(db, ctx.user.telegram_user_id, '', {});
  if (state === 'admin_broadcast') return handleBroadcastText(ctx, text);
  if (state === 'admin_find') {
    const target = await data.findUser(db, text);
    if (!target) return say(ctx, 'Не нашёл. Пришли числовой ID или @username (человек должен был запускать бота) или /cancel.');
    await done();
    const screen = await userScreen(ctx, target.telegram_user_id);
    return say(ctx, screen.text, { reply_markup: screen.markup });
  }
  if (state === 'admin_msg') {
    const toId = ctx.user.state_data?.to;
    const target = toId ? await data.findUser(db, toId) : null;
    if (!target || !text) return say(ctx, 'Пришли текст сообщения или /cancel.');
    try {
      await ctx.tg.sendMessage(target.telegram_user_id, '✉️ <b>Сообщение от администрации:</b>\n\n' + text);
    } catch (error) {
      return say(ctx, `Не удалось отправить: ${escapeHtml(error.message)}\nПоправь текст или /cancel.`);
    }
    await done();
    await data.audit(db, ctx.from.id, 'message_user', 'user', target.telegram_user_id);
    return say(ctx, '✅ Отправлено.', { reply_markup: inlineKeyboard([[['👤 К карточке', `ad:u:${target.telegram_user_id}`], HOME]]) });
  }
  if (state === 'admin_addadmin' && ctx.isOwner) {
    const target = await data.findUser(db, text);
    if (!target) return say(ctx, 'Не нашёл. Человек должен был запустить бота. Пришли ID или @username или /cancel.');
    if (target.role === 'owner') return say(ctx, 'Это владелец.');
    await done();
    await setRole(ctx, target, 'admin');
    const screen = await teamScreen(ctx);
    return say(ctx, `🛡 Теперь админ: id ${target.telegram_user_id}\n\n${screen.text}`, { reply_markup: screen.markup });
  }
  return say(ctx, 'Используй кнопки панели или /cancel.');
}

async function handlePanel(ctx, rest) {
  const [what, a1, a2, a3] = rest;
  const { db } = ctx;
  let screen = null;
  let toast = '';
  const ownerOnly = () => {
    if (ctx.isOwner) return true;
    toast = 'Только для владельца';
    return false;
  };
  const targetUser = () => (a1 ? data.findUser(db, a1) : null);

  switch (what) {
    case 'home': screen = await homeScreen(ctx); break;
    case 'stats': screen = await statsScreen(ctx); break;
    case 'reports': await sendNextReport(ctx); break;
    case 'ul': screen = await usersScreen(ctx, Number(a1) || 0); break;
    case 'u': screen = await userScreen(ctx, a1); break;
    case 'uc': {
      const profile = a1 ? await data.getProfile(db, a1) : null;
      if (profile?.photo_file_id) await sendCardTo(ctx.tg, ctx.chatId, profile, cardText(profile));
      else toast = 'Анкеты нет';
      break;
    }
    case 'uv': {
      const t = await targetUser();
      if (!t || !canManage(ctx, t)) { toast = 'Нельзя'; break; }
      const visible = await data.toggleVisibility(db, t.telegram_user_id);
      await data.audit(db, ctx.from.id, visible ? 'show_profile' : 'hide_profile', 'user', t.telegram_user_id);
      toast = visible ? 'Анкета показана' : 'Анкета скрыта';
      screen = await userScreen(ctx, a1);
      break;
    }
    case 'ban': {
      const t = await targetUser();
      if (!t || !canManage(ctx, t)) { toast = 'Нельзя'; break; }
      screen = {
        text: `Забанить <b>${escapeHtml(nameOf(t))}</b> (id ${t.telegram_user_id})?\nАнкета скроется, доступ к боту закроется.`,
        markup: inlineKeyboard([[['✅ Да, забанить', `ad:banok:${a1}`], ['↩️ Отмена', `ad:u:${a1}`]]])
      };
      break;
    }
    case 'banok': {
      const t = await targetUser();
      toast = t && (await performBan(ctx, t, 'бан из панели')) ? 'Забанен' : 'Нельзя';
      screen = await userScreen(ctx, a1);
      break;
    }
    case 'unban': {
      const t = await targetUser();
      if (!t) { toast = 'Не найден'; break; }
      await data.unbanUser(db, t.telegram_user_id);
      await data.audit(db, ctx.from.id, 'unban_user', 'user', t.telegram_user_id);
      await ctx.tg.safe('sendMessage', { chat_id: t.telegram_user_id, text: '✅ Доступ к боту восстановлен. Жми /start' });
      toast = 'Разбанен';
      screen = await userScreen(ctx, a1);
      break;
    }
    case 'um': {
      const t = await targetUser();
      if (!t || !canManage(ctx, t)) { toast = 'Нельзя'; break; }
      await data.setState(db, ctx.user.telegram_user_id, 'admin_msg', { to: String(t.telegram_user_id) });
      await say(ctx, `✉️ Пришли текст сообщения для id ${t.telegram_user_id} (можно HTML). /cancel — отмена.`);
      break;
    }
    case 'ug': {
      if (!ownerOnly()) break;
      const days = Number(a2);
      const t = [7, 30].includes(days) ? await targetUser() : null;
      const until = t ? await grant(ctx, t, days) : null;
      toast = until ? `Premium до ${formatDate(until)}` : 'Не получилось';
      screen = await userScreen(ctx, a1);
      break;
    }
    case 'ur': {
      if (!ownerOnly()) break;
      const t = await targetUser();
      if (!t || t.role === 'owner') { toast = 'Нельзя'; break; }
      await setRole(ctx, t, a2 === 'a' ? 'admin' : 'user');
      toast = a2 === 'a' ? 'Теперь админ' : 'Админ снят';
      screen = a3 === 't' ? await teamScreen(ctx) : await userScreen(ctx, a1);
      break;
    }
    case 'ud': {
      const t = await targetUser();
      if (!t || !canManage(ctx, t)) { toast = 'Нельзя'; break; }
      screen = {
        text: `Удалить анкету <b>${escapeHtml(nameOf(t))}</b> (id ${t.telegram_user_id})? Лайки и пары пользователя сотрутся, это необратимо.`,
        markup: inlineKeyboard([[['🗑 Да, удалить', `ad:udok:${a1}`], ['↩️ Отмена', `ad:u:${a1}`]]])
      };
      break;
    }
    case 'udok': {
      const t = await targetUser();
      if (!t || !canManage(ctx, t)) { toast = 'Нельзя'; break; }
      await data.deleteProfile(db, t.telegram_user_id);
      await data.audit(db, ctx.from.id, 'delete_profile', 'user', t.telegram_user_id);
      toast = 'Анкета удалена';
      screen = await userScreen(ctx, a1);
      break;
    }
    case 'find':
      await data.setState(db, ctx.user.telegram_user_id, 'admin_find', {});
      await say(ctx, '🔎 Пришли числовой ID или @username пользователя. /cancel — отмена.');
      break;
    case 'bc': screen = segmentsScreen(); break;
    case 'bcs': {
      if (!SEGMENTS[a1]) break;
      await data.setState(db, ctx.user.telegram_user_id, 'admin_broadcast', { segment: a1 });
      await say(ctx, `Аудитория: ${SEGMENTS[a1]}. Пришли текст рассылки (можно HTML-разметку). /cancel — отмена.`);
      break;
    }
    case 'mon': if (ownerOnly()) screen = await monetizationScreen(ctx); break;
    case 'pw': {
      if (!ownerOnly()) break;
      if (await access.paywallOn(db)) {
        await access.setSetting(db, 'paywall', '0');
        await data.audit(db, ctx.from.id, 'set_paywall', 'setting', 'paywall', { value: 'off' });
        toast = 'Paywall выключен';
        screen = await monetizationScreen(ctx);
      } else if (!ctx.cfg.paymentsEnabled) {
        screen = {
          text: '⚠️ Оплата Stars выключена (PAYMENTS_ENABLED не true). Если включить paywall сейчас, платные функции закроются, а купить Premium будет нельзя.\n\nВсё равно включить?',
          markup: inlineKeyboard([[['🔒 Да, включить', 'ad:pwok'], ['↩️ Отмена', 'ad:mon']]])
        };
      } else {
        await access.setSetting(db, 'paywall', '1');
        await data.audit(db, ctx.from.id, 'set_paywall', 'setting', 'paywall', { value: 'on' });
        toast = 'Paywall включён';
        screen = await monetizationScreen(ctx);
      }
      break;
    }
    case 'pwok': {
      if (!ownerOnly()) break;
      await access.setSetting(db, 'paywall', '1');
      await data.audit(db, ctx.from.id, 'set_paywall', 'setting', 'paywall', { value: 'on' });
      toast = 'Paywall включён';
      screen = await monetizationScreen(ctx);
      break;
    }
    case 'lim': {
      if (!ownerOnly()) break;
      if (a1 !== 'none' && !/^\d+$/.test(a1 || '')) break;
      await access.setSetting(db, 'limit:like', a1);
      await data.audit(db, ctx.from.id, 'set_limit', 'setting', 'like', { value: a1 });
      toast = 'Лимит сохранён';
      screen = await monetizationScreen(ctx);
      break;
    }
    case 'team': if (ownerOnly()) screen = await teamScreen(ctx); break;
    case 'addadm':
      if (!ownerOnly()) break;
      await data.setState(db, ctx.user.telegram_user_id, 'admin_addadmin', {});
      await say(ctx, '➕ Пришли ID или @username нового админа (он должен был запустить бота). /cancel — отмена.');
      break;
    case 'log': screen = await logScreen(ctx); break;
    case 'sys': screen = await systemScreen(ctx); break;
  }
  if (screen) await show(ctx, screen);
  await ctx.tg.answerCallback(ctx.cq.id, toast);
}

export async function handleAdminCallback(ctx, action, rest) {
  if (!['ad', 'ar', 'bc'].includes(action)) return false;
  if (!ctx.isStaff) {
    await ctx.tg.answerCallback(ctx.cq.id);
    return true;
  }
  const messageId = ctx.cq.message.message_id;

  if (action === 'ad') {
    await handlePanel(ctx, rest);
    return true;
  }

  if (action === 'ar') {
    const [kind, reportId] = rest;
    const report = await data.getReport(ctx.db, reportId);
    if (!report || !['open', 'reviewing'].includes(report.status)) {
      await ctx.tg.answerCallback(ctx.cq.id, 'Уже обработана');
    } else if (kind === 'b') {
      const target = await data.findUser(ctx.db, report.reported_telegram_id);
      const banned = target ? await performBan(ctx, target, 'жалобы: ' + report.reason) : false;
      await data.setReportStatus(ctx.db, reportId, 'resolved');
      await data.audit(ctx.db, ctx.from.id, 'report_resolved', 'report', reportId, { ban: banned });
      await ctx.tg.answerCallback(ctx.cq.id, banned ? 'Забанен' : 'Закрыта (банить нельзя)');
    } else {
      const status = kind === 'd' ? 'dismissed' : 'resolved';
      await data.setReportStatus(ctx.db, reportId, status);
      await data.audit(ctx.db, ctx.from.id, 'report_' + status, 'report', reportId);
      await ctx.tg.answerCallback(ctx.cq.id, 'Готово');
    }
    await ctx.tg.setMarkup(ctx.chatId, messageId, null);
    await sendNextReport(ctx);
    return true;
  }

  // broadcast confirmation
  const state = ctx.user.state_data || {};
  const wasConfirming = ctx.user.state === 'admin_broadcast_confirm';
  await ctx.tg.setMarkup(ctx.chatId, messageId, null);
  await data.setState(ctx.db, ctx.user.telegram_user_id, '', {});
  if (rest[0] !== 'go' || !wasConfirming || !state.text) {
    await ctx.tg.answerCallback(ctx.cq.id, 'Отменено');
    return true;
  }
  const ids = await data.broadcastRecipients(ctx.db, state.segment || 'all');
  await data.audit(ctx.db, ctx.from.id, 'broadcast', 'users', null, { recipients: ids.length, segment: state.segment || 'all' });
  await ctx.tg.answerCallback(ctx.cq.id, 'Рассылка запущена');
  await say(ctx, `📣 Отправляю ${ids.length} получателям…`);
  runBroadcast(ctx, ids, state.text).catch(error => console.error('AMORI broadcast failed:', error.message));
  return true;
}

// ---------- slash commands (power-user shortcuts, same actions as the panel) ----------
export async function handleAdminCommand(ctx, cmd) {
  if (STAFF_COMMANDS.has(cmd.name)) {
    if (!ctx.isStaff) return false;
  } else if (OWNER_COMMANDS.has(cmd.name)) {
    if (!ctx.isOwner) return false;
  } else {
    return false;
  }
  const { db } = ctx;
  const parts = cmd.args.split(/\s+/).filter(Boolean);
  const reply = async (text, extra) => {
    await say(ctx, text, extra);
    return true;
  };
  const replyScreen = async screen => reply(screen.text, { reply_markup: screen.markup });

  switch (cmd.name) {
    case 'admin': return replyScreen(await homeScreen(ctx));
    case 'stats': return replyScreen(await statsScreen(ctx));
    case 'admins': return replyScreen(await teamScreen(ctx));
    case 'broadcast': return replyScreen(segmentsScreen());
    case 'reports':
      await sendNextReport(ctx);
      return true;
    case 'user': {
      const target = parts.length ? await data.findUser(db, parts[0]) : null;
      if (!target) return reply('Использование: /user &lt;id|@username&gt;');
      return replyScreen(await userScreen(ctx, target.telegram_user_id));
    }
    case 'ban': {
      if (!parts.length) return reply('Использование: /ban &lt;id|@username&gt; [причина]');
      const target = await data.findUser(db, parts[0]);
      if (!target) return reply('Пользователь не найден (он должен был запускать бота).');
      const done = await performBan(ctx, target, parts.slice(1).join(' '));
      return reply(done ? `🚫 Забанен: id ${target.telegram_user_id}` : 'Этого пользователя банить нельзя.');
    }
    case 'unban': {
      const target = parts.length ? await data.findUser(db, parts[0]) : null;
      if (!target) return reply('Использование: /unban &lt;id|@username&gt;');
      await data.unbanUser(db, target.telegram_user_id);
      await data.audit(db, ctx.from.id, 'unban_user', 'user', target.telegram_user_id);
      await ctx.tg.safe('sendMessage', { chat_id: target.telegram_user_id, text: '✅ Доступ к боту восстановлен. Жми /start' });
      return reply(`✅ Разбанен: id ${target.telegram_user_id}`);
    }
    case 'addadmin': {
      const target = parts.length ? await data.findUser(db, parts[0]) : null;
      if (!target) return reply('Использование: /addadmin &lt;id|@username&gt; (человек должен был запустить бота)');
      if (target.role === 'owner') return reply('Это владелец.');
      await setRole(ctx, target, 'admin');
      return reply(`🛡 Теперь админ: id ${target.telegram_user_id}`);
    }
    case 'deladmin': {
      const target = parts.length ? await data.findUser(db, parts[0]) : null;
      if (!target || target.role === 'owner') return reply('Использование: /deladmin &lt;id|@username&gt; (владельца снять нельзя)');
      await setRole(ctx, target, 'user');
      return reply(`Админ снят: id ${target.telegram_user_id}. Если он указан в ADMIN_TELEGRAM_IDS — убери его и оттуда.`);
    }
    case 'grant': {
      const days = Number(parts[1]);
      const valid = parts.length === 2 && Number.isInteger(days) && days > 0 && days <= 3650;
      const target = valid ? await data.findUser(db, parts[0]) : null;
      if (!target) return reply('Использование: /grant &lt;id|@username&gt; &lt;дней&gt;');
      const until = await grant(ctx, target, days);
      return reply(until ? `⭐ Premium до ${formatDate(until)}: id ${target.telegram_user_id}` : 'У пользователя нет анкеты.');
    }
    case 'paywall': {
      const arg = (parts[0] || '').toLowerCase();
      if (arg === 'on' || arg === 'off') {
        await access.setSetting(db, 'paywall', arg === 'on' ? '1' : '0');
        await data.audit(db, ctx.from.id, 'set_paywall', 'setting', 'paywall', { value: arg });
      }
      return reply(`Paywall ${(await access.paywallOn(db)) ? 'включён' : 'выключен'}. Команда: /paywall on|off`);
    }
    case 'setlimit': {
      const [feature, value] = parts;
      const valid = access.FEATURES[feature] && (value === 'none' || /^\d+$/.test(value || ''));
      if (!valid) return reply(`Использование: /setlimit &lt;функция&gt; &lt;число|none&gt;\nФункции: ${Object.keys(access.FEATURES).join(', ')}`);
      await access.setSetting(db, 'limit:' + feature, value);
      await data.audit(db, ctx.from.id, 'set_limit', 'setting', feature, { value });
      return reply(`Бесплатный лимит «${feature}» в день: ${value}`);
    }
  }
  return false;
}
