const { redactText, redactValue } = require('../config/logger');

describe('redacción de datos sensibles en logs', () => {
  test('oculta tokens de URL, Bearer y números de WhatsApp', () => {
    const input = 'GET /weather?appid=secret123 Authorization Bearer abc.def_123 user 50499990000@s.whatsapp.net';
    const output = redactText(input);
    expect(output).not.toContain('secret123');
    expect(output).not.toContain('abc.def_123');
    expect(output).not.toContain('50499990000');
  });

  test('oculta claves sensibles dentro de metadatos anidados', () => {
    const value = redactValue({ appSecret: 'one', nested: { password: 'two', city: 'Tela' } });
    expect(value).toEqual({ appSecret: '[REDACTED]', nested: { password: '[REDACTED]', city: 'Tela' } });
  });
});
