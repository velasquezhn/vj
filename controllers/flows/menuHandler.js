const { enviarMenuPrincipal, enviarMenuCabanas, enviarDetalleCabaña } = require('../../services/messagingService');
const { handleMainMenuOptions } = require('../mainMenuHandler');
const logger = require('../../config/logger');
const { reservationStart } = require('../../services/whatsappMessages');

// Handlers específicos para cada estado
async function handleMenuPrincipal(bot, remitente, mensajeTexto, establecerEstado) {
    await handleMainMenuOptions(bot, remitente, mensajeTexto.trim(), establecerEstado);
}

async function handleListaCabanas(bot, remitente, mensajeTexto, establecerEstado) {
    if (mensajeTexto.trim() === '0') {
        await enviarMenuPrincipal(bot, remitente);
        return;
    }

    const input = mensajeTexto.trim();
    const normalized = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/^(?:alojamientos?|cabanas?|hospedaje)$/.test(normalized)) {
        await enviarMenuCabanas(bot, remitente);
    } else if (!/^\d+$/.test(input)) {
        await enviarMenuCabanas(bot, remitente, 'No reconocí la selección. Responde con el número de un alojamiento.');
    } else {
        await enviarDetalleCabaña(bot, remitente, Number(input));
    }
}

async function handleDetalleCabana(bot, remitente, mensajeTexto, establecerEstado) {
    const OPCIONES = {
        VOLVER: '1',
        RESERVAR: '2',
        MENU_PRINCIPAL: '0'
    };

    switch (mensajeTexto.trim().toLowerCase()) {
        case OPCIONES.VOLVER:
        case 'ver alojamientos':
            await enviarMenuCabanas(bot, remitente);
            break;
            
        case OPCIONES.RESERVAR:
            // Redirect to reservation flow by setting user state to initial reservation state
            {
                const { establecerEstado } = require('../../services/stateService');
                const { ESTADOS_RESERVA } = require('../reservaConstants');
                await establecerEstado(remitente, ESTADOS_RESERVA.FECHAS);
                await bot.sendMessage(remitente, {
                    text: reservationStart()
                });
            }
            break;
            
        case OPCIONES.MENU_PRINCIPAL:
            await enviarMenuPrincipal(bot, remitente);
            break;
            
        default:
            await bot.sendMessage(remitente, {
                text: 'No reconocí esa opción. Responde 1 para ver alojamientos, 2 para reservar o 0 para el menú principal.'
            });
            // Reenviar menú actual manteniendo el estado
            break;
    }
}

// Handler principal mejorado
async function handleMenuState(bot, remitente, mensajeTexto, estado, establecerEstado) {
    try {
        const handlers = {
            'MENU_PRINCIPAL': handleMenuPrincipal,
            'LISTA_CABAÑAS': handleListaCabanas,
            'DETALLE_CABAÑA': handleDetalleCabana
        };

        if (handlers[estado]) {
            await handlers[estado](bot, remitente, mensajeTexto, establecerEstado);
        } else {
            logger.warn(`Estado no manejado: ${estado}`);
        }
    } catch (error) {
        logger.error(`Error en handleMenuState: ${error.message}`, error);
        await enviarMenuPrincipal(bot, remitente);
    }
}

module.exports = {
    handleMenuState
};
