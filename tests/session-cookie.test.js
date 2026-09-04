const {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  readCookieHeader,
  extractSessionToken,
  isCookieSessionRequestSafe
} = require('../utils/sessionCookie');

describe('sesión administrativa segura', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('usa una cookie HttpOnly, Secure y SameSite=None en el runtime del servidor', () => {
    process.env.NODE_ENV = 'production';
    expect(getSessionCookieOptions()).toMatchObject({ httpOnly: true, secure: true, sameSite: 'none', path: '/' });
  });

  test('permite desarrollo local por HTTP', () => {
    process.env.NODE_ENV = 'development';
    expect(getSessionCookieOptions()).toMatchObject({ httpOnly: true, secure: false, sameSite: 'lax' });
  });

  test('lee cookies codificadas y conserva valores con signos iguales', () => {
    expect(readCookieHeader('theme=dark; value=a%3Db')).toEqual({ theme: 'dark', value: 'a=b' });
  });

  test('prefiere un Bearer válido y usa la cookie como respaldo', () => {
    expect(extractSessionToken({ headers: { authorization: 'Bearer legacy-token', cookie: `${SESSION_COOKIE_NAME}=cookie-token` } })).toBe('legacy-token');
    expect(extractSessionToken({ headers: { cookie: `${SESSION_COOKIE_NAME}=cookie-token` } })).toBe('cookie-token');
    expect(extractSessionToken({ headers: { authorization: 'Bearer null', cookie: `${SESSION_COOKIE_NAME}=cookie-token` } })).toBe('cookie-token');
  });

  test('protege cambios hechos solamente con cookie contra solicitudes externas', () => {
    expect(isCookieSessionRequestSafe({ method: 'POST', headers: { 'x-vj-client': 'admin-frontend' } })).toBe(true);
    expect(isCookieSessionRequestSafe({ method: 'POST', headers: {} })).toBe(false);
    expect(isCookieSessionRequestSafe({ method: 'GET', headers: {} })).toBe(true);
    expect(isCookieSessionRequestSafe({ method: 'DELETE', headers: { authorization: 'Bearer token' } })).toBe(true);
  });
});
