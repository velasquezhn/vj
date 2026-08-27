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

function buildCabinDetails(cabin) {
  const amenities = Array.isArray(cabin.comodidades) ? cabin.comodidades : [];
  const price = Number(cabin.precio_noche || 0).toLocaleString('es-HN');
  const description = String(cabin.descripcion || 'Alojamiento cómodo cerca de la playa.').trim();
  const compactDescription = description.length > 360 ? `${description.slice(0, 357).trim()}…` : description;
  return `🏖️ *${cabin.nombre || 'Alojamiento Villas Julie'}*\n\n` +
    `👥 Hasta ${cabin.capacidad || '-'} personas\n` +
    `🛏️ ${cabin.habitaciones || '-'} habitación(es) · 🚿 ${cabin.baños || '-'} baño(s)\n` +
    `💰 HNL ${price} por noche\n` +
    (amenities.length ? `✨ ${amenities.slice(0, 5).join(' · ')}\n` : '') +
    `🕑 Entrada 2:00 p. m. · Salida 11:00 a. m.\n\n${compactDescription}`;
}

function cabinMedia(cabin) {
  const media = parseMediaList(cabin.fotos);
  return {
    images: media.filter((url) => mediaType(url) === 'image').slice(0, galleryLimit()),
    videos: media.filter((url) => mediaType(url) === 'video').slice(0, 1)
  };
}

module.exports = { parseMediaList, mediaType, galleryLimit, buildCabinDetails, cabinMedia };
