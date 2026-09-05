const {
  MAIN_MENU_ROWS,
  mainMenuFallback,
  reservationStart,
  contactMessage,
  faqMessage,
  normalizeConversationInput
} = require('../services/whatsappMessages');

describe('menús y navegación de WhatsApp', () => {
  test('centraliza las siete opciones vigentes y conserva una numeración consistente', () => {
    expect(MAIN_MENU_ROWS).toHaveLength(7);
    expect(MAIN_MENU_ROWS.map((row) => row.id)).toEqual([
      'main_1', 'main_2', 'main_3', 'main_4', 'main_5',
      'main_6', 'main_7'
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
    ['Empezar de nuevo', 'reiniciar'],
    ['SOPORTE', 'ayuda'],
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

});
