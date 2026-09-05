const { normalizeMainMenuSelection } = require('../services/whatsappMessages');

describe('normalización del menú principal', () => {
  test.each([
    ['alojamientos', '1'],
    ['CABAÑAS', '1'],
    ['reservar', '2'],
    ['experiencias', '3'],
    ['contacto', '4'],
    ['pronóstico', '5'],
    ['preguntas frecuentes', '6'],
    ['mi reserva', '7'],
    ['  6  ', '6']
  ])('acepta %s', (input, expected) => {
    expect(normalizeMainMenuSelection(input)).toBe(expected);
  });
});
