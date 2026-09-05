const path = require('path');

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Variable de entorno requerida: ${name}`);
  return value.trim();
}

function parseBoolean(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} debe ser true o false`);
}

function loadConfig({ validateWhatsApp = process.env.NODE_ENV === 'production' } = {}) {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const config = {
    nodeEnv,
    appEnv: String(process.env.APP_ENV || (nodeEnv === 'production' ? 'qa' : 'local')).toLowerCase(),
    port: Number(process.env.PORT || 4000),
    databasePath: path.resolve(process.env.DB_PATH || './data/bot_database.sqlite'),
    requireEmptyProductionData: parseBoolean('REQUIRE_EMPTY_PRODUCTION_DATA', false),
    jwtSecret: process.env.JWT_SECRET || '',
    corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',').map((value) => value.trim()).filter(Boolean),
    whatsapp: {
      enabled: parseBoolean('WHATSAPP_ENABLED', true),
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v26.0',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
      appSecret: process.env.META_APP_SECRET || ''
    }
  };

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('PORT debe ser un puerto TCP válido');
  }
  if (validateWhatsApp && config.whatsapp.enabled) {
    ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'META_APP_SECRET']
      .forEach(required);
  }
  if (config.nodeEnv === 'production' && required('JWT_SECRET').length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
  }
  return config;
}

module.exports = { loadConfig, required, parseBoolean };
