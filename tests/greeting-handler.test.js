jest.mock('../services/stateService', () => ({
  obtenerUltimoSaludo: jest.fn(),
  establecerUltimoSaludo: jest.fn()
}));
jest.mock('../services/messagingService', () => ({ enviarMenuPrincipal: jest.fn() }));

const { handleGreeting } = require('../controllers/flows/greetingHandler');
const { obtenerUltimoSaludo } = require('../services/stateService');
const { enviarMenuPrincipal } = require('../services/messagingService');

describe('saludo inicial de WhatsApp', () => {
  beforeEach(() => {
    obtenerUltimoSaludo.mockReturnValue(null);
    enviarMenuPrincipal.mockResolvedValue(undefined);
  });

  test('no intercepta una opción de menú después de reiniciar el servidor', async () => {
    await expect(handleGreeting({}, '50499990000@s.whatsapp.net', '2')).resolves.toBe(false);
    expect(enviarMenuPrincipal).not.toHaveBeenCalled();
  });

  test.each(['hola', 'Buenas tardes', 'MENÚ'])('responde una sola vez al saludo o comando %s', async (input) => {
    await expect(handleGreeting({}, '50499990000@s.whatsapp.net', input)).resolves.toBe(true);
    expect(enviarMenuPrincipal).toHaveBeenCalledTimes(1);
  });
});
