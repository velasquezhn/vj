const {
  parseMediaList, mediaType, galleryLimit, buildCabinDetails, cabinMedia
} = require('../services/whatsappCabinPresentationService');

describe('presentación de cabañas en WhatsApp', () => {
  const cabin = {
    type_key: 'delfin', nombre: 'Cabaña Delfín', capacidad: 6,
    habitaciones: 2, baños: 2, precio_noche: 4500,
    descripcion: 'Cabaña familiar cerca de la playa.',
    comodidades: ['WiFi', 'Cocina completa'],
    fotos: [
      'https://cdn.example.com/uno.jpg?version=1',
      'https://cdn.example.com/dos.png',
      'http://inseguro.example.com/tres.jpg',
      'texto-no-url'
    ]
  };

  test('acepta únicamente medios HTTPS válidos y reconoce extensiones con query string', () => {
    expect(parseMediaList(cabin.fotos)).toHaveLength(2);
    expect(mediaType(cabin.fotos[0])).toBe('image');
  });

  test('construye un resumen compacto apto para el caption de Meta', () => {
    const details = buildCabinDetails(cabin);
    expect(details).toContain('Cabaña Delfín');
    expect(details).toContain('HNL 4,500');
    expect(details.length).toBeLessThanOrEqual(1024);
  });

  test('limita la galería para no saturar la conversación', () => {
    process.env.WHATSAPP_CABIN_GALLERY_LIMIT = '1';
    expect(galleryLimit()).toBe(1);
    expect(cabinMedia(cabin).images).toHaveLength(1);
    delete process.env.WHATSAPP_CABIN_GALLERY_LIMIT;
  });
});
