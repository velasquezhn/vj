const cabinsDataService = require('../services/cabinsDataService');
const menuActivitiesService = require('../services/menuActivitiesService');
const WeatherModule = require('../services/weatherService');
const { sendShareExperienceInstructions } = require('../routes/shareExperience');
// const { manejarPostReserva } = require('../routes/postReservaHandler'); // TEMPORALMENTE COMENTADO
const { extraerTelefono } = require('../utils/telefonoUtils');
const { sendMessageWithDelay } = require('../utils/messageDelayUtils');
const { enviarMenuActividades } = require('../services/messagingService');

const weatherModule = new WeatherModule(process.env.OPENWEATHER_API_KEY);

// Estados constantes
const STATES = {
  LODGING: 'LISTA_CABAÑAS',  // Cambiado de 'alojamientos' a 'LISTA_CABAÑAS' para consistencia
  DATES: 'reservar_fechas',
  ACTIVITIES: 'actividades',
  POST_ACTIVITY: 'post_actividad',
  SHARE_EXPERIENCE: 'compartir_experiencia',
  POST_RESERVA: 'post_reserva'
};

// Helper para enviar mensajes con manejo de errores y delay aleatorio
async function safeSend(bot, recipient, text) {
  try {
    await sendMessageWithDelay(bot, recipient, { text });
    return true;
  } catch (error) {
    console.error(`Error al enviar mensaje a ${recipient}:`, error);
    return false;
  }
}

// Helper para generar menús dinámicos
async function generateDynamicMenu(itemType) {
  try {
    let items = [];
    
    if (itemType === 'cabañas') {
      items = await cabinsDataService.getAllCabins();
    } else if (itemType === 'actividades') {
      // Usar el servicio de base de datos para obtener actividades
      items = await menuActivitiesService.loadActividades();
    }
    
    if (items.length === 0) {
      return `⚠️ No hay ${itemType} disponibles en este momento.`;
    }

    let title = '';
    if (itemType === 'cabañas') {
      title = `🏠 *Nuestros alojamientos disponibles:*\n\n`;
    } else if (itemType === 'actividades') {
      title = `🎯 *Actividades y experiencias disponibles:*\n\n`;
    }
    
    const list = items.map((item, index) => {
      const name = item.name || item.nombre || `${itemType.slice(0, -1)} ${index + 1}`;
      
      if (itemType === 'cabañas') {
        const capacity = item.capacity ? ` (${item.capacity} personas)` : '';
        const price = item.basePrice && item.basePrice > 0 ? ` - $${item.basePrice}` : '';
        return `${index + 1}. ${name}${capacity}${price}`;
      } else if (itemType === 'actividades') {
        const category = item.categoria ? ` - ${item.categoria}` : '';
        const duration = item.duracion ? ` (${item.duracion})` : '';
        return `${index + 1}. ${name}${category}${duration}`;
      }
      
      return `${index + 1}. ${name}`;
    }).join('\n');
    
    const instructions = '\n\n🔍 *Selecciona el número para ver detalles completos y fotos.*\n0️⃣ *Menú principal*';
    
    return title + list + instructions;
  } catch (error) {
    console.error('Error generando menú dinámico:', error);
    return `⚠️ Error al cargar ${itemType}. Por favor intenta de nuevo.`;
  }
}

// Contenido de FAQs
const FAQ_CONTENT = `🏝️ *Preguntas Frecuentes – Villas frente al mar*\n\n` +
  `1. 🏡 ¿Qué tipos de alojamientos ofrecen?\n` +
  `Ofrecemos cabañas y apartamentos equipados, con vista al mar y acceso directo a la playa.\n\n` +
  `2. 🕒 ¿A qué hora es el check-in y check-out?\n` +
  `Check-in: 2:00 PM | Check-out: 11:00 AM\n\n` +
  `3. 💵 ¿Cuáles son las tarifas?\n` +
  `Varían según temporada y tipo de alojamiento. Contáctanos para cotización.\n\n` +
  `4. 👨‍👩‍👧 ¿Se permiten niños y mascotas?\n` +
  `Niños: ¡Sí! | Mascotas: Consulta condiciones.\n\n` +
  `5. 🍳 ¿Las cabañas tienen cocina?\n` +
  `Sí, todas incluyen cocina equipada.\n\n` +
  `6. 🏖️ ¿Qué servicios están incluidos?\n` +
  `Aire acondicionado, Wi-Fi, Parqueo, Acceso a playa\n\n` +
  `7. 📍 ¿Dónde están ubicados?\n` +
  `Tela, Atlántida, frente al mar.\n\n` +
  `8. 📅 ¿Cómo reservar?\n` +
  `Escríbenos con tus fechas y número de personas.\n\n` +
  `9. 💳 ¿Formas de pago?\n` +
  `Efectivo, Transferencias, Tarjetas\n\n` +
  `10. 🔒 ¿Depósito para reservar?\n` +
  `Sí, 50% de adelanto.\n\n` +
  `Escribe "menu" para volver al menú principal.`;

async function handleMainMenuOptions(bot, remitente, mensaje, establecerEstado) {
  switch (mensaje) {
    case '1': // Alojamientos
      const menuCabanas = await generateDynamicMenu('cabañas');
      await safeSend(bot, remitente, menuCabanas);
      await establecerEstado(remitente, STATES.LODGING);
      break;

    case '2': // Reservar
      await safeSend(bot, remitente, 
        '✨ *¡Reserva tu experiencia perfecta!* ✨\n🗓️ Solo compártenos tus fechas favoritas\n💫 Ejemplo: 20/08/2025 - 25/08/2025 o del 20 al 25 de agosto'
      );
      await establecerEstado(remitente, STATES.DATES);
      break;

    case '3': // Actividades
      await enviarMenuActividades(bot, remitente);
      break;

    case '4': // Contacto
      await safeSend(bot, remitente, 
        `📞 *Atención 24/7:*\n` +
        `WhatsApp: http://wa.me/50499222188\n` +
        `Llamadas: 50499222188\n\n` +
        `📞 *Atención 24/7:*\n` +
        `WhatsApp: http://wa.me/50499905880\n` +
        `Llamadas: 50499905880\n\n` +
        `Escribe "menu" para volver al menú principal.`
      );
      break;

    case '5': // Clima
      try {
        const climaResponse = await weatherModule.getWeatherForecast();
        await safeSend(bot, remitente, climaResponse.message);
      } catch (error) {
        console.error('Error obteniendo clima:', error);
        await safeSend(bot, remitente, '⚠️ Error obteniendo pronóstico. Intenta más tarde.');
      }
      break;

    case '6': // Preguntas Frecuentes
      await safeSend(bot, remitente, FAQ_CONTENT);
      await safeSend(bot, remitente, 'Escribe *menu* o *1* para volver al menú principal');
      break;

    case '7': // Compartir experiencia
      try {
        await sendShareExperienceInstructions(bot, remitente, establecerEstado);
      } catch (error) {
        console.error('Error al enviar instrucciones:', error);
        await safeSend(bot, remitente, '⚠️ Error al procesar tu solicitud');
      }
      break;

    case '8': // Soporte post-reserva
      try {
        await manejarPostReserva(bot, remitente, mensaje, establecerEstado);
      } catch (error) {
        console.error('Error en soporte post-reserva:', error);
        await safeSend(bot, remitente, '⚠️ Error en soporte post-reserva');
      }
      break;

    case '9': // Programa fidelidad
      await safeSend(bot, remitente, '💎 *Programa Fidelidad*:\nAcumula puntos y obtén descuentos exclusivos.');
      break;

    default: // Opción inválida
      await safeSend(bot, remitente, '❌ Opción inválida. Usa el menú numérico.');
      break;
  }
}

// FUNCIÓN TEMPORAL PARA OPCIÓN 8 (POST RESERVA)
async function manejarPostReserva(bot, remitente, mensaje, establecerEstado) {
  console.log('### FUNCIÓN manejarPostReserva LLAMADA ###');
  console.log('### PARÁMETROS:', { remitente, mensaje });
  
  try {
    const telefono = extraerTelefono(remitente);
    console.log('### TELÉFONO EXTRAÍDO:', telefono);
    
    const reserva = await buscarReservaActivaOPendiente(telefono);
    console.log('### RESERVA ENCONTRADA:', reserva);
    
    if (!reserva) {
      await sendMessageWithDelay(bot, remitente, {
        text: '⚠️ No encontramos reservas activas o pendientes asociadas a este número.\n\n' +
              '🔹 Solo pueden acceder usuarios con:\n' +
              '   • Reservas activas (confirmadas)\n' +
              '   • Solicitudes pendientes de autorización o pago\n\n' +
              '1. Hablar con un agente\n' +
              '2. Volver al menú principal\n\n' +
              'Por favor, responde con 1 o 2.\n\nEscribe "menu" para ir al menú principal.'
      });
      await establecerEstado(remitente, 'post_reserva_no_reserva');
      return;
    }

    if (mensaje === '8') {
      let menuTexto = '🎯 *AYUDA POST RESERVA*\n\n';
      
      if (reserva.status === 'pendiente_autorizacion') {
        menuTexto += '📋 Estado: *Esperando autorización de pago*\n';
        menuTexto += `📅 Reserva ID: ${reserva.reservation_id}\n`;
        menuTexto += `👤 Huésped: ${reserva.guest_name}\n\n`;
        menuTexto += '1. ⏳ Consultar estado\n';
      } else if (reserva.status === 'esperando_pago') {
        menuTexto += '📋 Estado: *Pago autorizado; comprobante pendiente*\n';
        menuTexto += `📅 Reserva ID: ${reserva.reservation_id}\n`;
        menuTexto += `👤 Huésped: ${reserva.guest_name}\n\n`;
        menuTexto += '1. 📎 Enviar Comprobante\n';
      } else if (reserva.status === 'pendiente_verificacion') {
        menuTexto += '📋 Estado: *Comprobante recibido; revisión final pendiente*\n';
        menuTexto += `📅 Reserva ID: ${reserva.reservation_id}\n`;
        menuTexto += `👤 Huésped: ${reserva.guest_name}\n\n`;
        menuTexto += '1. ⏳ Consultar estado\n';
      } else {
        menuTexto += '📋 Estado: *Reserva confirmada*\n';
        menuTexto += `📅 Reserva ID: ${reserva.reservation_id}\n`;
        menuTexto += `👤 Huésped: ${reserva.guest_name}\n\n`;
        menuTexto += '1. 🔐 Información de acceso\n';
      }
      
      menuTexto += '2. ✏️ Modificar reserva\n';
      menuTexto += '3. ❌ Cancelar reserva\n';
      menuTexto += '4. 🆘 Solicitar asistencia\n\n';
      menuTexto += 'Responde con el número de tu opción.\n\nEscribe "menu" para ir al menú principal.';
      
      console.log('### ENVIANDO MENÚ ###');
      await sendMessageWithDelay(bot, remitente, { text: menuTexto });
      await establecerEstado(remitente, 'post_reserva_menu', { reserva });
      console.log('### MENÚ ENVIADO Y ESTADO ESTABLECIDO ###');
      return;
    }
    
  } catch (error) {
    console.error('Error en manejarPostReserva:', error);
    await sendMessageWithDelay(bot, remitente, {
      text: 'Lo siento, ocurrió un error. Por favor intenta de nuevo más tarde.\n\nEscribe "menu" para ir al menú principal.'
    });
  }
}

// Función auxiliar para buscar reservas
async function buscarReservaActivaOPendiente(telefono) {
  console.log('### EJECUTANDO buscarReservaActivaOPendiente ###');
  console.log('### TELEFONO:', telefono);
  
  try {
    const { runQuery } = require('../db');
    
    const sql = `
      SELECT r.*, u.name as guest_name, u.phone_number,
             r.start_date as check_in_date, r.end_date as check_out_date
      FROM Reservations r
      JOIN Users u ON r.user_id = u.user_id
      WHERE u.phone_number = ? AND r.status IN (
        'confirmada', 'confirmado', 'pendiente_autorizacion',
        'esperando_pago', 'pendiente_verificacion'
      )
      ORDER BY r.created_at DESC
      LIMIT 1
    `;
    
    console.log('[DEBUG] SQL:', sql);
    const rows = await runQuery(sql, [telefono]);
    console.log('[DEBUG] Rows:', rows);
    
    if (rows && rows.length > 0) {
      const reserva = rows[0];
      
      const tipo = ['confirmada', 'confirmado'].includes(reserva.status)
        ? 'activa'
        : 'pendiente';
      
      const resultado = { ...reserva, tipo };
      console.log('[DEBUG] Resultado:', resultado);
      return resultado;
    }

    console.log('[DEBUG] No reservas encontradas');
    return null;
  } catch (error) {
    console.error('Error buscando reserva:', error);
    return null;
  }
}

module.exports = {
  handleMainMenuOptions,
  generateDynamicMenu,
  STATES // Exportamos estados si se necesitan en otros módulos
};
