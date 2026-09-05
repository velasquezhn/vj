jest.mock('../services/whatsappInteractiveService', () => ({ sendReplyButtons: jest.fn().mockResolvedValue({ ok: true }) }));
jest.mock('../services/messagingService', () => ({ enviarMenuPrincipal: jest.fn().mockResolvedValue({ ok: true }) }));

const { sendReplyButtons } = require('../services/whatsappInteractiveService');
const { enviarMenuPrincipal } = require('../services/messagingService');
const { showWeatherPrompt, sendWeatherResult, handleWeatherState } = require('../controllers/flows/weatherHandler');
const { CONVERSATION_STATES } = require('../services/whatsappConversation');

describe('flujo conversacional de clima', () => {
  const bot = {};
  const recipient = '50400000000';
  let setState;

  beforeEach(() => {
    jest.clearAllMocks();
    setState = jest.fn().mockResolvedValue();
  });

  test('solicita una ciudad con botones y alternativa escrita', async () => {
    await showWeatherPrompt(bot, recipient, setState);
    expect(setState).toHaveBeenCalledWith(recipient, CONVERSATION_STATES.WEATHER_CITY, {});
    const payload = sendReplyButtons.mock.calls[0][2];
    expect(payload.buttons).toHaveLength(3);
    expect(payload.fallbackText).toMatch(/1\. Clima de Tela[\s\S]*0\. Menú principal/);
  });

  test('muestra resultado y conserva acciones de recuperación', async () => {
    const service = { getWeatherForecast: jest.fn().mockResolvedValue({ success: true, message: 'Soleado' }) };
    await sendWeatherResult(bot, recipient, 'Tela, Honduras', setState, service);
    expect(setState).toHaveBeenCalledWith(recipient, CONVERSATION_STATES.WEATHER_RESULT, { weatherQuery: 'Tela, Honduras' });
    expect(sendReplyButtons.mock.calls[0][2].buttons.map((button) => button.title)).toEqual(['Actualizar', 'Otra ciudad', 'Menú principal']);
  });

  test('los fallos también permiten reintentar, cambiar ciudad o volver', async () => {
    const service = { getWeatherForecast: jest.fn().mockResolvedValue({ success: false, message: 'No disponible' }) };
    await sendWeatherResult(bot, recipient, 'Tela', setState, service);
    expect(sendReplyButtons.mock.calls[0][2].fallbackText).toMatch(/1\. Intentar nuevamente[\s\S]*2\. Consultar otra ciudad[\s\S]*0\. Menú principal/);
  });

  test.each(['0', 'MENÚ', 'menu'])('vuelve al menú con %s', async (input) => {
    await handleWeatherState(bot, recipient, input, CONVERSATION_STATES.WEATHER_CITY, {}, setState);
    expect(enviarMenuPrincipal).toHaveBeenCalledWith(bot, recipient);
  });

  test('reintenta la última ciudad tras un resultado', async () => {
    const service = { getWeatherForecast: jest.fn().mockResolvedValue({ success: true, message: 'Listo' }) };
    await handleWeatherState(bot, recipient, 'ACTUALIZAR', CONVERSATION_STATES.WEATHER_RESULT, { weatherQuery: 'La Ceiba, Honduras' }, setState, service);
    expect(service.getWeatherForecast).toHaveBeenCalledWith('La Ceiba, Honduras');
  });

  test('acepta una ciudad escrita libremente y normaliza espacios externos', async () => {
    const service = { getWeatherForecast: jest.fn().mockResolvedValue({ success: true, message: 'Listo' }) };
    await handleWeatherState(bot, recipient, '  San Pedro Sula, Honduras  ', CONVERSATION_STATES.WEATHER_CITY, {}, setState, service);
    expect(service.getWeatherForecast).toHaveBeenCalledWith('San Pedro Sula, Honduras');
  });

  test('una respuesta vacía vuelve a explicar las opciones', async () => {
    await handleWeatherState(bot, recipient, '   ', CONVERSATION_STATES.WEATHER_CITY, {}, setState);
    expect(setState).toHaveBeenCalledWith(recipient, CONVERSATION_STATES.WEATHER_CITY, {});
    expect(sendReplyButtons).toHaveBeenCalledTimes(1);
  });
});
