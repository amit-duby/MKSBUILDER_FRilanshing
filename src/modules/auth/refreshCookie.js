const { getConfig } = require('../../config/env');

const COOKIE_NAME = 'refresh_token';
const COOKIE_PATH = '/api/v1/auth';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function cookieBase() {
  const production = getConfig().NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'strict' : 'lax',
    path: COOKIE_PATH,
  };
}

function parseCookieHeader(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    try {
      cookies[key] = decodeURIComponent(raw);
    } catch {
      cookies[key] = raw;
    }
  }
  return cookies;
}

function readRefreshToken(req) {
  const fromBody = String((req.body && req.body.refreshToken) || '').trim();
  if (fromBody) return fromBody;
  return String(parseCookieHeader(req.headers.cookie)[COOKIE_NAME] || '').trim();
}

function setRefreshCookie(res, token, expiresAt) {
  const maxAge = expiresAt
    ? Math.max(0, new Date(expiresAt).getTime() - Date.now())
    : WEEK_MS;
  res.cookie(COOKIE_NAME, token, { ...cookieBase(), maxAge });
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieBase());
}

function attachRefreshCookie(res, session) {
  if (session && session.refreshToken) {
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  }
  return session;
}

module.exports = {
  COOKIE_NAME,
  COOKIE_PATH,
  readRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  attachRefreshCookie,
};
