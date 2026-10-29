const TELEGRAM_API = 'https://api.telegram.org';

export function createTelegram(token) {
  async function call(method, body = {}, timeoutMs = 35000) {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      const error = new Error(`Telegram ${method} failed: ${result.description || response.status}`);
      error.code = result.error_code;
      error.retryAfter = result.parameters?.retry_after;
      throw error;
    }
    return result.result;
  }

  async function safe(method, body) {
    try {
      return await call(method, body);
    } catch (error) {
      console.error('AMORI Telegram call failed:', error.message);
      return null;
    }
  }

  return {
    call,
    safe,
    sendMessage: (chatId, text, extra = {}) =>
      call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra }),
    sendPhoto: (chatId, photo, caption, extra = {}) =>
      call('sendPhoto', { chat_id: chatId, photo, caption, parse_mode: 'HTML', ...extra }),
    answerCallback: (id, text = '', alert = false) =>
      safe('answerCallbackQuery', { callback_query_id: id, text, show_alert: alert }),
    editText: (chatId, messageId, text, markup) =>
      call('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: markup || { inline_keyboard: [] } }),
    setMarkup: (chatId, messageId, markup) =>
      safe('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: markup || { inline_keyboard: [] } }),
    editCaption: (chatId, messageId, caption, markup) =>
      safe('editMessageCaption', { chat_id: chatId, message_id: messageId, caption, parse_mode: 'HTML', reply_markup: markup })
  };
}
