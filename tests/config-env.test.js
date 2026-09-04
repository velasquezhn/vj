const ORIGINAL_ENV = process.env;

describe('configuración de producción', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) };
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.META_APP_SECRET;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('permite arrancar en mantenimiento con WhatsApp desactivado', () => {
    process.env.WHATSAPP_ENABLED = 'false';
    const { loadConfig } = require('../config/env');
    expect(loadConfig().whatsapp.enabled).toBe(false);
  });

  test('identifica como QA un runtime de despliegue sin APP_ENV explícito', () => {
    process.env.WHATSAPP_ENABLED = 'false';
    delete process.env.APP_ENV;
    const { loadConfig } = require('../config/env');
    expect(loadConfig().appEnv).toBe('qa');
  });

  test('respeta la identidad explícita del ambiente', () => {
    process.env.WHATSAPP_ENABLED = 'false';
    process.env.APP_ENV = 'production';
    const { loadConfig } = require('../config/env');
    expect(loadConfig().appEnv).toBe('production');
  });

  test('exige las credenciales oficiales cuando WhatsApp está activado', () => {
    process.env.WHATSAPP_ENABLED = 'true';
    const { loadConfig } = require('../config/env');
    expect(() => loadConfig()).toThrow('WHATSAPP_ACCESS_TOKEN');
  });

  test('rechaza valores booleanos ambiguos', () => {
    process.env.WHATSAPP_ENABLED = 'yes';
    const { loadConfig } = require('../config/env');
    expect(() => loadConfig()).toThrow('WHATSAPP_ENABLED debe ser true o false');
  });
});
