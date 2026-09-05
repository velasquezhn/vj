jest.mock('../services/whatsappInteractiveService', () => ({ sendReplyButtons: jest.fn().mockResolvedValue({ ok: true }) }));
jest.mock('../services/messagingService', () => ({ enviarMenuPrincipal: jest.fn().mockResolvedValue({ ok: true }) }));

const { sendReplyButtons } = require('../services/whatsappInteractiveService');
const { enviarMenuPrincipal } = require('../services/messagingService');
const { TELA_QUERY, sendTelaWeather, handleWeatherState } = require('../controllers/flows/weatherHandler');
const { CONVERSATION_STATES } = require('../services/whatsappConversation');

describe('flujo conversacional de clima exclusivo para Tela', () => {
  const bot = {};
  const recipient = '50400000000';
  let setState;

  beforeEach(() => {
    jest.clearAllMocks();
    setState = jest.fn().mockResolvedValue();
  });

  test('consulta Tela inmediatamente sin solicitar ciudad', async () => {
    const service = { getWeatherForecast: jest.fn().mockResolvedValue({ success: true, message: 'Soleado', provider: 'open-meteo' }) };
    await sendTelaWeather(bot, recipient, setState, service);
    expect(service.getWeatherForecast).toHaveBeenCalledWith('Tela, Honduras');
    expect(TELA_QUERY).toBe('Tela, Honduras');
    expect(setState).toHaveBeenCalledWith(recipient, CONVERSATION_STATES.WEATHER_RESULT, { weatherQuery: 'Tela, Honduras' });
    const payload = sendReplyButtons.mock.calls[0][2];
    expect(payload.buttons.map((button) => button.title)).toEqual(['Actualizar', 'Menú principal']);
    expect(payload.footer).toBe('Fuente: Open-Meteo');
    expect(payload.fallbackText).not.toMatch(/otra ciudad|escribe.*ciudad/i);
  });

  test('los fallos permiten actualizar Tela o volver al menú', async () => {
    const service = { getWeatherForecast: jest.fn().mockResolvedValue({ success: false, message: 'No disponible' }) };
    await sendTelaWeather(bot, recipient, setState, service);
    const payload = sendReplyButtons.mock.calls[0][2];
    expect(payload.buttons.map((button) => button.title)).toEqual(['Actualizar', 'Menú principal']);
    expect(payload.fallbackText).toMatch(/1\. Actualizar clima de Tela[\s\S]*0\. Menú principal/);
  });

  test.each(['0', 'MENÚ', 'menu principal'])('vuelve al menú con %s', async (input) => {
    await handleWeatherState(bot, recipient, input, CONVERSATION_STATES.WEATHER_RESULT, {}, setState);
    expect(enviarMenuPrincipal).toHaveBeenCalledWith(bot, recipient);
  });

  test.each(['1', 'ACTUALIZAR', '', 'San Pedro Sula, Honduras'])('cualquier otra entrada mantiene la consulta exclusiva de Tela (%s)', async (input) => {
    const service = { getWeatherForecast: jest.fn().mockResolvedValue({ success: true, message: 'Listo', provider: 'open-meteo' }) };
    await handleWeatherState(bot, recipient, input, CONVERSATION_STATES.WEATHER_RESULT, {}, setState, service);
    expect(service.getWeatherForecast).toHaveBeenCalledWith('Tela, Honduras');
  });
});
