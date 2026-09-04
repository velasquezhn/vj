const { parseDateRange } = require('../utils/dateRangeParser');

const referenceDate = new Date('2026-09-04T18:00:00Z');
const parse = (text) => parseDateRange(text, { referenceDate, timeZone: 'America/Tegucigalpa' });

describe('WhatsApp reservation date parser', () => {
  test.each([
    ['15/09/2026 al 18/09/2026', '15/09/2026', '18/09/2026', 3],
    ['entrada 15-09-2026 salida 18-09-2026', '15/09/2026', '18/09/2026', 3],
    ['15.09.2026 hasta 18.09.2026', '15/09/2026', '18/09/2026', 3],
    ['2026-09-15 al 2026-09-18', '15/09/2026', '18/09/2026', 3],
    ['del 15 al 18 de septiembre de 2026', '15/09/2026', '18/09/2026', 3],
    ['15 de septiembre por 3 noches', '15/09/2026', '18/09/2026', 3],
    ['mañana por 2 noches', '05/09/2026', '07/09/2026', 2],
    ['15/09 al 18/09', '15/09/2026', '18/09/2026', 3],
    ['15 al 18/09/2026', '15/09/2026', '18/09/2026', 3],
    ['30/12 al 02/01', '30/12/2026', '02/01/2027', 3]
  ])('interpreta %s', (input, entrada, salida, noches) => {
    expect(parse(input)).toMatchObject({ entrada, salida, noches, error: null });
  });

  test('interpreta los números como día/mes, no mes/día', () => {
    expect(parse('09/10/2026 al 12/10/2026')).toMatchObject({ entrada: '09/10/2026', salida: '12/10/2026' });
  });

  test.each([
    ['15/09/2026', 'Necesito dos fechas'],
    ['31/02/2027 al 02/03/2027', 'no existe'],
    ['01/09/2026 al 03/09/2026', 'ya pasó'],
    ['18/09/2026 al 15/09/2026', 'después de la entrada'],
    ['15/09/2026 al 15/09/2026', 'al menos una noche']
  ])('rechaza %s', (input, error) => {
    expect(parse(input).error).toContain(error);
  });
});
