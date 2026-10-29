import * as data from './data.js';
import * as access from './access.js';
import { inlineKeyboard, cardText, sendCardTo } from './ui.js';
import { escapeHtml, formatDate, sleep } from './util.js';

const STAFF_COMMANDS = new Set(['admin', 'stats', 'reports', 'ban', 'unban', 'user', 'broadcast']);
const OWNER_COMMANDS = new Set(['addadmin', 'deladmin', 'admins', 'grant', 'paywall', 'setlimit']);

const PANEL = [
  '🛠 <b>Админ-панель</b>',
  '',
  '/stats — статистика',
  '/reports — очередь жалоб',
  '/broadcast — рассылка',
  '/ban &lt;id|@username&gt; [причина]',
  '/unban &lt;id|@username&gt;',
  '/user &lt;id|@username&gt;',
  '',
  '<b>Только владелец:</b>',
  '/addadmin, /deladmin &lt;id|@username&gt;',
  '/admins — команда',
  '/grant &lt;id|@username&gt; &lt;дней&gt; — выдать Premium',
  '/paywall on|off — платные ограничения',
  '/setlimit &lt;функция&gt; &lt;число|none&gt; — бесплатный лимит в день'
].join('\n');

function panelMarkup() {
  return inlineKeyboard([
    [['📊 Статистика', 'ad:stats'], ['🚩 Жалобы', 'ad:reports']],
    [['📣 Рассылка', 'ad:bc'], ['👥 Команда', 'ad:team']]
  ]);
}

const say = (ctx, text, extra) => ctx.tg.sendMessage(ctx.chatId, text, extra);

async function statsText(ctx) {
  const s = await data.stats(ctx.db);
  const paywall = (await access.paywallOn(ctx.db)) ? 'вкл' : 'выкл';
  return [
    '📊 <b>Статистика</b>',
    '',
    `Пользователей: ${s.users} (+${s.new24} за 24ч)`,
    `Анкет: ${s.profiles}, активных: ${s.active}`,
    `Забанено: ${s.banned}`,
    `Лайков: ${s.likes}, пар: ${s.matches}`,
    `Открытых жалоб: ${s.open_reports}`,
    `Premium: ${s.premium}, покупок: ${s.purchases}`,
    `Paywall: ${paywall}`
  ].join('\n');
}

async function teamText(ctx) {
  const staff = await data.listStaff(ctx.db);
  const lines = ['👥 <b>Команда</b>', ''];
  for (const u of staff) {
    lines.push(`${u.role === 'owner' ? '👑 owner' : '🛡 admin'} — @${escapeHtml(u.username || '-')} (id ${u.telegram_user_id})`);
  }
  lines.push('', 'Админы из переменных окружения (OWNER_TELEGRAM_ID / ADMIN_TELEGRAM_IDS) показываются после их первого /start.');
  return lines.join('\n');
}

async function performBan(ctx, target, reason) {
  if (target.role === 'owner' || (['admin', 'owner'].includes(target.role) && !ctx.isOwner)) return false;
  await data.banUser(ctx.db, target.telegram_user_id, reason);
  await data.audit(ctx.db, ctx.from.id, 'ban_user', 'user', target.telegram_user_id, { reason: reason || null });
  await ctx.tg.safe('sendMessage', { chat_id: target.telegram_user_id, text: '🚫 Твой аккаунт заблокирован администрацией.' });
  return true;
}

async function sendNextReport(ctx) {
  const item = await data.nextReport(ctx.db);
  if (!item) return say(ctx, 'Жалоб нет ✅');
  const caption = `${cardText(item)}\n\n🚩 Причина: ${escapeHtml(item.reason)}\nID: <code>${item.telegram_user_id}</code>`;
  const markup = inlineKeyboard([
    [['🚫 Бан', `ar:b:${item.report_id}`], ['✅ Решено', `ar:r:${item.report_id}`]],
    [['✖️ Отклонить', `ar:d:${item.report_id}`]]
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
  await data.setState(ctx.db, ctx.user.telegram_user_id, 'admin_broadcast_confirm', { text });
  await say(ctx, 'Отправить всем пользователям с анкетой?', {
    reply_markup: inlineKeyboard([[['✅ Отправить', 'bc:go'], ['✖️ Отмена', 'bc:no']]])
  });
}

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

  switch (cmd.name) {
    case 'admin':
      return reply(PANEL, { reply_markup: panelMarkup() });
    case 'stats':
      return reply(await statsText(ctx));
    case 'reports':
      await sendNextReport(ctx);
      return true;
    case 'broadcast':
      await data.setState(db, ctx.user.telegram_user_id, 'admin_broadcast', {});
      return reply('Пришли текст рассылки (можно HTML-разметку). /cancel — отмена.');
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
    case 'user': {
      const target = parts.length ? await data.findUser(db, parts[0]) : null;
      if (!target) return reply('Использование: /user &lt;id|@username&gt;');
      const profile = await data.getProfile(db, target.telegram_user_id);
      const until = profile ? await access.premiumUntil(db, profile.id) : null;
      const info = [
        `ID: <code>${target.telegram_user_id}</code>`,
        `@${escapeHtml(target.username || '-')}`,
        `Роль: ${target.role}`,
        `Бан: ${target.is_banned ? 'да' + (target.ban_reason ? ` (${escapeHtml(target.ban_reason)})` : '') : 'нет'}`,
        `Анкета: ${profile ? 'есть' : 'нет'}`,
        `Premium до: ${until ? formatDate(until) : '—'}`
      ].join('\n');
      if (profile?.photo_file_id) {
        await sendCardTo(ctx.tg, ctx.chatId, profile, `${cardText(profile)}\n\n${info}`);
        return true;
      }
      return reply(info);
    }
    case 'admins':
      return reply(await teamText(ctx));
    case 'addadmin': {
      const target = parts.length ? await data.findUser(db, parts[0]) : null;
      if (!target) return reply('Использование: /addadmin &lt;id|@username&gt; (человек должен был запустить бота)');
      if (target.role === 'owner') return reply('Это владелец.');
      await data.setRole(db, target.telegram_user_id, 'admin');
      await data.audit(db, ctx.from.id, 'add_admin', 'user', target.telegram_user_id);
      return reply(`🛡 Теперь админ: id ${target.telegram_user_id}`);
    }
    case 'deladmin': {
      const target = parts.length ? await data.findUser(db, parts[0]) : null;
      if (!target || target.role === 'owner') return reply('Использование: /deladmin &lt;id|@username&gt; (владельца снять нельзя)');
      await data.setRole(db, target.telegram_user_id, 'user');
      if (target.username) await access.setSetting(db, 'admin_bound:' + target.username, 'revoked');
      await data.audit(db, ctx.from.id, 'remove_admin', 'user', target.telegram_user_id);
      return reply(`Админ снят: id ${target.telegram_user_id}. Если он указан в ADMIN_TELEGRAM_IDS — убери его и оттуда.`);
    }
    case 'grant': {
      const days = Number(parts[1]);
      const valid = parts.length === 2 && Number.isInteger(days) && days > 0 && days <= 3650;
      const target = valid ? await data.findUser(db, parts[0]) : null;
      if (!target) return reply('Использование: /grant &lt;id|@username&gt; &lt;дней&gt;');
      const profile = await data.getProfile(db, target.telegram_user_id);
      if (!profile) return reply('У пользователя нет анкеты.');
      const until = await access.grantPremium(db, profile.id, days, 'manual');
      await data.audit(db, ctx.from.id, 'grant_premium', 'user', target.telegram_user_id, { days });
      await ctx.tg.safe('sendMessage', { chat_id: target.telegram_user_id, text: `⭐ Тебе выдан Premium до ${formatDate(until)}` });
      return reply(`⭐ Premium до ${formatDate(until)}: id ${target.telegram_user_id}`);
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

export async function handleAdminCallback(ctx, action, rest) {
  if (!['ad', 'ar', 'bc'].includes(action)) return false;
  if (!ctx.isStaff) {
    await ctx.tg.answerCallback(ctx.cq.id);
    return true;
  }
  const messageId = ctx.cq.message.message_id;

  if (action === 'ad') {
    await ctx.tg.answerCallback(ctx.cq.id);
    if (rest[0] === 'stats') await say(ctx, await statsText(ctx));
    else if (rest[0] === 'reports') await sendNextReport(ctx);
    else if (rest[0] === 'team') await say(ctx, await teamText(ctx));
    else if (rest[0] === 'bc') {
      await data.setState(ctx.db, ctx.user.telegram_user_id, 'admin_broadcast', {});
      await say(ctx, 'Пришли текст рассылки (можно HTML-разметку). /cancel — отмена.');
    }
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
  const ids = await data.broadcastRecipients(ctx.db);
  await data.audit(ctx.db, ctx.from.id, 'broadcast', 'users', null, { recipients: ids.length });
  await ctx.tg.answerCallback(ctx.cq.id, 'Рассылка запущена');
  await say(ctx, `📣 Отправляю ${ids.length} получателям…`);
  runBroadcast(ctx, ids, state.text).catch(error => console.error('AMORI broadcast failed:', error.message));
  return true;
}
