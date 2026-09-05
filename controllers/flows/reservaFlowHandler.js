const { establecerEstado } = require('../../services/stateService');
const { calcularPrecioTotal } = require('../../services/reservaPriceService');
const { guardarComprobante } = require('../../services/comprobanteService');
const { descargarMedia } = require('../../utils/mediaUtils');
const { ESTADOS_RESERVA } = require('../reservaConstants');
const { createReservationWithUser, upsertUser } = require('../../services/reservaService');
const { parseDateRange } = require('../../utils/dateRangeParser');
const { 
  validateHonduranPhone, 
  sanitizeText,
  validateReservation
} = require('../../utils/validation');
const logger = require('../../config/logger');
const { sendReplyButtons } = require('../../services/whatsappInteractiveService');
const { enviarMenuPrincipal } = require('../../services/messagingService');
const { reservationStart, NAVIGATION_FOOTER } = require('../../services/whatsappMessages');
const { getBusinessSettings, reservationTerms } = require('../../services/businessSettingsService');
const { BUTTON_IDS } = require('../../services/whatsappConversation');

// Funciones auxiliares para mejorar la legibilidad

const asignarAlojamiento = (personas) => {
    if (personas <= 3) return 'tortuga';
    if (personas <= 6) return 'delfin';
    if (personas <= 9) return 'tiburon';
    return null;
};

const formatearFechaCompleta = (fechaStr) => {
    // Convierte fecha DD/MM/YYYY a formato legible
    const [dia, mes, año] = fechaStr.split('/');
    const fecha = new Date(año, mes - 1, dia);
    
    const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    const diaSemana = diasSemana[fecha.getDay()];
    const diaNum = fecha.getDate();
    const mesNombre = meses[fecha.getMonth()];
    const añoNum = fecha.getFullYear();
    
    return `${diaSemana} ${diaNum} de ${mesNombre} de ${añoNum}`;
};

async function handleReservaState(bot, remitente, mensajeTexto, estado, datos, mensaje) {
    try {
        switch (estado) {
            case ESTADOS_RESERVA.FECHAS: {
                logger.info('Procesando fechas de reserva', { userId: remitente });
                
                // Usar el parser flexible para múltiples formatos
                const validacionFechas = parseDateRange(mensajeTexto);
                
                if (validacionFechas.error) {
                    await bot.sendMessage(remitente, {
                        text: `No pude interpretar las fechas: ${validacionFechas.error}\n\n${reservationStart()}`
                    });
                    logger.warn('Fechas inválidas rechazadas', {
                        userId: remitente,
                        error: validacionFechas.error
                    });
                    return;
                }
                
                // Extraer información validada del parser
                const fechaEntradaStr = validacionFechas.entrada; // DD/MM/YYYY
                const fechaSalidaStr = validacionFechas.salida;   // DD/MM/YYYY
                
                // Calcular noches
                const noches = validacionFechas.noches;
                
                // Crear fechas completas más descriptivas
                const fechaEntradaCompleta = formatearFechaCompleta(fechaEntradaStr);
                const fechaSalidaCompleta = formatearFechaCompleta(fechaSalidaStr);

                const datosActualizados = { 
                    ...datos, 
                    fechaEntrada: fechaEntradaStr, // Mantener formato DD/MM/YYYY
                    fechaSalida: fechaSalidaStr,   // Mantener formato DD/MM/YYYY
                    fechaEntradaFormatted: fechaEntradaCompleta,
                    fechaSalidaFormatted: fechaSalidaCompleta,
                    noches
                };

                const confirmacionMensaje = `📅 *CONFIRMAR FECHAS DE RESERVA*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏨 *Su día de entrada será el*
     ${fechaEntradaCompleta} a las *2:00 PM*

🚪 *Su día de salida será el*
     ${fechaSalidaCompleta} a las *11:00 AM*

🌙 *Total de noches:* ${noches}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

¿Son correctas estas fechas?
Selecciona una opción para continuar.`;

                await sendReplyButtons(bot, remitente, {
                    header: 'Confirma tus fechas',
                    body: confirmacionMensaje,
                    footer: 'Podrás cambiarlas antes de reservar',
                    buttons: [
                        { id: BUTTON_IDS.DATES_YES, title: 'Sí, confirmar' },
                        { id: BUTTON_IDS.DATES_NO, title: 'Cambiar fechas' },
                        { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
                    ],
                    fallbackText: `${confirmacionMensaje}\n\n✅ Escribe *"SÍ"* para confirmar\n❌ Escribe *"NO"* para cambiar`
                });
                await establecerEstado(remitente, ESTADOS_RESERVA.CONFIRMAR_FECHAS, datosActualizados);
                
                logger.info('Fechas procesadas correctamente', {
                    userId: remitente,
                    startDate: datosActualizados.fechaEntrada,
                    endDate: datosActualizados.fechaSalida,
                    nights: noches
                });
                break;
            }
            case ESTADOS_RESERVA.CONFIRMAR_FECHAS: {
                const respuesta = mensajeTexto.trim().toLowerCase();
                if (respuesta === 'sí' || respuesta === 'si') {
                    // Continúa el flujo, no vuelve a preguntar fechas
                    await bot.sendMessage(remitente, { text: '✅ Fechas confirmadas.\n\n¿Cuál es tu nombre completo?\n\nEscribe *volver* para cambiar las fechas o *cancelar* para salir.' });
                    await establecerEstado(remitente, ESTADOS_RESERVA.NOMBRE, datos);
                } else if (respuesta === 'no') {
                    await bot.sendMessage(remitente, { text: reservationStart() });
                    await establecerEstado(remitente, ESTADOS_RESERVA.FECHAS, {});
                } else {
                    await sendReplyButtons(bot, remitente, {
                        body: 'No entendí la respuesta. Confirma las fechas o solicita cambiarlas.',
                        buttons: [
                            { id: BUTTON_IDS.DATES_YES, title: 'Sí, confirmar' },
                            { id: BUTTON_IDS.DATES_NO, title: 'Cambiar fechas' },
                            { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
                        ],
                        fallbackText: 'Responde *sí* para confirmar, *no* para cambiar las fechas o *menú* para salir.'
                    });
                }
                break;
            }

            case ESTADOS_RESERVA.NOMBRE: {
                const nombreInput = sanitizeText(mensajeTexto);
                
                // Validar nombre usando nuestro validador
                if (nombreInput.length < 2) {
                    await bot.sendMessage(remitente, { 
                        text: '❌ *El nombre debe tener al menos 2 caracteres.*\n\n📝 *Por favor, ingresa tu nombre completo:*' 
                    });
                    return;
                }
                
                if (nombreInput.length > 100) {
                    await bot.sendMessage(remitente, { 
                        text: '❌ *El nombre es demasiado largo.*\n\n📝 *Por favor, ingresa un nombre más corto:*' 
                    });
                    return;
                }
                
                if (!/^[\p{L}\s.'-]+$/u.test(nombreInput)) {
                    await bot.sendMessage(remitente, { 
                        text: '❌ El nombre solo puede contener letras, espacios, apóstrofes, puntos o guiones.\n\nEscribe tu nombre completo:'
                    });
                    return;
                }
                
                const telefono = remitente.split('@')[0];
                
                // Validar teléfono hondureño
                const phoneValidation = validateHonduranPhone(telefono);
                if (!phoneValidation.isValid) {
                    logger.warn('Teléfono inválido detectado', {
                        userId: remitente,
                        error: phoneValidation.message
                    });
                }
                
                await bot.sendMessage(remitente, { text: '👥 ¿Cuántas personas se hospedarán?\n\nResponde solo con el número, por ejemplo: *4*.\nEscribe *volver* para reiniciar las fechas o *cancelar* para salir.' });
                
                logger.info('Nombre validado y guardado', {
                    userId: remitente,
                    phoneValid: phoneValidation.isValid
                });
                
                await establecerEstado(remitente, ESTADOS_RESERVA.PERSONAS, { 
                    ...datos, 
                    nombre: nombreInput,
                    telefono: phoneValidation.formatted || telefono
                });
                break;
            }

            case ESTADOS_RESERVA.PERSONAS: {
                const peopleInput = mensajeTexto.trim();
                const cantidad = /^\d+$/.test(peopleInput) ? Number(peopleInput) : NaN;
                
                // Validar número de personas
                if (isNaN(cantidad)) {
                    await bot.sendMessage(remitente, { 
                        text: '❌ *Por favor ingresa solo un número.*\n\n👥 *¿Cuántas personas serán?*\n💡 *Ejemplo: 4*' 
                    });
                    return;
                }
                
                if (cantidad < 1) {
                    await bot.sendMessage(remitente, { 
                        text: '❌ *Debe ser mínimo 1 persona.*\n\n👥 *¿Cuántas personas serán?*' 
                    });
                    return;
                }
                
                if (cantidad > 9) {
                    await bot.sendMessage(remitente, {
                        text: '❌ La capacidad máxima de una cabaña es de 9 personas. Para grupos mayores, solicita varias reservas.\n\n¿Cuántas personas se hospedarán?'
                    });
                    return;
                }
                
                const tipoCabana = asignarAlojamiento(cantidad);
                if (!tipoCabana) {
                    await bot.sendMessage(remitente, {
                        text: `⚠️ *Capacidad excedida* (${cantidad} personas)\n\n🏠 *Sugerencia:* Considera múltiples cabañas o reduce el número de huéspedes.\n\n👥 *¿Cuántas personas serán?*`
                    });
                    logger.warn('Capacidad excedida', {
                        userId: remitente,
                        requestedGuests: cantidad
                    });
                    return;
                }
                
                logger.info('Número de personas validado', {
                    userId: remitente,
                    guests: cantidad,
                    assignedCabinType: tipoCabana
                });
                
                let cabanaDisponible;
                let fechaInicio;
                let fechaFin;
                try {
                    const precioTotal = calcularPrecioTotal(
                        tipoCabana, 
                        datos.fechaEntrada, 
                        datos.noches
                    );
                    
                    // Formatear fechas para mejor presentación
                    const fechaEntradaFormatted = formatearFechaCompleta(datos.fechaEntrada);
                    const fechaSalidaFormatted = formatearFechaCompleta(datos.fechaSalida);
                    
                    // Resumen completo de la reserva
                    const businessSettings = await getBusinessSettings();
                    const resumenReserva = `📋 *RESUMEN DE TU RESERVA*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 *Nombre:* ${datos.nombre}
📞 *Teléfono:* ${datos.telefono}
📅 *Fechas:* ${fechaEntradaFormatted} hasta ${fechaSalidaFormatted}
🌙 *Noches:* ${datos.noches}
👥 *Personas:* ${cantidad}
🏠 *Alojamiento:* ${tipoCabana.toUpperCase()}
💵 *Total:* HNL ${precioTotal.toLocaleString('es-HN')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 *Condiciones de la reserva*
${reservationTerms(businessSettings)}

*¿Aceptas estas condiciones?*`;

                    await sendReplyButtons(bot, remitente, {
                        header: 'Resumen de reserva',
                        body: resumenReserva,
                        footer: 'La disponibilidad se confirma al continuar',
                        buttons: [
                            { id: BUTTON_IDS.TERMS_ACCEPT, title: 'Acepto' },
                            { id: BUTTON_IDS.TERMS_DECLINE, title: 'No acepto' },
                            { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
                        ],
                        fallbackText: `${resumenReserva}\n\nResponde *sí* para aceptar o *no* para rechazar.`
                    });
                    
                    await establecerEstado(remitente, ESTADOS_RESERVA.CONDICIONES, {
                        ...datos,
                        personas: cantidad,
                        alojamiento: tipoCabana,
                        precioTotal
                    });
                } catch (error) {
                    logger.error('Error calculando precio de reserva', { error: error.message });
                    await sendReplyButtons(bot, remitente, {
                        body: '❌ No pudimos calcular el precio. Escribe nuevamente la cantidad de personas o vuelve al menú.',
                        buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                    });
                }
                break;
            }

            case ESTADOS_RESERVA.CONDICIONES: {
                const respuesta = mensajeTexto.trim().toLowerCase();
                const aceptado = /^s[ií]$/i.test(respuesta);

                if (!aceptado) {
                    if (respuesta === 'no') {
                        await enviarMenuPrincipal(bot, remitente);
                        return;
                    }
                    await sendReplyButtons(bot, remitente, {
                        body: 'No entendí la respuesta. Acepta las condiciones para registrar la solicitud o cancela el borrador.',
                        buttons: [
                            { id: BUTTON_IDS.TERMS_ACCEPT, title: 'Acepto' },
                            { id: BUTTON_IDS.TERMS_DECLINE, title: 'No acepto' },
                            { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
                        ],
                        fallbackText: 'Responde *sí* para aceptar, *no* para cancelar o *menú* para salir.'
                    });
                    return;
                }
                
                // ✅ VERIFICAR DISPONIBILIDAD ANTES DE ACEPTAR LA RESERVA
                const { buscarCabanaDisponible } = require('../../services/cabinsService');
                
                try {
                    // Convertir fechas al formato correcto para la búsqueda
                    fechaInicio = datos.fechaEntrada.split('/').reverse().join('-'); // DD/MM/YYYY -> YYYY-MM-DD
                    fechaFin = datos.fechaSalida.split('/').reverse().join('-');
                    
                    cabanaDisponible = await buscarCabanaDisponible(
                        datos.alojamiento, 
                        fechaInicio, 
                        fechaFin, 
                        datos.personas
                    );
                    
                    if (!cabanaDisponible) {
                        // NO HAY DISPONIBILIDAD - Informar al cliente
                        const tipoNombre = datos.alojamiento === 'tortuga' ? 'Tortuga' : 
                                          datos.alojamiento === 'delfin' ? 'Delfín' : 'Tiburón';
                        
                        await sendReplyButtons(bot, remitente, {
                            header: 'Sin disponibilidad',
                            body: `No hay cabañas tipo *${tipoNombre}* disponibles del *${datos.fechaEntrada}* al *${datos.fechaSalida}*. Puedes intentar con otras fechas.`,
                            buttons: [
                                { id: BUTTON_IDS.RESERVATION_START, title: 'Cambiar fechas' },
                                { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
                            ]
                        });
                        
                        // Limpiar estado para que pueda empezar de nuevo
                        await establecerEstado(remitente, null, {});
                        return;
                    }
                    
                    // HAY DISPONIBILIDAD - Continuar con la reserva
                } catch (error) {
                    logger.error('Error verificando disponibilidad', { error: error.message });
                    await sendReplyButtons(bot, remitente, {
                        body: '❌ No pudimos verificar la disponibilidad. Intenta aceptar nuevamente o vuelve al menú.',
                        buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                    });
                    return;
                }
                
                const created = await createReservationWithUser(datos.telefono, {
                    start_date: fechaInicio,
                    end_date: fechaFin,
                    status: 'pendiente_autorizacion',
                    total_price: datos.precioTotal,
                    personas: datos.personas,
                    alojamiento: datos.alojamiento
                }, cabanaDisponible.cabin_id);
                if (!created.success) throw new Error(created.error || 'No se pudo crear la solicitud');
                await upsertUser(datos.telefono, datos.nombre);

                await sendReplyButtons(bot, remitente, {
                    header: 'Solicitud registrada',
                    body: `Código: *${created.confirmationCode}*\n` +
                          `Estado: *Pendiente de autorización administrativa*\n` +
                          `Alojamiento: *${cabanaDisponible.name}*\n` +
                          `Fechas: *${fechaInicio} al ${fechaFin}*\n` +
                          `Total: *HNL ${Number(datos.precioTotal).toLocaleString('es-HN')}*\n\n` +
                          '⏳ Un administrador revisará primero la disponibilidad y el total. Todavía no realices el pago ni envíes comprobantes. Te avisaremos cuando el pago esté autorizado.',
                    buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                });

                const reservationState = {
                    ...datos,
                    reservaId: created.reservationId,
                    reservation_id: created.reservationId,
                    confirmationCode: created.confirmationCode,
                    cabinId: cabanaDisponible.cabin_id,
                    cabinName: cabanaDisponible.name
                };
                await establecerEstado(remitente, ESTADOS_RESERVA.ESPERANDO_AUTORIZACION, reservationState);
                const { notifyWhatsAppAdmins } = require('../../services/whatsappAdminService');
                try {
                    const adminDelivery = await notifyWhatsAppAdmins(bot, created.reservationId);
                    logger.info('Solicitud previa al pago enviada a administradores', {
                        reservationId: created.reservationId, sent: adminDelivery.sent, failed: adminDelivery.failed
                    });
                } catch (notifyError) {
                    logger.error('La solicitud quedó guardada, pero falló el aviso administrativo', {
                        reservationId: created.reservationId, error: notifyError.message
                    });
                }
                break;
            }

            case ESTADOS_RESERVA.ESPERANDO_AUTORIZACION: {
                await sendReplyButtons(bot, remitente, {
                    header: 'Autorización pendiente',
                    body: `Tu solicitud *${datos.confirmationCode || ''}* todavía espera autorización administrativa.\n\nNo envíes el comprobante todavía. Te avisaremos cuando se habilite el pago.`,
                    buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                });
                break;
            }

            case ESTADOS_RESERVA.ESPERANDO_PAGO: {
                if (!datos?.reservaId) {
                    await sendReplyButtons(bot, remitente, {
                        body: 'Actualizamos el sistema y esta solicitud anterior quedó incompleta. No se realizó ningún cargo; inicia una solicitud nueva desde el menú.',
                        buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                    });
                    await establecerEstado(remitente, 'MENU_PRINCIPAL', {});
                    return;
                }
                const esComprobante = mensaje.imageMessage || mensaje.documentMessage;
                if (!esComprobante) {
                    await sendReplyButtons(bot, remitente, {
                        body: '📎 Envía una *foto* o un archivo *PDF* del comprobante. Si todavía no deseas enviarlo, puedes volver al menú.',
                        buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                    });
                    return;
                }
                
                try {
                    const { buffer, mimetype, nombreArchivo } = await descargarMedia(mensaje);
                    const reservaActualizada = await guardarComprobante(
                        datos.reservaId,
                        buffer,
                        mimetype,
                        nombreArchivo
                    );
                    await sendReplyButtons(bot, remitente, {
                        header: 'Comprobante recibido',
                        body: `Solicitud: *${datos.confirmationCode || `VJ-${String(datos.reservaId).padStart(6, '0')}`}*\n\nEl administrador debe verificar ahora el pago. Te notificaremos por este chat cuando la reserva tenga la confirmación final.`,
                        buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                    });
                    const { notifyWhatsAppAdmins } = require('../../services/whatsappAdminService');
                    const adminDelivery = await notifyWhatsAppAdmins(bot, datos.reservaId);
                    logger.info('Solicitud enviada a administradores de WhatsApp', {
                        reservationId: datos.reservaId,
                        sent: adminDelivery.sent,
                        failed: adminDelivery.failed
                    });
                    await establecerEstado(remitente, ESTADOS_RESERVA.ESPERANDO_CONFIRMACION, datos);
                } catch (error) {
                    if (error.code === 'PAYMENT_WINDOW_EXPIRED') {
                        await sendReplyButtons(bot, remitente, {
                            header: 'Plazo de pago vencido',
                            body: `La solicitud *${datos.confirmationCode || ''}* no recibió un comprobante dentro de las 24 horas autorizadas. No se realizó ningún cargo.`,
                            buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                        });
                        await establecerEstado(remitente, 'MENU_PRINCIPAL', {});
                    } else if (error.code === 'RECEIPT_ALREADY_RECEIVED') {
                        await sendReplyButtons(bot, remitente, {
                            body: `Ya recibimos el comprobante de la solicitud *${datos.confirmationCode || ''}*. Está pendiente de revisión administrativa.`,
                            buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                        });
                        await establecerEstado(remitente, ESTADOS_RESERVA.ESPERANDO_CONFIRMACION, datos);
                    } else if (error.code === 'RECEIPT_NOT_ALLOWED') {
                        await sendReplyButtons(bot, remitente, {
                            body: 'El envío de comprobantes no está habilitado para esta solicitud.',
                            buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                        });
                        await establecerEstado(remitente, 'MENU_PRINCIPAL', {});
                    } else {
                        logger.error('Error procesando comprobante', { reservationId: datos.reservaId, code: error.code, error: error.message });
                        await sendReplyButtons(bot, remitente, {
                            body: '⚠️ No pudimos procesar el comprobante. Verifica que sea una foto o PDF válido e intenta nuevamente.',
                            buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                        });
                    }
                }
                break;
            }

            case ESTADOS_RESERVA.ESPERANDO_CONFIRMACION: {
                await sendReplyButtons(bot, remitente, {
                    header: 'Comprobante en revisión',
                    body: `Tu solicitud *${datos.confirmationCode || ''}* está pendiente de revisión administrativa. Te notificaremos cuando termine la revisión.`,
                    buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
                });
                break;
            }
        }
    } catch (error) {
        logger.error('Error en el flujo de reserva', { userId: remitente, estado, error: error.message });
        await sendReplyButtons(bot, remitente, {
            body: '⚠️ Ocurrió un error inesperado. El borrador no se completó; vuelve al menú para iniciar nuevamente.',
            buttons: [{ id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }]
        });
        await establecerEstado(remitente, 'MENU_PRINCIPAL');
    }
}

module.exports = { handleReservaState };
