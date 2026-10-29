import { createTelegram } from './telegram.js';
import * as data from './data.js';
import * as access from './access.js';
import {
  BTN, REPORT_REASONS, mainMenu, replyKeyboard, inlineKeyboard, reactionMarkup, moreMarkup,
  upsellMarkup, cardText, profileText, profileMarkup, sendCardTo
} from './ui.js';
import { escapeHtml, parseBirthDate, parseCommand, contactLink, formatDate, sleep } from './util.js';
import { handleAdminCommand, handleAdminCallback, handleAdminText, showAdminHome } from './admin.js';

const GENDER_BUTTONS = { '👨 Парень': 'm', '👩 Девушка': 'f' };
const LOOKING_BUTTONS = { '👨 Парней': 'm', '👩 Девушек': 'f', '👥 Всех': 'a' };
const AGE_PRESETS = { '18-22': [18, 22], '23-27': [23, 27], '28-35': [28, 35], '36-99': [36, 99], any: [null, null] };

const WELCOME = 'Привет! 💗 Это <b>AMORI</b> — знакомства в Telegram.\n\nЗаполни анкету за минуту, листай других и ставь ❤️. Если симпатия взаимна — сразу пришлю контакт.';
const HELP = [
  '<b>Как это работает</b>',
  '🔍 Анкеты — листай и ставь ❤️ или 👎',
  '💌 Лайки — кто уже тебя лайкнул',
  '💬 Пары — взаимные симпатии и контакты',
  '👤 Профиль — редактирование, фильтры, скрыть анкету',
  '',
  '/menu — главное меню, /cancel — отменить действие, /whoami — твой Telegram ID'
].join('\n');

function buildConfig(options) {
  const names = value => new Set(String(value || '').split(',').map(s => s.trim().replace(/^@/, '').toLowerCase()).filter(Boolean));
  return {
    ownerId: String(options.ownerId || '').trim(),
    adminIds: options.adminIds || new Set(),
    ownerUsername: String(process.env.OWNER_USERNAME || 'regentdvdd').trim().replace(/^@/, '').toLowerCase(),
    adminUsernames: names(process.env.ADMIN_USERNAMES || 'makson_ss'),
    paymentsEnabled: ['1', 'true', 'yes', 'on'].includes(String(process.env.PAYMENTS_ENABLED || '').toLowerCase()),
    miniAppUrl: String(process.env.MINI_APP_URL || '').trim()
  };
}

const hits = new Map();
function throttled(id) {
  const now = Date.now();
  const recent = (hits.get(id) || []).filter(t => now - t < 10000);
  recent.push(now);
  hits.set(id, recent);
  return recent.length > 15;
}

// ---------- roles ----------
// Numeric IDs from env always win. While OWNER_TELEGRAM_ID is not configured, the configured
// usernames can claim a role once; the claim is bound to the numeric ID and audited.
async function resolveRole(app, user) {
  const id = String(user.telegram_user_id);
  const { cfg } = app;
  if (cfg.ownerId && id === cfg.ownerId) return 'owner';
  if (cfg.adminIds.has(id)) return 'admin';
  const username = (user.username || '').toLowerCase();
  const wanted = !username || cfg.ownerId ? null : username === cfg.ownerUsername ? 'owner' : cfg.adminUsernames.has(username) ? 'admin' : null;
  if (wanted) {
    const key = `admin_bound:${username}`;
    const claimed = await app.db.query('insert into bot_settings (key, value) values ($1,$2) on conflict (key) do nothing returning value', [key, id]);
    if (claimed.rowCount) await data.audit(app.db, id, 'admin_username_claimed', 'user', id, { username, role: wanted });
    const bound = claimed.rowCount ? id : await access.getSetting(app.db, key);
    if (bound === id) return wanted;
  }
  return user.role === 'admin' ? 'admin' : 'user';
}

async function buildContext(app, from, chatId) {
  const user = await data.touchUser(app.db, from);
  const role = await resolveRole(app, user);
  if (role !== user.role) {
    await data.setRole(app.db, user.telegram_user_id, role);
    user.role = role;
  }
  const profile = await data.getProfile(app.db, from.id);
  return {
    app, tg: app.tg, db: app.db, cfg: app.cfg, from, chatId, user, profile,
    isStaff: role === 'admin' || role === 'owner',
    isOwner: role === 'owner'
  };
}

const menuFor = ctx => mainMenu({ paymentsEnabled: ctx.cfg.paymentsEnabled, miniAppUrl: ctx.cfg.miniAppUrl, isStaff: ctx.isStaff });
const say = (ctx, text, extra) => ctx.tg.sendMessage(ctx.chatId, text, extra);

async function showMenu(ctx, text) {
  await say(ctx, text, { reply_markup: ctx.profile ? menuFor(ctx) : { remove_keyboard: true } });
}

// ---------- registration ----------
async function beginRegistration(ctx, intro) {
  await data.setState(ctx.db, ctx.user.telegram_user_id, 'reg_name', {});
  const first = ctx.from.first_name;
  const keyboard = first && first.length <= 40 ? replyKeyboard([[first]], true) : { remove_keyboard: true };
  await say(ctx, (intro ? intro + '\n\n' : '') + 'Как тебя зовут?', { reply_markup: keyboard });
}

async function onRegistration(ctx, message, state) {
  const text = (message.text || '').trim();
  const draft = ctx.user.state_data || {};
  const next = (step, extra) => data.setState(ctx.db, ctx.user.telegram_user_id, step, { ...draft, ...extra });

  if (state === 'reg_name') {
    if (text.length < 1 || text.length > 40) return say(ctx, 'Имя — от 1 до 40 символов. Попробуй ещё раз.');
    await next('reg_birth', { name: text });
    return say(ctx, 'Дата рождения в формате ДД.ММ.ГГГГ (например 25.03.2000). Сервис только для 18+.', { reply_markup: { remove_keyboard: true } });
  }
  if (state === 'reg_birth') {
    const parsed = parseBirthDate(text);
    if (!parsed) return say(ctx, 'Не понял дату. Формат: ДД.ММ.ГГГГ, например 25.03.2000.');
    if (parsed.age < 18) {
      await data.setState(ctx.db, ctx.user.telegram_user_id, '', {});
      return say(ctx, 'Сервис только для совершеннолетних (18+). Регистрация невозможна.');
    }
    if (parsed.age > 99) return say(ctx, 'Проверь год рождения 🙂');
    await next('reg_gender', { birth: parsed.iso });
    return say(ctx, 'Ты кто?', { reply_markup: replyKeyboard([Object.keys(GENDER_BUTTONS)], true) });
  }
  if (state === 'reg_gender') {
    if (!GENDER_BUTTONS[text]) return say(ctx, 'Выбери вариант кнопкой ниже 👇');
    await next('reg_looking', { gender: GENDER_BUTTONS[text] });
    return say(ctx, 'Кого ищешь?', { reply_markup: replyKeyboard([Object.keys(LOOKING_BUTTONS)], true) });
  }
  if (state === 'reg_looking') {
    if (!LOOKING_BUTTONS[text]) return say(ctx, 'Выбери вариант кнопкой ниже 👇');
    await next('reg_city', { looking: LOOKING_BUTTONS[text] });
    return say(ctx, 'Из какого ты города?', { reply_markup: { remove_keyboard: true } });
  }
  if (state === 'reg_city') {
    if (text.length < 2 || text.length > 100) return say(ctx, 'Название города — от 2 до 100 символов.');
    await next('reg_bio', { city: text });
    return say(ctx, 'Расскажи о себе пару слов (до 300 символов) или нажми «Пропустить».', { reply_markup: replyKeyboard([['Пропустить']], true) });
  }
  if (state === 'reg_bio') {
    const bio = text === 'Пропустить' ? '' : text;
    if (bio.length > 300) return say(ctx, 'Слишком длинно, уложись в 300 символов.');
    await next('reg_photo', { bio });
    return say(ctx, 'Пришли своё фото 📸', { reply_markup: { remove_keyboard: true } });
  }
  if (state === 'reg_photo') {
    if (!message.photo?.length) return say(ctx, 'Нужно именно фото (не файл). Пришли ещё раз 📸');
    const profile = await data.saveProfile(ctx.db, ctx.from.id, { ...draft, photoFileId: message.photo[message.photo.length - 1].file_id });
    await data.setState(ctx.db, ctx.user.telegram_user_id, '', {});
    ctx.profile = profile;
    await say(ctx, 'Готово! Вот твоя анкета:', { reply_markup: menuFor(ctx) });
    await sendCardTo(ctx.tg, ctx.chatId, profile, cardText(profile));
    return say(ctx, 'Жми «🔍 Анкеты» и знакомься 💕');
  }
}

// ---------- discovery ----------
async function needProfile(ctx) {
  if (ctx.profile) return false;
  await say(ctx, 'Сначала создай анкету: /start');
  return true;
}

async function showNext(ctx) {
  if (await needProfile(ctx)) return;
  const target = await data.nextProfile(ctx.db, ctx.profile);
  if (!target) return say(ctx, 'Пока анкеты закончились 😔 Загляни позже — новые появляются каждый день.');
  await sendCardTo(ctx.tg, ctx.chatId, target, cardText(target), reactionMarkup(target.id));
}

async function showLikes(ctx) {
  if (await needProfile(ctx)) return;
  const count = await data.countIncoming(ctx.db, ctx.profile);
  if (!count) return say(ctx, 'Пока новых лайков нет. Листай «🔍 Анкеты» 😉');
  const gate = await access.check(ctx.db, ctx, 'see_likes');
  if (!gate.allowed) return say(ctx, `💌 Тебя лайкнули: <b>${count}</b>\n\n${gate.message}`, { reply_markup: upsellMarkup(ctx.cfg) });
  const target = await data.nextIncoming(ctx.db, ctx.profile);
  await say(ctx, `💌 Тебя лайкнули: <b>${count}</b>`);
  if (target) await sendCardTo(ctx.tg, ctx.chatId, target, cardText(target), reactionMarkup(target.id));
}

async function showMatches(ctx) {
  if (await needProfile(ctx)) return;
  const matches = await data.listMatches(ctx.db, ctx.profile, 10);
  if (!matches.length) return say(ctx, 'Пар пока нет. Ставь ❤️ — и они появятся 💕');
  await say(ctx, `💬 Твои пары (последние ${matches.length}):`);
  for (const m of matches) {
    await sendCardTo(ctx.tg, ctx.chatId, m, `${cardText(m)}\n\nНапиши: ${contactLink({ telegram_user_id: m.telegram_user_id, username: m.username })}`);
  }
}

async function notifyMatch(ctx, targetProfileId) {
  const other = await data.getProfileById(ctx.db, targetProfileId);
  if (!other) return;
  const mine = { ...ctx.profile, username: ctx.user.username };
  const toMe = `💕 <b>Взаимная симпатия!</b>\n\n${cardText(other)}\n\nНапиши: ${contactLink(other)}`;
  const toThem = `💕 <b>Взаимная симпатия!</b>\n\n${cardText(mine)}\n\nНапиши: ${contactLink({ telegram_user_id: ctx.user.telegram_user_id, username: ctx.user.username })}`;
  await sendCardTo(ctx.tg, ctx.chatId, other, toMe).catch(() => {});
  await sendCardTo(ctx.tg, other.telegram_user_id, mine, toThem).catch(error => console.error('AMORI match notify failed:', error.message));
}

// ---------- profile ----------
async function showProfile(ctx) {
  if (await needProfile(ctx)) return;
  const until = await access.premiumUntil(ctx.db, ctx.profile.id);
  await sendCardTo(ctx.tg, ctx.chatId, ctx.profile, profileText(ctx.profile, until), profileMarkup(ctx.profile));
}

// ---------- premium ----------
async function showPremium(ctx) {
  if (!ctx.cfg.paymentsEnabled) return say(ctx, '⭐ Premium скоро появится. Пока все функции бесплатны!');
  if (await needProfile(ctx)) return;
  const until = await access.premiumUntil(ctx.db, ctx.profile.id);
  const lines = ['⭐ <b>Premium</b>', ''];
  if (until) lines.push(`Активен до ${formatDate(until)}`, '');
  lines.push('Без лимитов на лайки, список тех, кто тебя лайкнул, и новые функции.');
  const rows = Object.values(access.PRODUCTS).map(p => [[`${p.title} — ${p.stars} ⭐`, `buy:${p.key}`]]);
  await say(ctx, lines.join('\n'), { reply_markup: inlineKeyboard(rows) });
}

async function onPaid(ctx, payment) {
  const product = access.PRODUCTS[String(payment.invoice_payload || '').replace(/^buy:/, '')];
  if (!product) return;
  const isNew = await data.recordPurchase(ctx.db, ctx.from.id, product.key, payment.total_amount, payment.telegram_payment_charge_id);
  if (!isNew) return;
  if (!ctx.profile) return say(ctx, 'Оплата получена, но анкеты нет. Напиши в поддержку.');
  const until = await access.grantPremium(ctx.db, ctx.profile.id, product.days, 'subscription');
  await say(ctx, `✅ Оплата прошла! Premium активен до ${formatDate(until)}`);
}

async function onPreCheckout(app, query) {
  const product = access.PRODUCTS[String(query.invoice_payload || '').replace(/^buy:/, '')];
  const ok = Boolean(app.ready && app.cfg.paymentsEnabled && product);
  await app.tg.safe('answerPreCheckoutQuery', { pre_checkout_query_id: query.id, ok, ...(ok ? {} : { error_message: 'Оплата временно недоступна' }) });
}

// ---------- messages ----------
async function onStart(ctx) {
  await data.setState(ctx.db, ctx.user.telegram_user_id, '', {});
  if (ctx.profile) return showMenu(ctx, `С возвращением, ${escapeHtml(ctx.profile.display_name)}! 💕`);
  await beginRegistration(ctx, WELCOME);
}

async function onCommand(ctx, cmd) {
  switch (cmd.name) {
    case 'start': return onStart(ctx);
    case 'help': return say(ctx, HELP);
    case 'cancel':
      await data.setState(ctx.db, ctx.user.telegram_user_id, '', {});
      return showMenu(ctx, 'Отменено.');
    case 'menu': return showMenu(ctx, 'Главное меню 👇');
    case 'whoami':
      return say(ctx, `Твой Telegram ID: <code>${ctx.from.id}</code>\nUsername: ${ctx.from.username ? '@' + escapeHtml(ctx.from.username) : '—'}\nРоль: ${ctx.user.role}`);
    case 'browse': return showNext(ctx);
    case 'likes': return showLikes(ctx);
    case 'matches': return showMatches(ctx);
    case 'profile': return showProfile(ctx);
    case 'premium': return showPremium(ctx);
  }
  if (await handleAdminCommand(ctx, cmd)) return;
  return showMenu(ctx, 'Не знаю такую команду. Вот меню 👇');
}

async function onMessage(app, message) {
  if (message.chat?.type !== 'private' || !message.from || message.from.is_bot) return;
  const ctx = await buildContext(app, message.from, message.chat.id);
  if (ctx.user.is_banned) return say(ctx, '🚫 Твой аккаунт заблокирован.');
  if (message.successful_payment) return onPaid(ctx, message.successful_payment);

  const text = (message.text || '').trim();
  const cmd = parseCommand(text);
  if (cmd) return onCommand(ctx, cmd);

  const state = ctx.user.state || '';
  if (state.startsWith('reg_')) return onRegistration(ctx, message, state);
  if (state.startsWith('admin_') && ctx.isStaff) return handleAdminText(ctx, text, state);

  switch (text) {
    case BTN.browse: return showNext(ctx);
    case BTN.likes: return showLikes(ctx);
    case BTN.matches: return showMatches(ctx);
    case BTN.profile: return showProfile(ctx);
    case BTN.premium: return showPremium(ctx);
    case BTN.admin:
      if (ctx.isStaff) return showAdminHome(ctx);
      break;
  }
  return showMenu(ctx, 'Выбери действие в меню 👇');
}

// ---------- callbacks ----------
async function afterReaction(ctx) {
  await ctx.tg.setMarkup(ctx.chatId, ctx.cq.message.message_id, null);
}

async function onLike(ctx, targetId) {
  if (!ctx.profile) return ctx.tg.answerCallback(ctx.cq.id);
  const gate = await access.check(ctx.db, ctx, 'like');
  if (!gate.allowed) {
    await ctx.tg.answerCallback(ctx.cq.id);
    return say(ctx, gate.message, { reply_markup: upsellMarkup(ctx.cfg) });
  }
  const result = await data.like(ctx.db, ctx.profile, targetId);
  await afterReaction(ctx);
  if (!result.ok) {
    await ctx.tg.answerCallback(ctx.cq.id, 'Анкета недоступна');
    return showNext(ctx);
  }
  await ctx.tg.answerCallback(ctx.cq.id, '❤️');
  if (result.duplicate) return;
  if (result.matched) await notifyMatch(ctx, targetId);
  await showNext(ctx);
}

async function onPass(ctx, targetId) {
  if (!ctx.profile) return ctx.tg.answerCallback(ctx.cq.id);
  await data.pass(ctx.db, ctx.profile, targetId);
  await afterReaction(ctx);
  await ctx.tg.answerCallback(ctx.cq.id, '👎');
  await showNext(ctx);
}

async function onBlock(ctx, targetId) {
  if (!ctx.profile) return ctx.tg.answerCallback(ctx.cq.id);
  const done = await data.block(ctx.db, ctx.profile, targetId);
  if (done) await data.pass(ctx.db, ctx.profile, targetId);
  await afterReaction(ctx);
  await ctx.tg.answerCallback(ctx.cq.id, done ? 'Заблокирован' : 'Не получилось');
  await showNext(ctx);
}

async function onReport(ctx, code, targetId) {
  const reason = REPORT_REASONS[code];
  if (!reason || !ctx.profile) return ctx.tg.answerCallback(ctx.cq.id);
  const result = await data.report(ctx.db, ctx.profile, targetId, reason.value);
  await afterReaction(ctx);
  if (!result.ok) {
    await ctx.tg.answerCallback(ctx.cq.id, result.reason === 'rate_limited' ? 'Слишком много жалоб за сутки' : 'Не получилось', true);
    return;
  }
  await ctx.tg.answerCallback(ctx.cq.id, 'Спасибо, жалоба отправлена модераторам');
  const staff = new Set([...(await data.listStaff(ctx.db)).map(u => String(u.telegram_user_id)), ...ctx.cfg.adminIds]);
  for (const id of staff) await ctx.tg.safe('sendMessage', { chat_id: id, text: '🚩 Новая жалоба. Открой /reports' });
  await showNext(ctx);
}

async function onProfileAction(ctx, action) {
  if (!ctx.profile) return ctx.tg.answerCallback(ctx.cq.id);
  const messageId = ctx.cq.message.message_id;
  if (action === 'redo') {
    await ctx.tg.answerCallback(ctx.cq.id);
    return beginRegistration(ctx, 'Заполним анкету заново.');
  }
  if (action === 'toggle') {
    const visible = await data.toggleVisibility(ctx.db, ctx.from.id);
    ctx.profile = await data.getProfile(ctx.db, ctx.from.id);
    const until = await access.premiumUntil(ctx.db, ctx.profile.id);
    await ctx.tg.editCaption(ctx.chatId, messageId, profileText(ctx.profile, until), profileMarkup(ctx.profile));
    return ctx.tg.answerCallback(ctx.cq.id, visible ? 'Анкета показывается' : 'Анкета скрыта');
  }
  if (action === 'age') {
    await ctx.tg.answerCallback(ctx.cq.id);
    return say(ctx, 'Какой возраст показывать в ленте?', {
      reply_markup: inlineKeyboard([
        [['18–22', 'af:18-22'], ['23–27', 'af:23-27']],
        [['28–35', 'af:28-35'], ['36+', 'af:36-99']],
        [['Любой', 'af:any']]
      ])
    });
  }
  if (action === 'del') {
    await ctx.tg.answerCallback(ctx.cq.id);
    return say(ctx, 'Удалить анкету? Тебя перестанут показывать, лайки и пары сотрутся.', {
      reply_markup: inlineKeyboard([[['Да, удалить', 'p:delyes'], ['Отмена', 'p:delno']]])
    });
  }
  if (action === 'delno') {
    await ctx.tg.setMarkup(ctx.chatId, messageId, null);
    return ctx.tg.answerCallback(ctx.cq.id, 'Анкета осталась');
  }
  if (action === 'delyes') {
    await data.deleteProfile(ctx.db, ctx.from.id);
    await ctx.tg.setMarkup(ctx.chatId, messageId, null);
    await ctx.tg.answerCallback(ctx.cq.id, 'Анкета удалена');
    return say(ctx, 'Анкета удалена. Чтобы создать новую — /start', { reply_markup: { remove_keyboard: true } });
  }
  return ctx.tg.answerCallback(ctx.cq.id);
}

async function onCallback(app, cq) {
  const chatId = cq.message?.chat?.id;
  if (!chatId || cq.message.chat.type !== 'private') return app.tg.answerCallback(cq.id);
  const ctx = await buildContext(app, cq.from, chatId);
  ctx.cq = cq;
  if (ctx.user.is_banned) return app.tg.answerCallback(cq.id, 'Доступ ограничен', true);

  const [action, ...rest] = String(cq.data || '').split(':');
  if (await handleAdminCallback(ctx, action, rest)) return;
  const messageId = cq.message.message_id;
  switch (action) {
    case 'l': return onLike(ctx, rest[0]);
    case 'd': return onPass(ctx, rest[0]);
    case 'b': return onBlock(ctx, rest[0]);
    case 'm':
      await ctx.tg.setMarkup(chatId, messageId, moreMarkup(rest[0]));
      return ctx.tg.answerCallback(cq.id);
    case 'bk':
      await ctx.tg.setMarkup(chatId, messageId, reactionMarkup(rest[0]));
      return ctx.tg.answerCallback(cq.id);
    case 'rp': return onReport(ctx, rest[0], rest[1]);
    case 'p': return onProfileAction(ctx, rest[0]);
    case 'af': {
      const preset = AGE_PRESETS[rest[0]];
      if (!preset || !ctx.profile) return ctx.tg.answerCallback(cq.id);
      await data.setAgeFilter(ctx.db, ctx.from.id, preset[0], preset[1]);
      await ctx.tg.setMarkup(chatId, messageId, null);
      return ctx.tg.answerCallback(cq.id, 'Фильтр сохранён ✅');
    }
    case 'premium':
      await ctx.tg.answerCallback(cq.id);
      return showPremium(ctx);
    case 'buy': {
      const product = access.PRODUCTS[rest[0]];
      if (!product || !ctx.cfg.paymentsEnabled) return ctx.tg.answerCallback(cq.id, 'Оплата недоступна', true);
      await ctx.tg.answerCallback(cq.id);
      return ctx.tg.safe('sendInvoice', {
        chat_id: chatId, title: product.title, description: product.description, payload: `buy:${product.key}`,
        provider_token: '', currency: 'XTR', prices: [{ label: product.title, amount: product.stars }]
      });
    }
  }
  return ctx.tg.answerCallback(cq.id);
}

// ---------- runtime ----------
async function ensureReady(app) {
  if (app.ready) return true;
  if (!app.db || Date.now() - app.lastCheck < 30000) return false;
  app.lastCheck = Date.now();
  try {
    await app.db.query('select 1 from bot_users limit 1');
    await app.db.query('select 1 from passes limit 1');
    app.ready = true;
    console.log('AMORI chat bot features enabled.');
  } catch (error) {
    console.error('AMORI chat bot features are off until migration 002 is applied (npm run migrate):', error.message);
  }
  return app.ready;
}

// Before the database is ready the bot keeps its original behaviour: just open the Mini App.
async function legacyReply(app, update) {
  const message = update.message;
  if (!message?.chat?.id || message.chat.type !== 'private') return;
  if (!app.cfg.miniAppUrl) {
    await app.tg.sendMessage(message.chat.id, 'Привет! 💗 Бот ещё настраивается — загляни чуть позже.');
    return;
  }
  await app.tg.sendMessage(message.chat.id, 'Привет! 💗\n\nЭто <b>AMORI</b> — знакомства прямо в Telegram.\n\nНажми кнопку ниже, чтобы открыть приложение:', {
    reply_markup: { inline_keyboard: [[{ text: '💗 Открыть AMORI', web_app: { url: app.cfg.miniAppUrl } }]] }
  });
}

async function handleUpdate(app, update) {
  if (!(await ensureReady(app))) return legacyReply(app, update);
  const actor = update.message?.from || update.callback_query?.from;
  if (actor && throttled(actor.id)) {
    if (update.callback_query) await app.tg.answerCallback(update.callback_query.id, 'Не так быстро 🙂');
    return;
  }
  if (update.message) return onMessage(app, update.message);
  if (update.callback_query) return onCallback(app, update.callback_query);
  if (update.pre_checkout_query) return onPreCheckout(app, update.pre_checkout_query);
}

async function poll(app) {
  const { tg, cfg } = app;
  try {
    // Long polling and webhooks cannot run at the same time.
    await tg.call('deleteWebhook', { drop_pending_updates: false });
    await tg.call('setMyCommands', {
      commands: [
        { command: 'start', description: 'Главное меню' },
        { command: 'browse', description: 'Смотреть анкеты' },
        { command: 'likes', description: 'Кто меня лайкнул' },
        { command: 'matches', description: 'Мои пары' },
        { command: 'profile', description: 'Моя анкета' },
        { command: 'help', description: 'Помощь' }
      ]
    });
    await tg.call('setChatMenuButton', { menu_button: cfg.miniAppUrl ? { type: 'web_app', text: 'Открыть AMORI', web_app: { url: cfg.miniAppUrl } } : { type: 'commands' } });
    console.log('AMORI Telegram bot polling started.');
  } catch (error) {
    console.error('AMORI Telegram bot setup failed:', error.message);
    await sleep(5000);
  }

  let offset = 0;
  for (;;) {
    try {
      const updates = await tg.call('getUpdates', {
        offset, timeout: 25, allowed_updates: ['message', 'callback_query', 'pre_checkout_query']
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await handleUpdate(app, update);
        } catch (error) {
          console.error('AMORI Telegram update failed:', error.message);
          if (update.callback_query) await tg.answerCallback(update.callback_query.id, 'Что-то пошло не так, попробуй ещё раз');
        }
      }
    } catch (error) {
      console.error('AMORI Telegram polling error:', error.message);
      await sleep(4000);
    }
  }
}

// options: { db: pg.Pool | null, ownerId, adminIds: Set<string> }
export function startTelegramBot(token, options = {}) {
  if (!token) {
    console.error('AMORI Telegram bot is disabled: BOT_TOKEN is not configured for this service.');
    return;
  }
  const app = { tg: createTelegram(token), db: options.db || null, cfg: buildConfig(options), ready: false, lastCheck: 0 };
  poll(app).catch(error => console.error('AMORI Telegram bot stopped unexpectedly:', error.message));
}
