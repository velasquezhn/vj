const { extraerTelefono } = require('../utils/telefonoUtils');
const { enviarMenuPrincipal, enviarMenuCabanas, enviarMenuActividades } = require('../services/messagingService');
const { sendReplyButtons, sendList } = require('../services/whatsappInteractiveService');
const { getPaymentSettings } = require('../services/paymentSettingsService');
const { sendTelaWeather } = require('./flows/weatherHandler');
const { CONVERSATION_STATES, MAIN_MENU_OPTIONS, BUTTON_IDS } = require('../services/whatsappConversation');
const logger = require('../config/logger');
const {
  reservationStart,
  contactMessage,
  faqMessage,
  NAVIGATION_FOOTER,
  normalizeMainMenuSelection
} = require('../services/whatsappMessages');

async function handleMainMenuOptions(bot, remitente, mensaje, establecerEstado) {
  switch (normalizeMainMenuSelection(mensaje)) {
    case MAIN_MENU_OPTIONS.LODGING:
      await enviarMenuCabanas(bot, remitente);
      break;

    case MAIN_MENU_OPTIONS.RESERVE:
      await bot.sendMessage(remitente, { text: reservationStart() });
      await establecerEstado(remitente, 'reservar_fechas');
      break;

    case MAIN_MENU_OPTIONS.ACTIVITIES:
      await enviarMenuActividades(bot, remitente);
      break;

    case MAIN_MENU_OPTIONS.CONTACT:
      await sendReplyButtons(bot, remitente, {
        header: 'Contacto',
        body: `${contactMessage()}\n\nEscribe tu consulta en un solo mensaje o pulsa *Solicitar ayuda*.`,
        footer: NAVIGATION_FOOTER,
        buttons: [
          { id: BUTTON_IDS.HELP_REQUEST, title: 'Solicitar ayuda' },
          { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
        ]
      });
      await establecerEstado(remitente, CONVERSATION_STATES.CONTACT_MESSAGE, {});
      break;

    case MAIN_MENU_OPTIONS.WEATHER:
      await sendTelaWeather(bot, remitente, establecerEstado);
      break;

    case MAIN_MENU_OPTIONS.FAQ:
      {
        const payment = await getPaymentSettings();
        await sendReplyButtons(bot, remitente, {
          header: 'Preguntas frecuentes',
          body: faqMessage(payment.deposit_percentage),
          footer: NAVIGATION_FOOTER,
          buttons: [
            { id: BUTTON_IDS.RESERVATION_START, title: 'Reservar' },
            { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
          ]
        });
      }
      break;

    case MAIN_MENU_OPTIONS.MY_RESERVATION:
      try {
        await manejarPostReserva(bot, remitente, mensaje, establecerEstado);
      } catch (error) {
        logger.error('Error en soporte post-reserva', { error: error.message });
        await sendReplyButtons(bot, remitente, {
          body: '⚠️ No pudimos consultar la reserva. Intenta nuevamente o vuelve al menú.',
          buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
        });
      }
      break;

    default: // Opción inválida
      await enviarMenuPrincipal(bot, remitente, 'No reconocí esa opción. Elige una opción de la lista o escribe del 1 al 7.');
      break;
  }
}

// Abre las acciones disponibles para una reserva activa o pendiente.
async function manejarPostReserva(bot, remitente, mensaje, establecerEstado) {
  try {
    const telefono = extraerTelefono(remitente);
    const reserva = await buscarReservaActivaOPendiente(telefono);
    
    if (!reserva) {
      await sendReplyButtons(bot, remitente, {
        header: 'Mi reserva',
        body: 'No encontramos reservas activas o pendientes asociadas a este número. Puedes pedir ayuda o volver al menú.',
        buttons: [
          { id: 'post_1', title: 'Solicitar ayuda' },
          { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
        ],
        fallbackText: 'No encontramos reservas activas.\n\n1. Solicitar ayuda\n0. Menú principal'
      });
      await establecerEstado(remitente, CONVERSATION_STATES.POST_RESERVATION_EMPTY);
      return;
    }

    if (mensaje === MAIN_MENU_OPTIONS.MY_RESERVATION) {
      let menuTexto = '🎯 *AYUDA POST RESERVA*\n\n';
      let primaryTitle = 'Consultar estado';
      
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
        primaryTitle = 'Enviar comprobante';
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
        primaryTitle = 'Información acceso';
      }
      
      menuTexto += '2. ✏️ Modificar reserva\n';
      menuTexto += '3. ❌ Cancelar reserva\n';
      menuTexto += '4. 🆘 Solicitar asistencia\n\n';
      menuTexto += 'Responde con el número de tu opción.\n\nEscribe "menu" para ir al menú principal.';
      
      await sendList(bot, remitente, {
        header: 'Mi reserva',
        body: `Reserva *${reserva.confirmation_code || reserva.reservation_id}* · ${reserva.status.replaceAll('_', ' ')}`,
        buttonText: 'Ver acciones',
        footer: NAVIGATION_FOOTER,
        sections: [{
          title: 'Acciones disponibles',
          rows: [
            { id: 'post_1', title: primaryTitle, description: 'Consultar o completar el paso actual' },
            { id: 'post_2', title: 'Solicitar modificación', description: 'Un administrador te contactará' },
            { id: 'post_3', title: 'Solicitar cancelación', description: 'Requiere confirmación' },
            { id: 'post_4', title: 'Solicitar asistencia', description: 'Avisar a los administradores' }
          ]
        }],
        fallbackText: menuTexto
      });
      await establecerEstado(remitente, CONVERSATION_STATES.POST_RESERVATION_MENU, { reserva });
      logger.info('Menú de reserva enviado', { reservationId: reserva.reservation_id, status: reserva.status });
      return;
    }
    
  } catch (error) {
    logger.error('Error iniciando flujo de Mi reserva', { error: error.message });
    await bot.sendMessage(remitente, {
      text: 'Lo siento, ocurrió un error. Por favor intenta de nuevo más tarde.\n\nEscribe "menu" para ir al menú principal.'
    });
  }
}

// Función auxiliar para buscar reservas
async function buscarReservaActivaOPendiente(telefono) {
  try {
    const { runQuery } = require('../db');
    
    const sql = `
      SELECT r.*, u.name as guest_name, u.phone_number, c.name AS cabin_name,
             r.start_date as check_in_date, r.end_date as check_out_date
      FROM Reservations r
      JOIN Users u ON r.user_id = u.user_id
      JOIN Cabins c ON c.cabin_id = r.cabin_id
      WHERE u.phone_number = ? AND r.status IN (
        'confirmada', 'confirmado', 'pendiente_autorizacion',
        'esperando_pago', 'pendiente_verificacion'
      )
      ORDER BY r.created_at DESC
      LIMIT 1
    `;
    
    const rows = await runQuery(sql, [telefono]);
    
    if (rows && rows.length > 0) {
      const reserva = rows[0];
      
      const tipo = ['confirmada', 'confirmado'].includes(reserva.status)
        ? 'activa'
        : 'pendiente';
      
      return { ...reserva, tipo };
    }

    return null;
  } catch (error) {
    logger.error('Error buscando reserva activa por WhatsApp', { error: error.message });
    return null;
  }
}

module.exports = {
  handleMainMenuOptions
};
