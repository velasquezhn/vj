// utils.js (versión corregida)
const fs = require('fs');
const path = require('path');
const { WhatsAppCloudService } = require('../services/whatsappCloudService');
const GRUPO_JID = null;

// Función para guardar buffer en archivo (mejorada)
const guardarArchivo = async (buffer, nombreArchivo) => {
  const dir = path.join(__dirname, '../admin-frontend/public/comprobantes');
  
  // Crear directorio si no existe
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[FS] Directorio creado: ${dir}`);
  }
  
  const filePath = path.join(dir, nombreArchivo);
  await fs.promises.writeFile(filePath, buffer);
  console.log(`[FS] Archivo guardado: ${filePath}`);
  
  return `comprobantes/${nombreArchivo}`; // Ruta relativa para guardar en DB
};

// Función segura para enviar mensajes de texto
async function safeSend(bot, recipient, text) {
  try {
    await bot.sendMessage(recipient, { text });
    return true;
  } catch (error) {
    console.error(`[safeSend] Error al enviar a ${recipient}:`, error.message);
    return false;
  }
}

// Función para validar fechas con formato "DD/MM - DD/MM"
const isValidDate = (fecha) => /^\d{2}\/\d{2}\s*-\s*\d{2}\/\d{2}$/.test(fecha);

// Simulador de confirmación de reserva
const confirmarReserva = async (remitente, reserva) => {
  console.log(`[Reserva] Confirmada para ${remitente}:`, reserva);
  // Implementación real iría aquí
};

// Validador de URLs
const isValidUrl = (urlString) => {
  try {
    return Boolean(new URL(urlString));
  } catch {
    return false;
  }
};

// Simulador de disponibilidad
const validarDisponibilidad = async (fechaEntrada, fechaSalida) => {
  // Lógica real de validación iría aquí
  return !(fechaEntrada === '15/08/2025' && fechaSalida === '18/08/2025');
};

// Enviar mensaje al grupo usando safeSend
const enviarAlGrupo = async (bot, texto) => {
  console.info('[Administración] Notificación disponible en el panel/API', { preview: String(texto).slice(0, 80) });
  return false;
};

// Descargar contenido de mensaje como buffer (mejorada)
const descargarContenido = async (messageContent, tipo) => {
  try {
    if (!messageContent?.id) throw new Error('Media ID de Meta no disponible');
    const result = await new WhatsAppCloudService().downloadMedia(messageContent.id);
    return result.buffer;
  } catch (error) {
    console.error('[Descarga] Error:', error.message);
    return null;
  }
};

// NUEVA FUNCIÓN PARA DESCARGAR MEDIA
async function descargarMedia(mensaje) {
  let tipoMedia, mediaMessage, extension;

  if (mensaje.imageMessage) {
    tipoMedia = 'image';
    mediaMessage = mensaje.imageMessage;
    extension = 'jpg';
  } else if (mensaje.documentMessage) {
    tipoMedia = 'document';
    mediaMessage = mensaje.documentMessage;
    extension = mediaMessage.fileName.split('.').pop() || 'bin';
  } else {
    throw new Error('Tipo multimedia no soportado');
  }

  const stream = await downloadContentFromMessage(mediaMessage, tipoMedia);

  const buffer = await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });

  return {
    buffer,
    mimetype: mediaMessage.mimetype || (tipoMedia === 'image' ? 'image/jpeg' : 'application/octet-stream'),
    nombreArchivo: `comprobante-${Date.now()}.${extension}`
  };
}

const reenviarComprobanteAlGrupo = async (bot, mensaje, datos, reservaInfo = null) => {
  try {
    const nombre = datos?.nombre || 'Cliente desconocido';
    const caption = `✅ Comprobante de ${nombre}`;
    
    // Acceder a la estructura correcta del mensaje
    const msgContent = mensaje.message || mensaje;
    
    let mediaData;
    if (msgContent.imageMessage) {
      console.log('[DEBUG] Descargando imagen...');
      mediaData = await descargarMedia(msgContent);
    } 
    else if (msgContent.documentMessage) {
      console.log('[DEBUG] Descargando documento...');
      mediaData = await descargarMedia(msgContent);
    } 
    else {
      throw new Error('Tipo multimedia no soportado');
    }

    // Validar buffer
    if (!mediaData.buffer || mediaData.buffer.length === 0) {
      throw new Error('Buffer de media vacío');
    }

    // Guardar archivo
    console.log('[DEBUG] Guardando archivo...');
    const rutaRelativa = await guardarArchivo(mediaData.buffer, mediaData.nombreArchivo);
    console.log('[DEBUG] Ruta guardada:', rutaRelativa);

    // Preparar datos para enviar
    const mediaType = msgContent.imageMessage ? 'image' : 'document';
    const sendOptions = {
      [mediaType]: mediaData.buffer,
      caption: caption,
      mimetype: mediaData.mimetype
    };

    // Agregar nombre de archivo solo para documentos
    if (mediaType === 'document') {
      sendOptions.fileName = mediaData.nombreArchivo;
    }

    console.info(`[Administración] Comprobante almacenado: ${mediaData.nombreArchivo}`);

    // Enviar info de reserva si se proporciona
    if (reservaInfo) {
      console.log('[DEBUG] Enviando información de reserva al grupo...');
      console.info('[Administración] Reserva disponible en el panel/API', { preview: reservaInfo.slice(0, 80) });
    }

    // ⚠️ COMANDO /reservado SE MANEJA AHORA EN messageProcessor.js
    // No enviar comando desde aquí para evitar duplicados

    return rutaRelativa;
  } catch (error) {
    console.error(`[Comprobante] Error: ${error.message}`);
    return null;
  }
};

module.exports = {
  GRUPO_JID,
  safeSend,
  isValidDate,
  confirmarReserva,
  isValidUrl,
  validarDisponibilidad,
  enviarAlGrupo,
  descargarContenido,
  reenviarComprobanteAlGrupo,
  guardarArchivo,
  descargarMedia // Exportada para uso externo
};
