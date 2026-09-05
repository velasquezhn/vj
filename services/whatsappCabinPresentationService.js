const { isValidUrl } = require('../utils/utils');

function parseMediaList(value) {
  let items = value;
  if (!Array.isArray(items)) {
    try { items = value ? JSON.parse(value) : []; } catch { items = []; }
  }
  return items
    .map((item) => typeof item === 'string' ? item.trim() : item?.url)
    .filter((url) => isValidUrl(url) && url.startsWith('https://'));
}

function mediaType(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (/\.(jpe?g|png|webp)$/.test(path)) return 'image';
    if (/\.(mp4|mov)$/.test(path)) return 'video';
  } catch {}
  return null;
}

function galleryLimit() {
  const configured = Number(process.env.WHATSAPP_CABIN_GALLERY_LIMIT || 4);
  return Number.isInteger(configured) ? Math.min(Math.max(configured, 1), 5) : 4;
}

// Textos comerciales breves para WhatsApp. La descripción larga se conserva
// para el panel, pero no se envía completa al chat porque dificulta la lectura.
const WHATSAPP_SUMMARIES = Object.freeze({
  tortuga: 'A media cuadra de la playa de Tela. Apartamento de 1 cuarto con cama matrimonial y cama individual, aire acondicionado y baño privado. Cocineta con refrigeradora, estufa de 2 hornillas, microondas y utensilios. Piscina y área social compartidas hasta las 9:00 p. m.',
  delfin: 'Alojamiento familiar a media cuadra de la playa de Tela. Dos habitaciones climatizadas, dos baños, cocina completa, sala con TV y Wi‑Fi. Piscina y área social compartidas hasta las 9:00 p. m.',
  tiburon: 'Alojamiento amplio a media cuadra de la playa de Tela. Tres habitaciones climatizadas, dos baños, cocina completa y sala con TV. Ideal para grupos de hasta 9 personas. Piscina y área social compartidas hasta las 9:00 p. m.'
});

function buildCabinDetails(cabin) {
  const amenities = Array.isArray(cabin.comodidades) ? cabin.comodidades : [];
  const price = Number(cabin.precio_noche || 0).toLocaleString('es-HN');
  const summary = WHATSAPP_SUMMARIES[cabin.type_key] || String(cabin.descripcion || 'Alojamiento cómodo cerca de la playa.')
    .replace(/\s+/g, ' ').trim().slice(0, 240);
  return `🏖️ *${cabin.nombre || 'Alojamiento Villas Julie'}*\n\n` +
    `👥 Hasta ${cabin.capacidad || '-'} personas\n` +
    `🛏️ ${cabin.habitaciones || '-'} habitación(es) · 🚿 ${cabin.baños || '-'} baño(s)\n` +
    `💰 HNL ${price} por noche\n` +
    (amenities.length ? `✨ ${amenities.slice(0, 5).join(' · ')}\n` : '') +
    `🕑 Entrada 2:00 p. m. · Salida 11:00 a. m.\n\n` +
    `📍 ${summary}\n\n` +
    `¿Qué deseas hacer? Elige una opción abajo o escribe *menú* para volver al inicio.`;
}

function cabinMedia(cabin) {
  const media = parseMediaList(cabin.fotos);
  return {
    images: media.filter((url) => mediaType(url) === 'image').slice(0, galleryLimit()),
    videos: media.filter((url) => mediaType(url) === 'video').slice(0, 1)
  };
}

module.exports = { parseMediaList, mediaType, galleryLimit, buildCabinDetails, cabinMedia, WHATSAPP_SUMMARIES };
