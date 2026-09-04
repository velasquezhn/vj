jest.mock('../services/stateService', () => ({ establecerEstado: jest.fn() }));
jest.mock('../services/reservaPriceService', () => ({ calcularPrecioTotal: jest.fn(() => 4500) }));
jest.mock('../services/comprobanteService', () => ({ guardarComprobante: jest.fn() }));
jest.mock('../utils/mediaUtils', () => ({ descargarMedia: jest.fn() }));
jest.mock('../services/reservaService', () => ({
  createReservationWithUser: jest.fn(), normalizePhoneNumber: jest.fn(), upsertUser: jest.fn()
}));
jest.mock('../services/alojamientosService', () => ({}));
jest.mock('../services/whatsappInteractiveService', () => ({ sendReplyButtons: jest.fn() }));
jest.mock('../services/messagingService', () => ({ enviarMenuPrincipal: jest.fn() }));

const { handleReservaState } = require('../controllers/flows/reservaFlowHandler');
const { ESTADOS_RESERVA } = require('../controllers/reservaConstants');
const { establecerEstado } = require('../services/stateService');
const { calcularPrecioTotal } = require('../services/reservaPriceService');
const { sendReplyButtons } = require('../services/whatsappInteractiveService');
const { enviarMenuPrincipal } = require('../services/messagingService');
const { guardarComprobante } = require('../services/comprobanteService');
const { descargarMedia } = require('../utils/mediaUtils');

describe('flujo conversacional de reserva', () => {
  const sender = '50499990000@s.whatsapp.net';
  let bot;

  beforeEach(() => {
    jest.clearAllMocks();
    bot = { sendMessage: jest.fn().mockResolvedValue({ ok: true }) };
    sendReplyButtons.mockResolvedValue({ ok: true });
    calcularPrecioTotal.mockReturnValue(4500);
    descargarMedia.mockResolvedValue({ buffer: Buffer.from('media'), mimetype: 'image/jpeg', nombreArchivo: 'pago.jpg' });
  });

  test('rechaza fechas inválidas con una sola respuesta y conserva el paso', async () => {
    await handleReservaState(bot, sender, 'texto sin fechas', ESTADOS_RESERVA.FECHAS, {}, {});
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    expect(bot.sendMessage.mock.calls[0][1].text).toContain('No pude interpretar');
    expect(establecerEstado).not.toHaveBeenCalled();
  });

  test('confirma fechas válidas mediante botones y avanza una sola vez', async () => {
    await handleReservaState(bot, sender, '15/09/2026 al 18/09/2026', ESTADOS_RESERVA.FECHAS, {}, {});
    expect(sendReplyButtons).toHaveBeenCalledTimes(1);
    expect(bot.sendMessage).not.toHaveBeenCalled();
    expect(establecerEstado).toHaveBeenCalledWith(
      sender,
      ESTADOS_RESERVA.CONFIRMAR_FECHAS,
      expect.objectContaining({ fechaEntrada: '15/09/2026', fechaSalida: '18/09/2026', noches: 3 })
    );
  });

  test('unifica asignación, precio y condiciones en el resumen de huéspedes', async () => {
    const data = {
      nombre: 'Carlos Velásquez', telefono: '50499990000',
      fechaEntrada: '15/09/2026', fechaSalida: '18/09/2026', noches: 3
    };
    await handleReservaState(bot, sender, '4', ESTADOS_RESERVA.PERSONAS, data, {});
    expect(bot.sendMessage).not.toHaveBeenCalled();
    expect(sendReplyButtons).toHaveBeenCalledTimes(1);
    expect(sendReplyButtons.mock.calls[0][2].body).toContain('DELFIN');
    expect(sendReplyButtons.mock.calls[0][2].body).toContain('HNL 4,500');
    expect(establecerEstado).toHaveBeenCalledWith(
      sender,
      ESTADOS_RESERVA.CONDICIONES,
      expect.objectContaining({ personas: 4, alojamiento: 'delfin', precioTotal: 4500 })
    );
  });

  test('no aceptar condiciones cancela el borrador y vuelve al menú', async () => {
    await handleReservaState(bot, sender, 'no', ESTADOS_RESERVA.CONDICIONES, {}, {});
    expect(enviarMenuPrincipal).toHaveBeenCalledTimes(1);
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  test('explica el vencimiento y cierra el paso de comprobante', async () => {
    guardarComprobante.mockRejectedValueOnce(Object.assign(new Error('vencido'), { code: 'PAYMENT_WINDOW_EXPIRED' }));
    await handleReservaState(bot, sender, '', ESTADOS_RESERVA.ESPERANDO_PAGO, {
      reservaId: 7, confirmationCode: 'VJ-000007'
    }, { imageMessage: { id: 'media' } });
    expect(bot.sendMessage.mock.calls[0][1].text).toContain('PLAZO DE PAGO VENCIÓ');
    expect(establecerEstado).toHaveBeenCalledWith(sender, 'MENU_PRINCIPAL', {});
  });

  test('un comprobante duplicado conserva la espera de revisión', async () => {
    guardarComprobante.mockRejectedValueOnce(Object.assign(new Error('duplicado'), { code: 'RECEIPT_ALREADY_RECEIVED' }));
    const data = { reservaId: 8, confirmationCode: 'VJ-000008' };
    await handleReservaState(bot, sender, '', ESTADOS_RESERVA.ESPERANDO_PAGO, data, { imageMessage: { id: 'media' } });
    expect(bot.sendMessage.mock.calls[0][1].text).toContain('Ya recibimos el comprobante');
    expect(establecerEstado).toHaveBeenCalledWith(sender, ESTADOS_RESERVA.ESPERANDO_CONFIRMACION, data);
  });
});
