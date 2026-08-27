const { establecerEstado } = require('../../services/stateService');
const { calcularPrecioTotal } = require('../../services/reservaPriceService');
const { guardarComprobante } = require('../../services/comprobanteService');
const { descargarMedia } = require('../../utils/mediaUtils');
const { ESTADOS_RESERVA } = require('../reservaConstants');
const { createReservationWithUser, normalizePhoneNumber, upsertUser } = require('../../services/reservaService');
const alojamientosService = require('../../services/alojamientosService');
const { parseDateRange } = require('../../utils/dateRangeParser');
const { 
  validateHonduranPhone, 
  sanitizeText,
  validateReservation
} = require('../../utils/validation');
const logger = require('../../config/logger');
const { sendReplyButtons } = require('../../services/whatsappInteractiveService');

// Funciones auxiliares para mejorar la legibilidad

const calcularDiferenciaDias = (entrada, salida) => {
    const fechaEntrada = new Date(entrada.split('/').reverse().join('-'));
    const fechaSalida = new Date(salida.split('/').reverse().join('-'));
    return Math.ceil((fechaSalida - fechaEntrada) / (1000 * 60 * 60 * 24));
};

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
        console.log(`[TRACE] handleReservaState called with estado=${estado}, datos=`, datos);
        console.log(`[DEBUG] Mensaje recibido para fechas: '${mensajeTexto}'`);
        switch (estado) {
            case ESTADOS_RESERVA.FECHAS: {
                logger.info('Procesando fechas de reserva', { 
                    userId: remitente, 
                    input: mensajeTexto 
                });
                
                // Usar el parser flexible para múltiples formatos
                const validacionFechas = parseDateRange(mensajeTexto);
                
                if (validacionFechas.error) {
                    await bot.sendMessage(remitente, { 
                        text: `❌ ${validacionFechas.error}\n\n💡 *Formatos aceptados:*\n` +
                              `📅 15/08/2025 al 18/08/2025\n` +
                              `📅 15 al 18 de agosto\n` +
                              `📅 del 15 al 18 de agosto de 2025\n\n` +
                              `🔄 *Intenta nuevamente con cualquiera de estos formatos*`
                    });
                    logger.warn('Fechas inválidas rechazadas', {
                        userId: remitente,
                        input: mensajeTexto,
                        error: validacionFechas.error
                    });
                    return;
                }
                
                // Extraer información validada del parser
                const fechaEntradaStr = validacionFechas.entrada; // DD/MM/YYYY
                const fechaSalidaStr = validacionFechas.salida;   // DD/MM/YYYY
                
                // Convertir a objetos Date para cálculos
                const [diaEnt, mesEnt, añoEnt] = fechaEntradaStr.split('/');
                const [diaSal, mesSal, añoSal] = fechaSalidaStr.split('/');
                const fechaEntrada = new Date(añoEnt, mesEnt - 1, diaEnt);
                const fechaSalida = new Date(añoSal, mesSal - 1, diaSal);
                
                // Calcular noches
                const noches = Math.ceil((fechaSalida - fechaEntrada) / (1000 * 60 * 60 * 24));
                
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
                        { id: 'dates_yes', title: 'Sí, confirmar' },
                        { id: 'dates_no', title: 'Cambiar fechas' },
                        { id: 'main_menu', title: 'Menú principal' }
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
                    await bot.sendMessage(remitente, { text: '✅ *¡Fechas confirmadas!*\n📝 *Por favor, dime tu nombre completo:*' });
                    await establecerEstado(remitente, ESTADOS_RESERVA.NOMBRE, datos);
                } else if (respuesta === 'no') {
                    await bot.sendMessage(remitente, { text: '🔄 *De acuerdo, volvamos a empezar.*\n\n📅 *Por favor, ingresa nuevamente las fechas de tu reserva.*\n\n💡 *Ejemplo:* 20/08/2025 al 25/08/2025' });
                    await establecerEstado(remitente, ESTADOS_RESERVA.FECHAS, {});
                } else {
                    await bot.sendMessage(remitente, { text: '❓ *No entendí tu respuesta.*\n\n✅ Escribe *"SÍ"* para confirmar las fechas\n❌ Escribe *"NO"* para cambiar las fechas' });
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
                
                if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(nombreInput)) {
                    await bot.sendMessage(remitente, { 
                        text: '❌ *El nombre solo puede contener letras y espacios.*\n\n📝 *Por favor, ingresa tu nombre completo:*' 
                    });
                    return;
                }
                
                const telefono = remitente.split('@')[0];
                
                // Validar teléfono hondureño
                const phoneValidation = validateHonduranPhone(telefono);
                if (!phoneValidation.isValid) {
                    logger.warn('Teléfono inválido detectado', {
                        userId: remitente,
                        phone: telefono,
                        error: phoneValidation.message
                    });
                }
                
                await bot.sendMessage(remitente, { text: '👥 *¿Cuántas personas serán?*\n\n💡 *Ingresa solo el número (ejemplo: 4)*' });
                
                logger.info('Nombre validado y guardado', {
                    userId: remitente,
                    name: nombreInput,
                    phone: phoneValidation.formatted || telefono
                });
                
                await establecerEstado(remitente, ESTADOS_RESERVA.PERSONAS, { 
                    ...datos, 
                    nombre: nombreInput,
                    telefono: phoneValidation.formatted || telefono
                });
                break;
            }

            case ESTADOS_RESERVA.PERSONAS: {
                const cantidad = parseInt(mensajeTexto.trim());
                
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
                
                if (cantidad > 10) {
                    await bot.sendMessage(remitente, {
                        text: `❌ *Máximo 10 personas por reserva.*\n\n👥 Para grupos más grandes, considera hacer múltiples reservas.\n\n*¿Cuántas personas serán?*`
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
                
                await bot.sendMessage(remitente, {
                    text: `🏠 *Asignado automáticamente:*
*${tipoCabana.toUpperCase()}* para ${cantidad} persona(s)`
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
                    console.log(`[TRACE] Calculated precioTotal=${precioTotal}`);
                    
                    // Formatear fechas para mejor presentación
                    const fechaEntradaFormatted = formatearFechaCompleta(datos.fechaEntrada);
                    const fechaSalidaFormatted = formatearFechaCompleta(datos.fechaSalida);
                    
                    // Resumen completo de la reserva
                    const resumenReserva = `📋 *RESUMEN DE TU RESERVA*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 *Nombre:* ${datos.nombre}
📞 *Teléfono:* ${datos.telefono}
📅 *Fechas:* ${fechaEntradaFormatted} hasta ${fechaSalidaFormatted}
🌙 *Noches:* ${datos.noches}
👥 *Personas:* ${cantidad}
🏠 *Alojamiento:* ${tipoCabana.toUpperCase()}
💵 *Total:* Lmps. ${precioTotal.toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 *¿Aceptas las condiciones de uso?*`;

                    await sendReplyButtons(bot, remitente, {
                        header: 'Resumen de reserva',
                        body: resumenReserva,
                        footer: 'La disponibilidad se confirma al continuar',
                        buttons: [
                            { id: 'terms_accept', title: 'Acepto' },
                            { id: 'terms_decline', title: 'No acepto' },
                            { id: 'main_menu', title: 'Menú principal' }
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
                    console.error('Error cálculo precio:', error);
                    await bot.sendMessage(remitente, { 
                        text: '❌ Error calculando el precio. Intenta nuevamente' 
                    });
                }
                break;
            }

            case ESTADOS_RESERVA.CONDICIONES: {
                const aceptado = /^s[iíí]$/i.test(mensajeTexto.trim());
                
                if (!aceptado) {
                    await bot.sendMessage(remitente, { 
                        text: '📝 Debes aceptar las condiciones para continuar\nResponde *"sí"* si estás de acuerdo' 
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
                        
                        await bot.sendMessage(remitente, { 
                            text: `❌ Lo sentimos, no hay cabañas tipo *${tipoNombre}* disponibles para las fechas *${datos.fechaEntrada} - ${datos.fechaSalida}*.\n\n` +
                                  `📅 Por favor selecciona otras fechas o consulta disponibilidad de otros tipos de cabaña.\n\n` +
                                  `Para empezar de nuevo, escribe *"hola"*.`
                        });
                        
                        // Limpiar estado para que pueda empezar de nuevo
                        await establecerEstado(remitente, null, {});
                        return;
                    }
                    
                    // HAY DISPONIBILIDAD - Continuar con la reserva
                    console.log(`✅ Cabaña ${datos.alojamiento} disponible: ${cabanaDisponible.name}`);
                    
                } catch (error) {
                    console.error('Error verificando disponibilidad:', error);
                    await bot.sendMessage(remitente, { 
                        text: '❌ Error verificando disponibilidad. Por favor intenta nuevamente.' 
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

                await bot.sendMessage(remitente, {
                    text: `✅ *SOLICITUD REGISTRADA*\n\n` +
                          `Código: *${created.confirmationCode}*\n` +
                          `Estado: *Pendiente de autorización administrativa*\n` +
                          `Alojamiento: *${cabanaDisponible.name}*\n` +
                          `Fechas: *${fechaInicio} al ${fechaFin}*\n` +
                          `Total: *HNL ${Number(datos.precioTotal).toLocaleString('es-HN')}*\n\n` +
                          '⏳ Un administrador revisará primero la disponibilidad y el total. Todavía no realices el pago ni envíes comprobantes. Te avisaremos por este chat cuando el pago esté autorizado.'
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
                await bot.sendMessage(remitente, {
                    text: `⏳ Tu solicitud *${datos.confirmationCode || ''}* todavía espera autorización administrativa.\n\n` +
                          'No envíes el comprobante todavía. Cuando sea autorizada recibirás un mensaje que habilita el pago.'
                });
                break;
            }

            case ESTADOS_RESERVA.ESPERANDO_PAGO: {
                if (!datos?.reservaId) {
                    await bot.sendMessage(remitente, {
                        text: 'Actualizamos el sistema de reservas y esta solicitud anterior quedó incompleta. Escribe *menú* y crea una nueva solicitud; no se realizó ningún cargo.'
                    });
                    await establecerEstado(remitente, 'MENU_PRINCIPAL', {});
                    return;
                }
                console.log('Mensaje completo recibido en ESPERANDO_PAGO:', JSON.stringify(mensaje));
                console.log('Mensaje keys:', Object.keys(mensaje));
                console.log('Mensaje tiene imageMessage:', mensaje.hasOwnProperty('imageMessage'));
                console.log('Mensaje tiene documentMessage:', mensaje.hasOwnProperty('documentMessage'));
                const esComprobante = mensaje.imageMessage || mensaje.documentMessage;
                console.log('ESPERANDO_PAGO - esComprobante:', esComprobante);
                if (!esComprobante) {
                    await bot.sendMessage(remitente, { 
                        text: '📎 Por favor envía una *foto* o *PDF* del comprobante' 
                    });
                    return;
                }
                
                try {
                    console.log('Descargando media del mensaje...');
                    const { buffer, mimetype, nombreArchivo } = await descargarMedia(mensaje);
                    console.log('Media descargada:', { mimetype, nombreArchivo, bufferLength: buffer.length });
                    const reservaActualizada = await guardarComprobante(
                        datos.reservaId,
                        buffer,
                        mimetype,
                        nombreArchivo
                    );
                    console.log('Reserva actualizada con comprobante:', reservaActualizada);
                    await bot.sendMessage(remitente, {
                        text: `✅ *COMPROBANTE RECIBIDO*\n\nSolicitud: *${datos.confirmationCode || `VJ-${String(datos.reservaId).padStart(6, '0')}`}*\n\nEl administrador debe verificar ahora el pago. Te notificaremos por este chat cuando la reserva tenga la confirmación final.`
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
                    console.error('Error procesando comprobante:', error);
                    await bot.sendMessage(remitente, {
                        text: '⚠️ Error procesando tu comprobante. Intenta nuevamente.'
                    });
                }
                break;
            }

            case ESTADOS_RESERVA.ESPERANDO_CONFIRMACION: {
                await bot.sendMessage(remitente, { 
                    text: `⏳ Tu solicitud *${datos.confirmationCode || ''}* está pendiente de revisión administrativa. Te notificaremos por este chat cuando termine la revisión.`
                });
                break;
            }
        }
    } catch (error) {
        console.error('Error en handleReservaState:', error);
        await bot.sendMessage(remitente, { 
            text: '⚠️ Ocurrió un error inesperado. Por favor intenta nuevamente' 
        });
        await establecerEstado(remitente, 'MENU_PRINCIPAL');
    }
}

module.exports = { handleReservaState };
