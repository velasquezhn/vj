const { buildReservationFlowMessage } = require('../services/whatsappFlowService');

describe('WhatsApp reservation Flow', () => {
  test('construye un mensaje Flow nativo sin secretos', () => {
    const message = buildReservationFlowMessage('123456789');
    expect(message.interactive.type).toBe('flow');
    expect(message.interactive.action.parameters.flow_id).toBe('123456789');
    expect(message.interactive.action.parameters.flow_token).toEqual(expect.any(String));
    expect(message.interactive.action.parameters.flow_token.length).toBeGreaterThan(10);
  });

  test('no genera Flow si Meta todavía no ha entregado el ID', () => {
    expect(buildReservationFlowMessage('')).toBeNull();
  });
});
