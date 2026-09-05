jest.mock('../services/messagingService', () => ({
  enviarMenuPrincipal: jest.fn().mockResolvedValue(),
  enviarMenuCabanas: jest.fn().mockResolvedValue(),
  enviarMenuActividades: jest.fn().mockResolvedValue()
}));
jest.mock('../services/whatsappInteractiveService', () => ({
  sendReplyButtons: jest.fn().mockResolvedValue(),
  sendList: jest.fn().mockResolvedValue()
}));
jest.mock('../services/paymentSettingsService', () => ({
  getPaymentSettings: jest.fn().mockResolvedValue({ deposit_percentage: 50 })
}));
jest.mock('../controllers/flows/weatherHandler', () => ({ showWeatherPrompt: jest.fn().mockResolvedValue() }));
jest.mock('../db', () => ({ runQuery: jest.fn().mockResolvedValue([]) }));

const { handleMainMenuOptions } = require('../controllers/mainMenuHandler');
const messaging = require('../services/messagingService');
const interactive = require('../services/whatsappInteractiveService');
const { getPaymentSettings } = require('../services/paymentSettingsService');
const { showWeatherPrompt } = require('../controllers/flows/weatherHandler');
const { CONVERSATION_STATES } = require('../services/whatsappConversation');

describe('opciones del menú principal de WhatsApp', () => {
  const recipient = '50400000000@s.whatsapp.net';
  let bot;
  let setState;

  beforeEach(() => {
    jest.clearAllMocks();
    bot = { sendMessage: jest.fn().mockResolvedValue() };
    setState = jest.fn().mockResolvedValue();
    getPaymentSettings.mockResolvedValue({ deposit_percentage: 50 });
  });

  test.each([
    ['1', 'lodging'], ['2', 'reservation'], ['3', 'activities'],
    ['4', 'contact'], ['5', 'weather'], ['6', 'faq'], ['7', 'my-reservation']
  ])('la opción %s ejecuta el flujo %s', async (option, flow) => {
    await handleMainMenuOptions(bot, recipient, option, setState);
    if (flow === 'lodging') expect(messaging.enviarMenuCabanas).toHaveBeenCalledWith(bot, recipient);
    if (flow === 'reservation') {
      expect(bot.sendMessage).toHaveBeenCalledTimes(1);
      expect(setState).toHaveBeenCalledWith(recipient, 'reservar_fechas');
    }
    if (flow === 'activities') expect(messaging.enviarMenuActividades).toHaveBeenCalledWith(bot, recipient);
    if (flow === 'contact' || flow === 'faq') expect(interactive.sendReplyButtons).toHaveBeenCalledTimes(1);
    if (flow === 'contact') expect(setState).toHaveBeenCalledWith(recipient, CONVERSATION_STATES.CONTACT_MESSAGE, {});
    if (flow === 'weather') expect(showWeatherPrompt).toHaveBeenCalledWith(bot, recipient, setState);
    if (flow === 'my-reservation') {
      expect(interactive.sendReplyButtons).toHaveBeenCalledTimes(1);
      expect(setState).toHaveBeenCalledWith(recipient, CONVERSATION_STATES.POST_RESERVATION_EMPTY);
    }
  });

  test.each(['', '8', '9', 'texto desconocido'])('una opción inválida (%s) vuelve a mostrar las siete válidas', async (option) => {
    await handleMainMenuOptions(bot, recipient, option, setState);
    expect(messaging.enviarMenuPrincipal).toHaveBeenCalledWith(
      bot, recipient, expect.stringMatching(/1 al 7/)
    );
  });
});
