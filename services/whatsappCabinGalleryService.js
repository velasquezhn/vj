const crypto = require('crypto');
const dns = require('dns').promises;
const fs = require('fs');
const net = require('net');
const path = require('path');
const sharp = require('sharp');
const logger = require('../config/logger');

const OUTPUT_DIR = path.join(__dirname, '../public/cabin-galleries');
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || a >= 224;
  }
  const normalized = String(address).toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb');
}

async function assertPublicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Solo se permiten imágenes HTTPS');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error('La imagen no apunta a un servidor público');
  }
  return url;
}

async function downloadImage(value, redirects = 0) {
  const url = await assertPublicUrl(value);
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
  if (response.status >= 300 && response.status < 400 && response.headers.get('location') && redirects < 3) {
    return downloadImage(new URL(response.headers.get('location'), url).toString(), redirects + 1);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_SOURCE_BYTES) throw new Error('Imagen demasiado grande');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_SOURCE_BYTES) throw new Error('Tamaño de imagen inválido');
  return buffer;
}

async function composeGallery(buffers) {
  const tileWidth = 600;
  const tileHeight = 450;
  const gap = 12;
  const columns = 2;
  const rows = Math.ceil(buffers.length / columns);
  const width = columns * tileWidth + (columns + 1) * gap;
  const height = rows * tileHeight + (rows + 1) * gap;
  const tiles = await Promise.all(buffers.map((buffer) => sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate().resize(tileWidth, tileHeight, { fit: 'cover' }).jpeg({ quality: 84 }).toBuffer()));
  return sharp({ create: { width, height, channels: 3, background: '#f5f1e8' } })
    .composite(tiles.map((input, index) => ({
      input,
      left: gap + (index % columns) * (tileWidth + gap),
      top: gap + Math.floor(index / columns) * (tileHeight + gap)
    })))
    .jpeg({ quality: 86, progressive: true })
    .toBuffer();
}

async function buildCabinGalleryUrl(cabin, imageUrls) {
  if (!imageUrls.length) return null;
  if (imageUrls.length === 1) return imageUrls[0];
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!baseUrl) return imageUrls[0];
  const hash = crypto.createHash('sha256').update(JSON.stringify(imageUrls)).digest('hex').slice(0, 20);
  const filename = `${String(cabin.type_key || cabin.nombre || 'cabana').replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}-${hash}.jpg`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const downloaded = [];
    for (const imageUrl of imageUrls) {
      try { downloaded.push({ url: imageUrl, buffer: await downloadImage(imageUrl) }); }
      catch (error) { logger.warn('No se pudo incluir una foto en la galería unificada', { code: error.message }); }
    }
    if (downloaded.length < 2) return downloaded[0]?.url || imageUrls[0];
    await fs.promises.writeFile(outputPath, await composeGallery(downloaded.map((item) => item.buffer)));
  }
  return `${baseUrl}/cabin-galleries/${filename}`;
}

module.exports = { buildCabinGalleryUrl, composeGallery, isPrivateIp };
