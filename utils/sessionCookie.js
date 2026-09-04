const SESSION_COOKIE_NAME = 'vj_admin_session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getSessionCookieOptions() {
  const isProductionRuntime = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProductionRuntime,
    sameSite: isProductionRuntime ? 'none' : 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS
  };
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
}

function clearSessionCookie(res) {
  const { maxAge: _maxAge, ...options } = getSessionCookieOptions();
  res.clearCookie(SESSION_COOKIE_NAME, options);
}

function readCookieHeader(cookieHeader = '') {
  return String(cookieHeader)
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separator = entry.indexOf('=');
      if (separator < 1) return cookies;
      const name = entry.slice(0, separator);
      const value = entry.slice(separator + 1);
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
      return cookies;
    }, {});
}

function extractSessionToken(req) {
  const authorization = String(req.headers?.authorization || '');
  const [scheme, bearerToken] = authorization.split(/\s+/, 2);
  if (scheme.toLowerCase() === 'bearer' && bearerToken && !['null', 'undefined'].includes(bearerToken)) {
    return bearerToken;
  }
  return readCookieHeader(req.headers?.cookie)[SESSION_COOKIE_NAME] || null;
}

function isCookieSessionRequestSafe(req) {
  const authorization = String(req.headers?.authorization || '');
  const [scheme, bearerToken] = authorization.split(/\s+/, 2);
  if (scheme.toLowerCase() === 'bearer' && bearerToken && !['null', 'undefined'].includes(bearerToken)) return true;
  if (['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase())) return true;
  return req.headers?.['x-vj-client'] === 'admin-frontend';
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  getSessionCookieOptions,
  setSessionCookie,
  clearSessionCookie,
  readCookieHeader,
  extractSessionToken,
  isCookieSessionRequestSafe
};
