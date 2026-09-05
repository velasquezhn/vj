const { buildCabinDetails, WHATSAPP_SUMMARIES } = require('../services/whatsappCabinPresentationService');

describe('presentación de alojamientos en WhatsApp', () => {
  test('usa una descripción comercial breve para Tortuga', () => {
    const text = buildCabinDetails({
      type_key: 'tortuga', nombre: 'Cabaña Tortuga (3 Personas)', capacidad: 3,
      habitaciones: 1, baños: 1, precio_noche: 1500,
      comodidades: ['Piscina compartida', 'WiFi', 'Cocina equipada']
    });
    expect(text).toContain('cama matrimonial y cama individual');
    expect(text).not.toContain('Sera un placer atenderle');
    expect(text.length).toBeLessThan(900);
  });

  test('mantiene resumen para cada tipo cargado', () => {
    expect(Object.keys(WHATSAPP_SUMMARIES)).toEqual(expect.arrayContaining(['tortuga', 'delfin', 'tiburon']));
  });
});
