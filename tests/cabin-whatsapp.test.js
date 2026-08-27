const {
  parseMediaList, mediaType, galleryLimit, buildCabinDetails, cabinMedia
} = require('../services/whatsappCabinPresentationService');
const sharp = require('sharp');
const { composeGallery, isPrivateIp } = require('../services/whatsappCabinGalleryService');
const { paymentAmounts, normalizeAccounts } = require('../services/paymentSettingsService');

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

  test('compone varias fotos en una sola imagen para WhatsApp', async () => {
    const red = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } }).png().toBuffer();
    const blue = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'blue' } }).png().toBuffer();
    const collage = await composeGallery([red, blue]);
    const metadata = await sharp(collage).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBeGreaterThan(1000);
  });

  test('bloquea redes privadas y calcula el anticipo del 50 por ciento', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.5')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(paymentAmounts(3000, 50)).toEqual({ total: 3000, deposit: 1500, balance: 1500 });
    expect(normalizeAccounts([' BAC - 123 ', 'BAC - 123'])).toEqual(['BAC - 123']);
  });
});
