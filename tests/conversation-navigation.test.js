jest.mock('../services/stateService', () => ({
  obtenerEstado: jest.fn(), establecerEstado: jest.fn()
}));
jest.mock('../controllers/flows/greetingHandler', () => ({ handleGreeting: jest.fn() }));
jest.mock('../controllers/flows/menuHandler', () => ({ handleMenuState: jest.fn() }));
jest.mock('../controllers/flows/actividadesHandler', () => ({ handleActividadesState: jest.fn() }));
jest.mock('../controllers/flows/reservaFlowHandler', () => ({ handleReservaState: jest.fn() }));
jest.mock('../controllers/flows/weatherHandler', () => ({
  handleWeatherState: jest.fn(), sendTelaWeather: jest.fn()
}));
jest.mock('../services/messagingService', () => ({
  enviarMenuPrincipal: jest.fn(), enviarMenuCabanas: jest.fn(), enviarMenuActividades: jest.fn()
}));
jest.mock('../services/whatsappInteractiveService', () => ({ sendReplyButtons: jest.fn() }));
jest.mock('../services/whatsappAdminService', () => ({
  isAdminSender: jest.fn(), handleAdminMessage: jest.fn(),
  notifyAdminsOfGuestRequest: jest.fn()
}));

const { procesarMensaje } = require('../controllers/flows/messageProcessor');
const stateService = require('../services/stateService');
const { handleGreeting } = require('../controllers/flows/greetingHandler');
const { handleReservaState } = require('../controllers/flows/reservaFlowHandler');
const { sendTelaWeather } = require('../controllers/flows/weatherHandler');
const { enviarMenuPrincipal } = require('../services/messagingService');
const { sendReplyButtons } = require('../services/whatsappInteractiveService');
const adminService = require('../services/whatsappAdminService');
const { CONVERSATION_STATES } = require('../services/whatsappConversation');

describe('navegación global y recuperación de conversaciones', () => {
  const sender = '50400000000@s.whatsapp.net';
  const bot = { sendMessage: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    bot.sendMessage.mockResolvedValue({ ok: true });
    stateService.establecerEstado.mockResolvedValue();
    adminService.isAdminSender.mockResolvedValue(false);
    adminService.handleAdminMessage.mockResolvedValue(false);
    adminService.notifyAdminsOfGuestRequest.mockResolvedValue({ sent: 2, failed: 0 });
    sendReplyButtons.mockResolvedValue({ ok: true });
    enviarMenuPrincipal.mockResolvedValue();
    sendTelaWeather.mockResolvedValue();
  });

  test('ayuda avisa a administradores y deja una salida al menú', async () => {
    await procesarMensaje(bot, sender, 'SOPORTE', {});
    expect(adminService.notifyAdminsOfGuestRequest).toHaveBeenCalledWith(bot, {
      guestNumber: sender, requestType: 'assistance'
    });
    expect(stateService.establecerEstado).toHaveBeenCalledWith(sender, CONVERSATION_STATES.WAITING_AGENT, {});
    expect(sendReplyButtons.mock.calls[0][2].buttons[0].title).toBe('Menú principal');
  });

  test('reiniciar clima actualiza directamente el pronóstico de Tela', async () => {
    stateService.obtenerEstado.mockResolvedValue({
      estado: CONVERSATION_STATES.WEATHER_RESULT, datos: { weatherQuery: 'Tela' }
    });
    await procesarMensaje(bot, sender, 'Empezar de nuevo', {});
    expect(sendTelaWeather).toHaveBeenCalledWith(bot, sender, stateService.establecerEstado);
  });

  test('un saludo dentro del nombre no reinicia el flujo', async () => {
    stateService.obtenerEstado.mockResolvedValue({ estado: 'reservar_nombre', datos: { noches: 2 } });
    await procesarMensaje(bot, sender, 'Hola', {});
    expect(handleGreeting).not.toHaveBeenCalled();
    expect(handleReservaState).toHaveBeenCalledWith(bot, sender, 'Hola', 'reservar_nombre', { noches: 2 }, 'Hola');
  });

  test('una sesión vencida se explica sin borrar reservas', async () => {
    stateService.obtenerEstado.mockResolvedValue({ estado: CONVERSATION_STATES.MENU, datos: {}, expired: true });
    await procesarMensaje(bot, sender, '1', {});
    expect(sendReplyButtons.mock.calls[0][2].body).toMatch(/venció por inactividad/i);
    expect(sendReplyButtons.mock.calls[0][2].body).toMatch(/reservas guardadas no se eliminaron/i);
  });

  test('menú y cancelar siempre regresan al inicio', async () => {
    await procesarMensaje(bot, sender, 'MENÚ', {});
    expect(enviarMenuPrincipal).toHaveBeenCalledWith(bot, sender);

    jest.clearAllMocks();
    adminService.isAdminSender.mockResolvedValue(false);
    adminService.handleAdminMessage.mockResolvedValue(false);
    stateService.obtenerEstado.mockResolvedValue({ estado: 'reservar_nombre', datos: {} });
    await procesarMensaje(bot, sender, 'cancelar', {});
    expect(enviarMenuPrincipal).toHaveBeenCalledWith(bot, sender);
  });
});
