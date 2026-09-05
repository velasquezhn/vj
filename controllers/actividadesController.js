const { loadActividades } = require('../services/menuActivitiesService');
const { safeSend } = require('../utils/utils'); // Asumiendo que safeSend está en utils

// Función para generar detalles textuales de una actividad
const generateActivityDetails = (actividad) => {
  let detalles = `🌴 *${actividad.nombre}*\n`;
  
  if (actividad.categoria) {
    detalles += `🏷️ Categoría: ${actividad.categoria}\n`;
  }
  
  if (actividad.ubicacion && actividad.ubicacion.direccion) {
    detalles += `📍 Ubicación: ${actividad.ubicacion.direccion}\n`;
  }
  
  if (actividad.duracion) {
    detalles += `⏰ Duración: ${actividad.duracion}\n`;
  }
  
  if (actividad.precios) {
    if (actividad.precios.adulto) {
      detalles += `💰 Precio adulto: L. ${actividad.precios.adulto}\n`;
    }
    if (actividad.precios.nino) {
      detalles += `💰 Precio niño: L. ${actividad.precios.nino}\n`;
    }
  }
  
  if (actividad.horarios && actividad.horarios.general) {
    detalles += `📅 Horarios: ${actividad.horarios.general}\n`;
  }
  
  const descripcion = actividad.descripcionCorta || actividad.descripcion_corta || actividad.descripcion;
  if (descripcion) {
    detalles += `📝 Descripción: ${descripcion}\n\n`;
  }
  
  if (actividad.servicios && Array.isArray(actividad.servicios) && actividad.servicios.length > 0) {
    detalles += `✨ Servicios incluidos:\n`;
    detalles += actividad.servicios.map(servicio => `• ${servicio}`).join('\n') + '\n\n';
  }
  
  if (actividad.recomendaciones && actividad.recomendaciones.queTraer && Array.isArray(actividad.recomendaciones.queTraer) && actividad.recomendaciones.queTraer.length > 0) {
    detalles += `🎒 Qué traer:\n`;
    detalles += actividad.recomendaciones.queTraer.map(item => `• ${item}`).join('\n') + '\n\n';
  }
  
  if (actividad.contacto) {
    detalles += `📞 Contacto:\n`;
    if (actividad.contacto.telefono) {
      detalles += `• Teléfono: ${actividad.contacto.telefono}\n`;
    }
    if (actividad.contacto.whatsapp) {
      detalles += `• WhatsApp: ${actividad.contacto.whatsapp}\n`;
    }
    if (actividad.contacto.email) {
      detalles += `• Email: ${actividad.contacto.email}\n`;
    }
    if (actividad.contacto.sitioWeb) {
      detalles += `• Sitio Web: ${actividad.contacto.sitioWeb}\n`;
    }
    
    if (actividad.contacto.redesSociales && typeof actividad.contacto.redesSociales === 'object') {
      const redes = Object.keys(actividad.contacto.redesSociales);
      if (redes.length > 0) {
        detalles += `• Redes Sociales:\n`;
        detalles += Object.entries(actividad.contacto.redesSociales)
          .map(([key, value]) => `  - ${key}: ${value}`)
          .join('\n') + '\n';
      }
    }
  }
  
  return detalles;
};

// Enviar detalles de actividad específica
const sendActividadDetails = async (bot, remitente, seleccion, establecerEstado = null) => {
  try {
    const actividades = await loadActividades();
    
    if (!actividades || actividades.length === 0) {
      const { enviarMenuPrincipal } = require('../services/messagingService');
      await enviarMenuPrincipal(bot, remitente);
      return;
    }
    
    if (isNaN(seleccion)) {
      await safeSend(bot, remitente, '⚠️ Por favor ingresa solo el número de la actividad.');
      return;
    }
    
    if (seleccion < 1 || seleccion > actividades.length) {
      await safeSend(bot, remitente, `⚠️ Selección inválida. Ingresa un número entre 1 y ${actividades.length}.`);
      return;
    }
    
    const actividad = actividades[seleccion - 1];
    const detalles = generateActivityDetails(actividad);
    
    const images = [
      actividad.multimedia?.fotoPrincipal,
      ...(Array.isArray(actividad.multimedia?.galeria) ? actividad.multimedia.galeria : [])
    ].filter((url) => typeof url === 'string' && url.startsWith('https://'));
    let galleryUrl = images[0];
    if (images.length > 1) {
      try {
        const { buildCabinGalleryUrl } = require('../services/whatsappCabinGalleryService');
        galleryUrl = await buildCabinGalleryUrl({ type_key: `actividad-${actividad.id || seleccion}` }, images.slice(0, 4));
      } catch (error) {
        console.warn('No se pudo crear la galería unificada de la actividad:', error.message);
      }
    }

    // Meta no admite álbum y botones en un único mensaje. Se compone una sola
    // imagen con hasta cuatro fotos y se usa como encabezado interactivo.
    const { sendReplyButtons } = require('../services/whatsappInteractiveService');
    await sendReplyButtons(bot, remitente, {
      ...(galleryUrl ? { headerImage: { url: galleryUrl } } : {}),
      body: `${detalles}\n\n¿Qué deseas hacer ahora?`,
      buttons: [
        { id: 'activities_more', title: 'Más experiencias' },
        { id: 'main_menu', title: 'Menú principal' }
      ],
      fallbackText: `${detalles}\n\n1. Ver más experiencias\n0. Menú principal`
    });
    
    // Establecer estado post-actividad si se proporciona la función
    if (establecerEstado && typeof establecerEstado === 'function') {
      await establecerEstado(remitente, 'post_actividad');
    }
    
  } catch (error) {
    const logger = require('../config/logger');
    logger.error('Error mostrando actividad por WhatsApp', { error: error.message });
    const { enviarMenuActividades } = require('../services/messagingService');
    await enviarMenuActividades(bot, remitente, 'No pudimos mostrar esa experiencia. Selecciona otra o vuelve al menú.');
  }
};

module.exports = { 
  sendActividadDetails 
};
