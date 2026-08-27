
// Full original content of vj/controllers/flows/messageProcessor.js with deposit receipt forwarding integrated

const { obtenerEstado, establecerEstado } = require('../../services/stateService');
const { handleGreeting } = require('./greetingHandler');
const { handleMenuState } = require('./menuHandler');
const { handleActividadesState } = require('./actividadesHandler');
const { handleReservaState } = require('./reservaFlowHandler');
const { ESTADOS_RESERVA } = require('../reservaConstants');
const { enviarMenuPrincipal } = require('../../services/messagingService');
const logger = require('../../config/logger');
const alojamientosService = require('../../services/alojamientosService');

const { extractMessageText } = require('./messageProcessorUtils');
const { sendMessageWithDelay } = require('../../utils/messageDelayUtils');
const { isAdminSender, handleAdminMessage, notifyAdminsOfGuestRequest } = require('../../services/whatsappAdminService');
const { handleShareExperienceResponse } = require('../../routes/shareExperience');
const { normalizeConversationInput, reservationStart } = require('../../services/whatsappMessages');
// const { manejarPostReserva, manejarNoReserva, procesarComprobantePostReserva } = require('../../routes/postReservaHandler'); // TEMPORALMENTE COMENTADO

async function handleBack(bot, remitente, estado) {
    if (estado === 'LISTA_CABAÑAS') return enviarMenuPrincipal(bot, remitente);
    if (estado === 'DETALLE_CABAÑA') {
        const { enviarMenuCabanas } = require('../../services/messagingService');
        return enviarMenuCabanas(bot, remitente);
    }
    if (estado === 'actividades' || estado === 'post_actividad') {
        const { enviarMenuActividades } = require('../../services/messagingService');
        return enviarMenuActividades(bot, remitente);
    }
    if (String(estado).startsWith('reservar_')) {
        await establecerEstado(remitente, ESTADOS_RESERVA.FECHAS, {});
        return bot.sendMessage(remitente, { text: reservationStart() });
    }
    return enviarMenuPrincipal(bot, remitente);
}

async function procesarMensaje(bot, remitente, mensaje, mensajeObj) {
    // Validación básica de remitente
    if (!remitente || remitente.trim() === '') {
        logger.error('Remitente inválido', { mensaje, mensajeObj });
        return;
    }

    try {
        const rawText = typeof mensaje === 'string' ? mensaje.trim() : extractMessageText(mensajeObj);
        const mensajeTexto = normalizeConversationInput(rawText);

        // Los administradores autorizados usan un flujo privado de aprobación.
        // Se procesa antes del saludo para que los botones no abran el menú de huéspedes.
        if (await isAdminSender(remitente) && await handleAdminMessage(bot, remitente, mensajeTexto)) {
            return;
        }

        // Manejar saludos primero
        if (await handleGreeting(bot, remitente, mensajeTexto)) {
            return;
        }

        // Comandos globales disponibles en cualquier parte del flujo.
        if (mensajeTexto === 'menu') {
            await enviarMenuPrincipal(bot, remitente);
            return;
        }

        const estadoData = await obtenerEstado(remitente);
        const estado = estadoData.estado;
        const datos = estadoData.datos;

        if (mensajeTexto === 'cancelar') {
            await enviarMenuPrincipal(bot, remitente);
            return;
        }
        if (mensajeTexto === 'volver') {
            await handleBack(bot, remitente, estado);
            return;
        }
        
        logger.debug(`Procesando estado [${estado}] para ${remitente}`, {
            message: mensajeTexto
        });

        logger.info('Mensaje de conversación procesado', { userId: remitente, estado });

        // Router de estados
        const mensajeReserva = mensajeObj?.message || mensaje;
        const stateHandlers = {
            MENU_PRINCIPAL: () => handleMenuState(bot, remitente, mensajeTexto, estado, establecerEstado),
            LISTA_CABAÑAS: () => handleMenuState(bot, remitente, mensajeTexto, estado, establecerEstado),
            DETALLE_CABAÑA: () => handleMenuState(bot, remitente, mensajeTexto, estado, establecerEstado),
            actividades: () => handleActividadesState(bot, remitente, mensajeTexto, establecerEstado),
            post_actividad: () => handlePostActividadState(bot, remitente, mensajeTexto, establecerEstado),
            share_experience: () => handleShareExperienceResponse(bot, remitente, mensajeTexto, establecerEstado),
            // Flujo de reserva
            [ESTADOS_RESERVA.FECHAS]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.CONFIRMAR_FECHAS]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.NOMBRE]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.TELEFONO]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.PERSONAS]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.ALOJAMIENTO]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.CONDICIONES]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.ESPERANDO_AUTORIZACION]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.ESPERANDO_PAGO]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.ESPERANDO_CONFIRMACION]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            // Estados post-reserva
            'post_reserva_menu': () => manejarPostReservaMenu(bot, remitente, mensajeTexto, establecerEstado, datos),
            'post_reserva_no_reserva': () => manejarNoReserva(bot, remitente, mensajeTexto, establecerEstado),
            'post_reserva_esperando_comprobante': () => {
                // Verificar si es imagen/documento para procesar comprobante
                const hasImage = mensajeObj?.message?.imageMessage || mensajeObj?.imageMessage;
                const hasDocument = mensajeObj?.message?.documentMessage || mensajeObj?.documentMessage;
                
                if (hasImage || hasDocument) {
                    return procesarComprobantePostReserva(bot, remitente, mensajeObj, establecerEstado, datos);
                } else if (mensajeTexto === 'menu') {
                    return enviarMenuPrincipal(bot, remitente);
                } else {
                    return sendMessageWithDelay(bot, remitente, {
                        text: '⚠️ Por favor envía una imagen o documento con el comprobante de pago.\n\nEscribe "menu" para cancelar.'
                    });
                }
            },
            'post_reserva_comprobante_enviado': () => {
                if (mensajeTexto === '1') {
                    return manejarPostReserva(bot, remitente, '8', establecerEstado);
                } else if (mensajeTexto === '2' || mensajeTexto === 'menu') {
                    return enviarMenuPrincipal(bot, remitente);
                } else {
                    return sendMessageWithDelay(bot, remitente, {
                        text: 'Por favor responde con 1, 2 o "menu".'
                    });
                }
            },
            'post_reserva_confirmar_cancelacion': async () => {
                const reserva = datos?.reserva;
                if (mensajeTexto === '1') {
                    // Confirmar cancelación
                    try {
                        const { runQuery } = require('../../db');
                        await runQuery('UPDATE Reservations SET status = ? WHERE reservation_id = ?', ['cancelada', reserva.reservation_id]);
                        
                        await sendMessageWithDelay(bot, remitente, {
                            text: '✅ *RESERVA CANCELADA*\n\n' +
                                  `📅 Reserva ${reserva.reservation_id} ha sido cancelada exitosamente.\n\n` +
                                  '💰 Los pagos y anticipos realizados no son reembolsables.\n\n' +
                                  '📞 Cualquier consulta, no dudes en contactarnos.\n\n' +
                                  'Escribe "menu" para volver al menú principal.'
                        });
                        await notifyAdminsOfGuestRequest(bot, { guestNumber: remitente, reservation: reserva, requestType: 'cancellation' });
                        await establecerEstado(remitente, null);
                    } catch (error) {
                        console.error('Error cancelando reserva:', error);
                        await sendMessageWithDelay(bot, remitente, {
                            text: '❌ Error al cancelar la reserva. Por favor contacta con un agente.\n\nEscribe "menu" para ir al menú principal.'
                        });
                    }
                } else if (mensajeTexto === '2') {
                    // No cancelar
                    await sendMessageWithDelay(bot, remitente, {
                        text: '✅ *RESERVA MANTENIDA*\n\n' +
                              'Tu reserva se mantiene activa.\n\n' +
                              'Escribe "menu" para volver al menú principal.'
                    });
                    await establecerEstado(remitente, null);
                } else {
                    await sendMessageWithDelay(bot, remitente, {
                        text: '❌ Opción no válida.\n\nPor favor responde:\n1. Sí, cancelar reserva\n2. No, mantener reserva\n\nEscribe "menu" para ir al menú principal.'
                    });
                }
            }
        };

        const handler = stateHandlers[estado];
        if (handler) {
            await handler();
        } else {
            // Si el estado no es manejado, verificar si es un estado que debe preservarse
            const estadosAPreservar = ['esperando_pago', 'ESPERANDO_PAGO', 'esperando_confirmacion', 'ESPERANDO_CONFIRMACION'];
            
            if (estadosAPreservar.includes(estado)) {
                // Para estados críticos, solo dar una advertencia pero mantener el estado
                logger.warn(`Mensaje no válido en estado crítico: ${estado}`, { userId: remitente });
                await sendMessageWithDelay(bot, remitente, {
                    text: '⏳ Tu reserva está en proceso. Por favor espera la confirmación del administrador.'
                });
                return; // No cambiar el estado
            } else {
                // Si el estado no es manejado, muestra advertencia y regresa al menú principal
                logger.warn(`Estado no manejado: ${estado}`, { userId: remitente });
                await enviarMenuPrincipal(bot, remitente);
            }
        }
    } catch (error) {
        logger.error(`Error procesando mensaje de ${remitente}: ${error.message}`, {
            stack: error.stack,
            userId: remitente,
            mensaje: mensaje || ''
        });

        try {
            // Verificar si es un estado crítico que no debe resetearse
            const estadoActual = await obtenerEstado(remitente);
            const estadosAPreservar = ['esperando_pago', 'ESPERANDO_PAGO', 'esperando_confirmacion', 'ESPERANDO_CONFIRMACION'];
            
            if (estadosAPreservar.includes(estadoActual.estado)) {
                await sendMessageWithDelay(bot, remitente, {
                    text: '⚠️ Error temporal. Tu reserva sigue en proceso, no te preocupes.'
                });
                // No resetear el estado
            } else {
                await enviarMenuPrincipal(bot, remitente);
            }
        } catch (fallbackError) {
            logger.critical(`Error crítico de comunicación: ${fallbackError.message}`, {
                stack: fallbackError.stack,
                userId: remitente
            });
        }
    }
}

// FUNCIONES TEMPORALES PARA POST-RESERVA (hasta resolver problema de exports)

async function manejarPostReservaMenu(bot, remitente, mensaje, establecerEstado, datos) {
    console.log('### FUNCIÓN manejarPostReservaMenu LLAMADA ###');
    console.log('### MENSAJE:', mensaje, '### DATOS:', datos);
    
    const reserva = datos?.reserva;
    if (!reserva) {
        await sendMessageWithDelay(bot, remitente, {
            text: '❌ Error: No se encontraron datos de reserva.\n\nEscribe "menu" para ir al menú principal.'
        });
        await establecerEstado(remitente, null);
        return;
    }
    
    try {
        switch (mensaje) {
            case '1':
                if (reserva.status === 'esperando_pago') {
                    // Enviar comprobante
                    await sendMessageWithDelay(bot, remitente, {
                        text: '📎 *ENVIAR COMPROBANTE*\n\n' +
                              'Por favor envía una foto o documento del comprobante de pago.\n\n' +
                              '✅ Formatos aceptados: JPG, PNG, PDF\n' +
                              '📱 Puedes tomar una foto directamente o enviar desde galería\n\n' +
                              'Escribe "menu" para cancelar y volver al menú principal.'
                    });
                    await establecerEstado(remitente, 'post_reserva_esperando_comprobante', { reserva });
                } else if (reserva.status === 'pendiente_autorizacion') {
                    await sendMessageWithDelay(bot, remitente, {
                        text: '⏳ *PAGO AÚN NO AUTORIZADO*\n\n' +
                              'Tu solicitud está siendo revisada por un administrador. Todavía no realices el pago ni envíes un comprobante. Te avisaremos por este chat cuando el pago sea autorizado.\n\n' +
                              'Escribe "menu" para volver al menú principal.'
                    });
                } else if (reserva.status === 'pendiente_verificacion') {
                    await sendMessageWithDelay(bot, remitente, {
                        text: '🔎 *COMPROBANTE EN REVISIÓN*\n\n' +
                              'Ya recibimos tu comprobante. Un administrador debe revisarlo y confirmar finalmente la reserva. Te notificaremos por este chat.\n\n' +
                              'Escribe "menu" para volver al menú principal.'
                    });
                } else {
                    // Información de acceso
                    await sendMessageWithDelay(bot, remitente, {
                        text: '🔐 *INFORMACIÓN DE ACCESO*\n\n' +
                              `📅 Reserva: ${reserva.reservation_id}\n` +
                              `🏠 Alojamiento: ${reserva.cabin_name || 'Por confirmar'}\n` +
                              `📆 Check-in: ${reserva.check_in_date}\n` +
                              `📆 Check-out: ${reserva.check_out_date}\n\n` +
                              '🗝️ Código de acceso: Se enviará 1 día antes del check-in\n' +
                              '📍 Ubicación exacta: Se proporcionará con el código\n\n' +
                              'Escribe "menu" para volver al menú principal.'
                    });
                }
                break;
                
            case '2':
                // Modificar reserva
                await sendMessageWithDelay(bot, remitente, {
                    text: '✏️ *MODIFICAR RESERVA*\n\n' +
                          'Avisamos a los administradores para que uno de ellos te escriba por privado. Los cambios dependen de disponibilidad.\n\n' +
                          '📞 Te contactarán a este mismo número.\n' +
                          '⏰ Horario de oficina: 8:00 a. m. a 4:00 p. m.\n\n' +
                          'Escribe "menu" para volver al menú principal.'
                });
                await notifyAdminsOfGuestRequest(bot, { guestNumber: remitente, reservation: reserva, requestType: 'modification' });
                await establecerEstado(remitente, 'esperando_agente');
                break;
                
            case '3':
                // Cancelar reserva
                await sendMessageWithDelay(bot, remitente, {
                    text: '❌ *CANCELAR RESERVA*\n\n' +
                          '⚠️ ¿Estás seguro que deseas cancelar tu reserva?\n\n' +
                          `📅 Reserva: ${reserva.reservation_id}\n` +
                          `📆 Fechas: ${reserva.check_in_date} - ${reserva.check_out_date}\n\n` +
                          '1. ✅ Sí, cancelar reserva\n' +
                          '2. ❌ No, mantener reserva\n\n' +
                          'Responde con 1 o 2.\n\nEscribe "menu" para volver al menú principal.'
                });
                await establecerEstado(remitente, 'post_reserva_confirmar_cancelacion', { reserva });
                break;
                
            case '4':
                // Solicitar asistencia
                await sendMessageWithDelay(bot, remitente, {
                    text: '🆘 *SOLICITAR ASISTENCIA*\n\n' +
                          'Avisamos a los administradores para que uno de ellos te escriba por privado.\n\n' +
                          '📱 Te contactaremos a este mismo número\n' +
                          '🕒 Solicitudes recibidas 24/7 · Oficina de 8:00 a. m. a 4:00 p. m.\n\n' +
                          'Escribe "menu" para volver al menú principal.'
                });
                await notifyAdminsOfGuestRequest(bot, { guestNumber: remitente, reservation: reserva, requestType: 'assistance' });
                await establecerEstado(remitente, 'esperando_agente');
                break;
                
            default:
                await sendMessageWithDelay(bot, remitente, {
                    text: '❌ Opción no válida.\n\nPor favor selecciona una opción del 1 al 4.\n\nEscribe "menu" para volver al menú principal.'
                });
                break;
        }
    } catch (error) {
        console.error('Error en manejarPostReservaMenu:', error);
        await sendMessageWithDelay(bot, remitente, {
            text: 'Lo siento, ocurrió un error. Por favor intenta de nuevo más tarde.\n\nEscribe "menu" para ir al menú principal.'
        });
    }
}

async function manejarNoReserva(bot, remitente, mensaje, establecerEstado) {
    console.log('### FUNCIÓN manejarNoReserva LLAMADA ###');
    
    if (mensaje === '1') {
        await sendMessageWithDelay(bot, remitente, {
            text: '👥 *CONTACTAR AGENTE*\n\n' +
                  'Avisamos a los administradores para que uno de ellos te escriba por privado.\n\n' +
                  'Solicitudes recibidas 24/7 · Oficina de 8:00 a. m. a 4:00 p. m.\n\n' +
                  'Escribe "menu" para volver al menú principal.'
        });
        await notifyAdminsOfGuestRequest(bot, { guestNumber: remitente, requestType: 'assistance' });
        await establecerEstado(remitente, 'esperando_agente');
    } else if (mensaje === '2') {
        await sendMessageWithDelay(bot, remitente, {
            text: '🏠 Has vuelto al menú principal.\n\nEscribe "menu" para ver las opciones disponibles.'
        });
        await establecerEstado(remitente, null);
    } else {
        await sendMessageWithDelay(bot, remitente, {
            text: '❌ Opción no válida.\n\nPor favor responde:\n1. Hablar con un agente\n2. Volver al menú principal\n\nEscribe "menu" para ir al menú principal.'
        });
    }
}

async function procesarComprobantePostReserva(bot, remitente, mensajeObj, establecerEstado, datos) {
    console.log('### FUNCIÓN procesarComprobantePostReserva LLAMADA ###');
    
    try {
        const reserva = datos?.reserva;
        
        if (!reserva) {
            await sendMessageWithDelay(bot, remitente, {
                text: '❌ Error: No se encontraron datos de reserva.\n\nEscribe "menu" para ir al menú principal.'
            });
            await establecerEstado(remitente, null);
            return;
        }

        const Reserva = require('../../models/Reserva');
        const reservaActual = await Reserva.findById(reserva.reservation_id);
        if (!reservaActual || reservaActual.status !== 'esperando_pago') {
            const mensajeEstado = reservaActual?.status === 'pendiente_verificacion'
                ? 'Ya recibimos tu comprobante y está pendiente de revisión final.'
                : 'El pago todavía no ha sido autorizado por un administrador. No envíes el comprobante aún.';
            await sendMessageWithDelay(bot, remitente, {
                text: `⛔ *COMPROBANTE NO HABILITADO*\n\n${mensajeEstado}\n\nTe avisaremos por este chat cuando cambie el estado.`
            });
            await establecerEstado(remitente, null);
            return;
        }
        
        const { descargarMedia } = require('../../utils/mediaUtils');
        const { guardarComprobante } = require('../../services/comprobanteService');
        const { notifyWhatsAppAdmins } = require('../../services/whatsappAdminService');
        const { buffer, mimetype, nombreArchivo } = await descargarMedia(mensajeObj.message || mensajeObj);
        await guardarComprobante(reservaActual.reservation_id, buffer, mimetype, nombreArchivo);
        await notifyWhatsAppAdmins(bot, reservaActual.reservation_id);
        
        await sendMessageWithDelay(bot, remitente, {
            text: '✅ *COMPROBANTE RECIBIDO*\n\n' +
                  '📎 Hemos recibido tu comprobante de pago.\n\n' +
                  '⏳ Tu reserva está siendo procesada por nuestro equipo.\n' +
                  'Te notificaremos cuando sea confirmada.\n\n' +
                  '📱 Puedes consultar el estado escribiendo "menu" y seleccionando la opción 8.\n\n' +
                  'Tiempo estimado de confirmación: 24-48 horas hábiles.'
        });
        
        await establecerEstado(remitente, null);
        
    } catch (error) {
        console.error('Error procesando comprobante:', error);
        await sendMessageWithDelay(bot, remitente, {
            text: 'Lo siento, ocurrió un error al procesar tu comprobante. Por favor intenta de nuevo.\n\nEscribe "menu" para ir al menú principal.'
        });
    }
}

// Manejar estado post-actividad (después de mostrar una actividad)
async function handlePostActividadState(bot, remitente, mensajeTexto, establecerEstado) {
    const mensaje = mensajeTexto.trim();
    
    switch (mensaje) {
        case '1':
            // Ver más actividades - volver al menú de actividades
            {
                const { enviarMenuActividades } = require('../../services/messagingService');
                await enviarMenuActividades(bot, remitente);
            }
            break;
            
        case '0':
            // Menú principal
            await enviarMenuPrincipal(bot, remitente);
            break;
            
        default:
            await sendMessageWithDelay(bot, remitente, {
                text: '⚠️ Opción no válida.\n\n' +
                      '🔹 Escribe *1* para ver más actividades\n' +
                      '🔹 Escribe *0* para ir al menú principal'
            });
            break;
    }
}

module.exports = { procesarMensaje };
