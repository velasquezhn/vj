const mockRunQuery = jest.fn();
const mockRunExecute = jest.fn().mockResolvedValue({ changes: 1 });

jest.mock('../db', () => ({ runQuery: mockRunQuery, runExecute: mockRunExecute }));
jest.mock('../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const stateService = require('../services/persistentStateService');

describe('persistencia y vencimiento de sesiones WhatsApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunExecute.mockResolvedValue({ changes: 1 });
  });

  test('elimina una sesión vencida y avisa al router mediante expired', async () => {
    mockRunQuery.mockResolvedValueOnce([{
      state: 'weather_city', data: '{}', expires_at: '2000-01-01 00:00:00', active: 0
    }]);
    const result = await stateService.obtenerEstado('expired-user');
    expect(result).toEqual({ estado: 'MENU_PRINCIPAL', datos: {}, expired: true });
    expect(mockRunExecute).toHaveBeenCalledWith('DELETE FROM UserStates WHERE user_id = ?', ['expired-user']);
  });

  test('los pasos ordinarios respetan el TTL configurable', async () => {
    process.env.CONVERSATION_SESSION_TTL_MINUTES = '15';
    const before = Date.now();
    await stateService.establecerEstado('short-user', 'weather_city', { weatherQuery: 'Tela' });
    const insert = mockRunExecute.mock.calls.find(([sql]) => sql.includes('INSERT OR REPLACE'));
    const expiration = Date.parse(`${insert[1][3].replace(' ', 'T')}Z`);
    expect(expiration - before).toBeGreaterThanOrEqual(14 * 60 * 1000);
    expect(expiration - before).toBeLessThanOrEqual(16 * 60 * 1000);
    delete process.env.CONVERSATION_SESSION_TTL_MINUTES;
  });

  test('autorización, pago y confirmación conservan al menos 24 horas', async () => {
    const before = Date.now();
    await stateService.establecerEstado('long-user', 'esperando_pago', {});
    const insert = mockRunExecute.mock.calls.find(([sql]) => sql.includes('INSERT OR REPLACE'));
    const expiration = Date.parse(`${insert[1][3].replace(' ', 'T')}Z`);
    expect(expiration - before).toBeGreaterThanOrEqual(23.9 * 60 * 60 * 1000);
  });
});
