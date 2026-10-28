const API_BASE = 'https://znakomstva-zp2y.onrender.com';

function initData() {
  return window.Telegram?.WebApp?.initData || '';
}

export class ApiError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function api(path, options = {}) {
  const session = initData();
  if (!session) {
    throw new ApiError('Открой AMORI через Telegram, чтобы безопасно войти в аккаунт.', 401, 'telegram_session_required');
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': session,
        ...(options.headers || {})
      }
    });
  } catch {
    throw new ApiError('Не удалось связаться с сервером. Проверь подключение и попробуй ещё раз.', 0, 'network_error');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messages = {
      profile_required: 'Сначала заполни свою анкету.',
      invalid_telegram_session: 'Сессия Telegram устарела. Закрой и заново открой приложение.',
      service_not_configured: 'Сервис временно не готов принимать запросы.',
      adults_only: 'AMORI доступен только совершеннолетним пользователям.'
    };
    throw new ApiError(messages[payload.error] || `Запрос не выполнен (${response.status}). Попробуй ещё раз.`, response.status, payload.error || '');
  }
  return payload;
}

export const apiClient = {
  me: () => api('/api/me'),
  saveMe: (profile) => api('/api/me', { method: 'PUT', body: JSON.stringify(profile) }),
  discovery: (limit = 20) => api(`/api/discovery?limit=${limit}`),
  like: (profileId) => api(`/api/likes/${encodeURIComponent(profileId)}`, { method: 'POST', body: '{}' }),
  incomingLikes: () => api('/api/likes/incoming'),
  matches: () => api('/api/matches')
};
