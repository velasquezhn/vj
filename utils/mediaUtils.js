const { WhatsAppCloudService } = require('../services/whatsappCloudService');

async function descargarMedia(mensaje) {
  let tipoMedia, mediaMessage, extension;

  if (mensaje.imageMessage) {
    tipoMedia = 'image';
    mediaMessage = mensaje.imageMessage;
    extension = 'jpg';
  } else if (mensaje.documentMessage) {
    tipoMedia = 'document';
    mediaMessage = mensaje.documentMessage;
    const originalName = mediaMessage.filename || mediaMessage.fileName || 'comprobante.pdf';
    extension = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
  } else {
    throw new Error('Tipo multimedia no soportado');
  }

  if (!mediaMessage.id) throw new Error('El mensaje multimedia no contiene un media ID de Meta');
  const { buffer, mimetype } = await new WhatsAppCloudService().downloadMedia(mediaMessage.id);

  return {
    buffer,
    mimetype: mimetype || mediaMessage.mime_type || (tipoMedia === 'image' ? 'image/jpeg' : 'application/octet-stream'),
    nombreArchivo: `comprobante-${Date.now()}.${extension}`
  };
}

module.exports = { descargarMedia };
