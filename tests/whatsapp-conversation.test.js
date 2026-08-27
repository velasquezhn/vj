const {
  MAIN_MENU_ROWS,
  mainMenuFallback,
  reservationStart,
  contactMessage,
  faqMessage,
  normalizeConversationInput
} = require('../services/whatsappMessages');
const { sendMessageWithDelay, sendMultipleMessagesWithDelay } = require('../utils/messageDelayUtils');

describe('menús y navegación de WhatsApp', () => {
  test('centraliza las nueve opciones y conserva una numeración consistente', () => {
    expect(MAIN_MENU_ROWS).toHaveLength(9);
    expect(MAIN_MENU_ROWS.map((row) => row.id)).toEqual([
      'main_1', 'main_2', 'main_3', 'main_4', 'main_5',
      'main_6', 'main_7', 'main_8', 'main_9'
    ]);
    const fallback = mainMenuFallback();
    MAIN_MENU_ROWS.forEach((row, index) => expect(fallback).toContain(`${index + 1}. ${row.title}`));
  });

  test.each([
    ['Menú', 'menu'],
    ['menu principal', 'menu'],
    ['INICIO', 'menu'],
    ['salir', 'cancelar'],
    ['atrás', 'volver'],
    ['Carlos Velásquez', 'Carlos Velásquez']
  ])('normaliza %s como %s sin alterar texto libre', (input, expected) => {
    expect(normalizeConversationInput(input)).toBe(expected);
  });

  test('los textos principales son compactos, claros y no incluyen contactos inventados', () => {
    delete process.env.PUBLIC_CONTACT_NUMBERS;
    expect(reservationStart()).toContain('cancelar');
    expect(faqMessage(50)).toContain('50%');
    expect(faqMessage(50)).toContain('No realices pagos');
    expect(contactMessage()).toContain('este mismo chat');
    expect(mainMenuFallback().length).toBeLessThanOrEqual(4096);
  });

  test('la capa heredada envía inmediatamente y no programa temporizadores', async () => {
    jest.useFakeTimers();
    const bot = { sendMessage: jest.fn().mockResolvedValue({ ok: true }) };
    await sendMessageWithDelay(bot, '50499990000', { text: 'Uno' });
    await sendMultipleMessagesWithDelay(bot, '50499990000', [{ text: 'Dos' }, { text: 'Tres' }]);
    expect(bot.sendMessage).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});
