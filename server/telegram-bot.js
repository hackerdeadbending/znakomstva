const MINI_APP_URL = 'https://znakomstva-mini-app.onrender.com';
const TELEGRAM_API = 'https://api.telegram.org';

async function telegram(token, method, body = {}) {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(35000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method} failed: ${result.description || response.status}`);
  }
  return result.result;
}

function launchKeyboard() {
  return {
    inline_keyboard: [[{
      text: '💗 Открыть AMORI',
      web_app: { url: MINI_APP_URL }
    }]]
  };
}

async function reply(token, chatId, text, replyMarkup) {
  return telegram(token, 'sendMessage', {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });
}

async function handleUpdate(token, update) {
  const message = update.message;
  if (!message?.chat?.id) return;
  const text = (message.text || '').trim();
  if (text.startsWith('/start')) {
    await reply(
      token,
      message.chat.id,
      'Привет! 💗 Это AMORI — знакомства, где всё начинается с искры.\n\nСоздай анкету, смотри людей и находи взаимные симпатии. Приложение открывается прямо в Telegram.',
      launchKeyboard()
    );
    return;
  }
  if (text.startsWith('/help')) {
    await reply(token, message.chat.id, 'Нажми кнопку ниже, чтобы открыть AMORI. Если приложение не загружается, отправь /start ещё раз.', launchKeyboard());
    return;
  }
  if (message.chat.type === 'private') {
    await reply(token, message.chat.id, 'Чтобы начать знакомиться, нажми «Открыть AMORI».', launchKeyboard());
  }
}

export function startTelegramBot(token) {
  if (!token) {
    console.error('AMORI Telegram bot is disabled: BOT_TOKEN is not configured for this service.');
    return;
  }

  let offset = 0;
  let stopped = false;
  const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  async function poll() {
    try {
      // Long polling and webhooks cannot run at the same time.
      await telegram(token, 'deleteWebhook', { drop_pending_updates: false });
      await telegram(token, 'setMyCommands', {
        commands: [
          { command: 'start', description: 'Открыть AMORI' },
          { command: 'help', description: 'Помощь' }
        ]
      });
      console.log('AMORI Telegram bot polling started.');
    } catch (error) {
      console.error('AMORI Telegram bot setup failed:', error.message);
      await pause(5000);
    }

    while (!stopped) {
      try {
        const updates = await telegram(token, 'getUpdates', {
          offset,
          timeout: 25,
          allowed_updates: ['message']
        });
        for (const update of updates) {
          offset = update.update_id + 1;
          try {
            await handleUpdate(token, update);
          } catch (error) {
            console.error('AMORI Telegram update failed:', error.message);
          }
        }
      } catch (error) {
        console.error('AMORI Telegram polling error:', error.message);
        await pause(4000);
      }
    }
  }

  poll().catch(error => console.error('AMORI Telegram bot stopped unexpectedly:', error.message));
}
