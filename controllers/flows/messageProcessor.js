
// Full original content of vj/controllers/flows/messageProcessor.js with deposit receipt forwarding integrated

const { obtenerEstado, establecerEstado } = require('../../services/stateService');
const { handleGreeting } = require('./greetingHandler');
const { handleMenuState } = require('./menuHandler');
const { handleActividadesState } = require('./actividadesHandler');
const { handleReservaState } = require('./reservaFlowHandler');
const { ESTADOS_RESERVA } = require('../reservaConstants');
const { enviarMenuPrincipal } = require('../../services/messagingService');
const logger = require('../../config/logger');

const { extractMessageText } = require('./messageProcessorUtils');
const { isAdminSender, handleAdminMessage, notifyAdminsOfGuestRequest } = require('../../services/whatsappAdminService');
const { normalizeConversationInput, reservationStart } = require('../../services/whatsappMessages');
const { handleWeatherState } = require('./weatherHandler');
const { sendReplyButtons } = require('../../services/whatsappInteractiveService');
const { CONVERSATION_STATES, BUTTON_IDS } = require('../../services/whatsappConversation');

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

async function handleRestart(bot, remitente, estado) {
    if (String(estado).startsWith('reservar_')) {
        await establecerEstado(remitente, ESTADOS_RESERVA.FECHAS, {});
        return bot.sendMessage(remitente, { text: reservationStart() });
    }
    if ([CONVERSATION_STATES.WEATHER_CITY, CONVERSATION_STATES.WEATHER_RESULT].includes(estado)) {
        const { showWeatherPrompt } = require('./weatherHandler');
        return showWeatherPrompt(bot, remitente, establecerEstado);
    }
    if ([CONVERSATION_STATES.CABIN_LIST, CONVERSATION_STATES.CABIN_DETAIL].includes(estado)) {
        const { enviarMenuCabanas } = require('../../services/messagingService');
        return enviarMenuCabanas(bot, remitente);
    }
    if ([CONVERSATION_STATES.ACTIVITIES, CONVERSATION_STATES.POST_ACTIVITY].includes(estado)) {
        const { enviarMenuActividades } = require('../../services/messagingService');
        return enviarMenuActividades(bot, remitente);
    }
    return enviarMenuPrincipal(bot, remitente);
}

async function requestHumanHelp(bot, remitente) {
    const delivery = await notifyAdminsOfGuestRequest(bot, { guestNumber: remitente, requestType: 'assistance' });
    await establecerEstado(remitente, CONVERSATION_STATES.WAITING_AGENT, {});
    return sendReplyButtons(bot, remitente, {
        header: 'Ayuda solicitada',
        body: delivery?.sent > 0
            ? 'Avisamos a los administradores. Uno de ellos te escribirá por privado a este mismo número.'
            : 'Registramos tu solicitud, pero no pudimos entregar el aviso automático. Puedes volver al menú e intentar nuevamente.',
        footer: 'Solicitudes 24/7 · Oficina 8:00 a. m. a 4:00 p. m.',
        buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
    });
}

async function handleContactMessage(bot, remitente, input) {
    const note = String(input || '').trim();
    if (!note || note.length > 300) {
        return sendReplyButtons(bot, remitente, {
            header: 'Contacto',
            body: note.length > 500
                ? 'La consulta es demasiado larga. Resúmela en un máximo de 300 caracteres.'
                : 'Escribe brevemente tu consulta para enviarla al equipo.',
            buttons: [
                { id: BUTTON_IDS.HELP_REQUEST, title: 'Solicitar ayuda' },
                { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
            ]
        });
    }
    const delivery = await notifyAdminsOfGuestRequest(bot, {
        guestNumber: remitente,
        requestType: 'assistance',
        note: note.replace(/[\u0000-\u001f]+/g, ' ')
    });
    await establecerEstado(remitente, CONVERSATION_STATES.WAITING_AGENT, {});
    return sendReplyButtons(bot, remitente, {
        header: 'Consulta enviada',
        body: delivery?.sent > 0
            ? 'Avisamos a los administradores. Uno de ellos te escribirá por privado.'
            : 'Guardamos tu consulta, pero el aviso automático no pudo entregarse. Intenta nuevamente desde Ayuda.',
        buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
    });
}

async function procesarMensaje(bot, remitente, mensaje, mensajeObj) {
    // Validación básica de remitente
    if (!remitente || remitente.trim() === '') {
        logger.error('Remitente inválido en conversación WhatsApp', {
            messageType: mensajeObj?.message ? Object.keys(mensajeObj.message)[0] : typeof mensaje
        });
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

        // Comandos globales disponibles en cualquier parte del flujo.
        if (mensajeTexto === 'menu') {
            await enviarMenuPrincipal(bot, remitente);
            return;
        }
        if (mensajeTexto === 'ayuda') {
            await requestHumanHelp(bot, remitente);
            return;
        }

        const estadoData = await obtenerEstado(remitente);
        const estado = estadoData.estado;
        const datos = estadoData.datos;

        if (estadoData.expired) {
            await sendReplyButtons(bot, remitente, {
                header: 'Sesión finalizada',
                body: 'La conversación anterior venció por inactividad. Tus reservas guardadas no se eliminaron. Vuelve al menú para continuar o consultar “Mi reserva”.',
                buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
            });
            return;
        }

        // Un saludo abre el menú únicamente desde el estado principal. En los
        // demás pasos puede ser una ciudad, nombre u otra respuesta legítima.
        if (estado === CONVERSATION_STATES.MENU && await handleGreeting(bot, remitente, mensajeTexto)) {
            return;
        }

        if (mensajeTexto === 'cancelar') {
            await enviarMenuPrincipal(bot, remitente);
            return;
        }
        if (mensajeTexto === 'volver') {
            await handleBack(bot, remitente, estado);
            return;
        }
        if (mensajeTexto === 'reiniciar') {
            await handleRestart(bot, remitente, estado);
            return;
        }
        
        logger.debug('Procesando estado de conversación', { estado, userId: remitente });

        logger.info('Mensaje de conversación procesado', { userId: remitente, estado });

        // Router de estados
        const mensajeReserva = mensajeObj?.message || mensaje;
        const stateHandlers = {
            MENU_PRINCIPAL: () => handleMenuState(bot, remitente, mensajeTexto, estado, establecerEstado),
            LISTA_CABAÑAS: () => handleMenuState(bot, remitente, mensajeTexto, estado, establecerEstado),
            DETALLE_CABAÑA: () => handleMenuState(bot, remitente, mensajeTexto, estado, establecerEstado),
            actividades: () => handleActividadesState(bot, remitente, mensajeTexto, establecerEstado),
            post_actividad: () => handlePostActividadState(bot, remitente, mensajeTexto, establecerEstado),
            [CONVERSATION_STATES.CONTACT_MESSAGE]: () => handleContactMessage(bot, remitente, mensajeTexto),
            [CONVERSATION_STATES.WEATHER_CITY]: () => handleWeatherState(bot, remitente, mensajeTexto, estado, datos, establecerEstado),
            [CONVERSATION_STATES.WEATHER_RESULT]: () => handleWeatherState(bot, remitente, mensajeTexto, estado, datos, establecerEstado),
            // Flujo de reserva
            [ESTADOS_RESERVA.FECHAS]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.CONFIRMAR_FECHAS]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.NOMBRE]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.PERSONAS]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.CONDICIONES]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.ESPERANDO_AUTORIZACION]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.ESPERANDO_PAGO]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            [ESTADOS_RESERVA.ESPERANDO_CONFIRMACION]: () => handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensajeReserva),
            // Estados post-reserva
            [CONVERSATION_STATES.POST_RESERVATION_MENU]: () => manejarPostReservaMenu(bot, remitente, mensajeTexto, establecerEstado, datos),
            [CONVERSATION_STATES.POST_RESERVATION_EMPTY]: () => manejarNoReserva(bot, remitente, mensajeTexto, establecerEstado),
            [CONVERSATION_STATES.POST_RESERVATION_RECEIPT]: () => {
                // Verificar si es imagen/documento para procesar comprobante
                const hasImage = mensajeObj?.message?.imageMessage || mensajeObj?.imageMessage;
                const hasDocument = mensajeObj?.message?.documentMessage || mensajeObj?.documentMessage;
                
                if (hasImage || hasDocument) {
                    return procesarComprobantePostReserva(bot, remitente, mensajeObj, establecerEstado, datos);
                } else if (mensajeTexto === 'menu') {
                    return enviarMenuPrincipal(bot, remitente);
                } else {
                    return bot.sendMessage(remitente, {
                        text: '⚠️ Por favor envía una imagen o documento con el comprobante de pago.\n\nEscribe "menu" para cancelar.'
                    });
                }
            },
            [CONVERSATION_STATES.POST_RESERVATION_CANCEL]: async () => {
                const reserva = datos?.reserva;
                if (mensajeTexto === '1') {
                    try {
                        if (!reserva?.reservation_id) throw new Error('Datos de reserva ausentes');
                        const { cancelReservation, notifyGuest } = require('../../services/reservationApprovalService');
                        const result = await cancelReservation(reserva.reservation_id, null, {
                            notify: (item, decision) => notifyGuest(item, decision, bot)
                        });
                        if (!result.ok) throw new Error(result.code || 'No se pudo cancelar la reserva');
                        await notifyAdminsOfGuestRequest(bot, { guestNumber: remitente, reservation: reserva, requestType: 'cancellation' });
                        await establecerEstado(remitente, CONVERSATION_STATES.MENU, {});
                    } catch (error) {
                        logger.error('Error cancelando reserva desde WhatsApp', { reservationId: reserva?.reservation_id, error: error.message });
                        await sendReplyButtons(bot, remitente, {
                            body: '❌ No pudimos cancelar la reserva. Intenta nuevamente o solicita ayuda a un administrador.',
                            buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                        });
                    }
                } else if (mensajeTexto === '2') {
                    await enviarMenuPrincipal(bot, remitente);
                } else {
                    await sendReplyButtons(bot, remitente, {
                        header: 'Confirmar cancelación',
                        body: 'No reconocí la respuesta. ¿Deseas cancelar definitivamente la reserva?',
                        buttons: [
                            { id: BUTTON_IDS.POST_CANCEL_YES, title: 'Sí, cancelar' },
                            { id: BUTTON_IDS.POST_CANCEL_NO, title: 'No cancelar' },
                            { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
                        ],
                        fallbackText: 'Responde 1 para cancelar, 2 para conservar la reserva o 0 para volver al menú.'
                    });
                }
            },
            [CONVERSATION_STATES.WAITING_AGENT]: () => sendReplyButtons(bot, remitente, {
                header: 'Solicitud enviada',
                body: 'Ya avisamos a los administradores. Uno de ellos te escribirá por privado. Puedes volver al menú para realizar otra consulta.',
                buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
            })
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
                await bot.sendMessage(remitente, {
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
            messageType: mensajeObj?.message ? Object.keys(mensajeObj.message)[0] : typeof mensaje
        });

        try {
            // Verificar si es un estado crítico que no debe resetearse
            const estadoActual = await obtenerEstado(remitente);
            const estadosAPreservar = ['esperando_pago', 'ESPERANDO_PAGO', 'esperando_confirmacion', 'ESPERANDO_CONFIRMACION'];
            
            if (estadosAPreservar.includes(estadoActual.estado)) {
                await bot.sendMessage(remitente, {
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

// Flujos posteriores al registro de una reserva.

async function manejarPostReservaMenu(bot, remitente, mensaje, establecerEstado, datos) {
    const reserva = datos?.reserva;
    if (!reserva) {
        await bot.sendMessage(remitente, {
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
                    await sendReplyButtons(bot, remitente, {
                        header: 'Enviar comprobante',
                        body: 'Envía una foto JPG/PNG o un PDF del comprobante. Puedes tomar la foto o elegir el archivo desde tu teléfono.',
                        buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                    });
                    await establecerEstado(remitente, CONVERSATION_STATES.POST_RESERVATION_RECEIPT, { reserva });
                } else if (reserva.status === 'pendiente_autorizacion') {
                    await sendReplyButtons(bot, remitente, {
                        header: 'Pago no autorizado',
                        body: 'Tu solicitud sigue en revisión. No realices el pago ni envíes un comprobante todavía; te avisaremos cuando esté habilitado.',
                        buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                    });
                } else if (reserva.status === 'pendiente_verificacion') {
                    await sendReplyButtons(bot, remitente, {
                        header: 'Comprobante en revisión',
                        body: 'Ya recibimos tu comprobante. Un administrador debe revisarlo y te notificaremos la decisión final por este chat.',
                        buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                    });
                } else {
                    // Información de acceso
                    await sendReplyButtons(bot, remitente, {
                        header: 'Información de acceso',
                        body:
                              `📅 Reserva: ${reserva.reservation_id}\n` +
                              `🏠 Alojamiento: ${reserva.cabin_name || 'Por confirmar'}\n` +
                              `📆 Check-in: ${reserva.check_in_date}\n` +
                              `📆 Check-out: ${reserva.check_out_date}\n\n` +
                              '🗝️ El código y la ubicación exacta se enviarán un día antes de la entrada.',
                        buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                    });
                }
                break;
                
            case '2':
                // Modificar reserva
                await sendReplyButtons(bot, remitente, {
                    header: 'Modificar reserva',
                    body:
                          'Avisamos a los administradores para que uno de ellos te escriba por privado. Los cambios dependen de disponibilidad.\n\n' +
                          '📞 Te contactarán a este mismo número.\n' +
                          '⏰ Horario de oficina: 8:00 a. m. a 4:00 p. m.',
                    buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                });
                await notifyAdminsOfGuestRequest(bot, { guestNumber: remitente, reservation: reserva, requestType: 'modification' });
                await establecerEstado(remitente, CONVERSATION_STATES.WAITING_AGENT);
                break;
                
            case '3':
                // Cancelar reserva
                await sendReplyButtons(bot, remitente, {
                    header: 'Cancelar reserva',
                    body: `¿Confirmas que deseas cancelar la reserva *${reserva.confirmation_code || reserva.reservation_id}*?\n\nFechas: ${reserva.check_in_date} al ${reserva.check_out_date}\n\nLos pagos y anticipos realizados no son reembolsables.`,
                    buttons: [
                        { id: BUTTON_IDS.POST_CANCEL_YES, title: 'Sí, cancelar' },
                        { id: BUTTON_IDS.POST_CANCEL_NO, title: 'No cancelar' },
                        { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
                    ],
                    fallbackText: 'Responde 1 para cancelar, 2 para conservar la reserva o 0 para volver al menú.'
                });
                await establecerEstado(remitente, CONVERSATION_STATES.POST_RESERVATION_CANCEL, { reserva });
                break;
                
            case '4':
                // Solicitar asistencia
                await sendReplyButtons(bot, remitente, {
                    header: 'Asistencia solicitada',
                    body:
                          'Avisamos a los administradores para que uno de ellos te escriba por privado.\n\n' +
                          '📱 Te contactaremos a este mismo número\n' +
                          '🕒 Solicitudes recibidas 24/7 · Oficina de 8:00 a. m. a 4:00 p. m.',
                    buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                });
                await notifyAdminsOfGuestRequest(bot, { guestNumber: remitente, reservation: reserva, requestType: 'assistance' });
                await establecerEstado(remitente, CONVERSATION_STATES.WAITING_AGENT);
                break;
                
            default:
                await bot.sendMessage(remitente, {
                    text: '❌ Opción no válida.\n\nPor favor selecciona una opción del 1 al 4.\n\nEscribe "menu" para volver al menú principal.'
                });
                break;
        }
    } catch (error) {
        logger.error('Error en menú post-reserva', { reservationId: reserva?.reservation_id, error: error.message });
        await bot.sendMessage(remitente, {
            text: 'Lo siento, ocurrió un error. Por favor intenta de nuevo más tarde.\n\nEscribe "menu" para ir al menú principal.'
        });
    }
}

async function manejarNoReserva(bot, remitente, mensaje, establecerEstado) {
    if (mensaje === '1') {
        await sendReplyButtons(bot, remitente, {
            header: 'Ayuda solicitada',
            body:
                  'Avisamos a los administradores para que uno de ellos te escriba por privado.\n\n' +
                  'Solicitudes recibidas 24/7 · Oficina de 8:00 a. m. a 4:00 p. m.',
            buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
        });
        await notifyAdminsOfGuestRequest(bot, { guestNumber: remitente, requestType: 'assistance' });
        await establecerEstado(remitente, CONVERSATION_STATES.WAITING_AGENT);
    } else if (mensaje === '0' || mensaje === '2') {
        await enviarMenuPrincipal(bot, remitente);
    } else {
        await sendReplyButtons(bot, remitente, {
            body: 'No reconocí la opción. Puedes solicitar ayuda o volver al menú.',
            buttons: [
                { id: 'post_1', title: 'Solicitar ayuda' },
                { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
            ],
            fallbackText: '1. Solicitar ayuda\n0. Menú principal'
        });
    }
}

async function procesarComprobantePostReserva(bot, remitente, mensajeObj, establecerEstado, datos) {
    try {
        const reserva = datos?.reserva;
        
        if (!reserva) {
            await bot.sendMessage(remitente, {
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
            await sendReplyButtons(bot, remitente, {
                header: 'Comprobante no habilitado',
                body: `${mensajeEstado}\n\nTe avisaremos cuando cambie el estado.`,
                buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
            });
            await establecerEstado(remitente, CONVERSATION_STATES.MENU, {});
            return;
        }
        
        const { descargarMedia } = require('../../utils/mediaUtils');
        const { guardarComprobante } = require('../../services/comprobanteService');
        const { notifyWhatsAppAdmins } = require('../../services/whatsappAdminService');
        const { buffer, mimetype, nombreArchivo } = await descargarMedia(mensajeObj.message || mensajeObj);
        await guardarComprobante(reservaActual.reservation_id, buffer, mimetype, nombreArchivo);
        await notifyWhatsAppAdmins(bot, reservaActual.reservation_id);
        
        await sendReplyButtons(bot, remitente, {
            header: 'Comprobante recibido',
            body:
                  '📎 Hemos recibido tu comprobante de pago.\n\n' +
                  '⏳ Tu reserva está siendo procesada por nuestro equipo.\n' +
                  'Te notificaremos cuando sea confirmada.\n\n' +
                  '📱 Puedes consultar el estado desde *Mi reserva*.',
            buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
        });
        
        await establecerEstado(remitente, CONVERSATION_STATES.MENU, {});
        
    } catch (error) {
        logger.error('Error procesando comprobante post-reserva', { reservationId: datos?.reserva?.reservation_id, code: error.code, error: error.message });
        await sendReplyButtons(bot, remitente, {
            body: 'No pudimos procesar el comprobante. Verifica que sea una foto o PDF válido e intenta nuevamente.',
            buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
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
            await bot.sendMessage(remitente, {
                text: '⚠️ Opción no válida.\n\n' +
                      '🔹 Escribe *1* para ver más actividades\n' +
                      '🔹 Escribe *0* para ir al menú principal'
            });
            break;
    }
}

module.exports = { procesarMensaje };
