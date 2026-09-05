const logger = require('../config/logger');
const constants = require('../controllers/constants');
const { establecerEstado } = require('./stateService');
const { loadMenuCabinTypes } = require('./menuCabinTypesService');
const { loadMenuActivities } = require('./menuActivitiesService');
const { sendReplyButtons, sendList } = require('./whatsappInteractiveService');
const { buildCabinDetails, cabinMedia } = require('./whatsappCabinPresentationService');
const { buildCabinGalleryUrl } = require('./whatsappCabinGalleryService');
const { MAIN_MENU_ROWS, mainMenuFallback, NAVIGATION_FOOTER } = require('./whatsappMessages');

async function enviarMenuPrincipal(bot, remitente, notice = '') {
    try {
        await establecerEstado(remitente, 'MENU_PRINCIPAL');
        await sendList(bot, remitente, {
            header: 'Villas Julie',
            body: `${notice ? `⚠️ ${notice}\n\n` : ''}Te ayudamos a conocer los alojamientos, solicitar una reserva y consultar su estado. ¿Qué deseas hacer?`,
            footer: NAVIGATION_FOOTER,
            buttonText: 'Ver opciones',
            sections: [{
                title: 'Servicios',
                rows: MAIN_MENU_ROWS
            }],
            fallbackText: mainMenuFallback(notice)
        });
        logger.info(`Menú principal enviado a ${remitente}`);
    } catch (error) {
        logger.error(`Error enviando menú principal a ${remitente}: ${error.message}`, {
            stack: error.stack,
            userId: remitente
        });
        try {
            await bot.sendMessage(remitente, { 
                text: constants.ERROR_MENU_PRINCIPAL 
            });
        } catch (fallbackError) {
            logger.critical(`Error crítico de comunicación con ${remitente}: ${fallbackError.message}`, {
                stack: fallbackError.stack,
                userId: remitente
            });
        }
    }
}

async function enviarMenuCabanas(bot, remitente, notice = '') {
    try {
        const tipos = await loadMenuCabinTypes();
        
        if (tipos.length === 0) {
            await establecerEstado(remitente, 'MENU_PRINCIPAL');
            return sendReplyButtons(bot, remitente, {
                body: constants.ERROR_NO_CABANAS,
                footer: NAVIGATION_FOOTER,
                buttons: [{ id: 'main_menu', title: 'Menú principal' }]
            });
        }
        
        await establecerEstado(remitente, 'LISTA_CABAÑAS');
        
        const menuCabanas = `${notice ? `⚠️ ${notice}\n\n` : ''}🏡 *Villas Julie — Alojamientos*\n\n` +
            tipos.map((tipo, index) => `${index + 1}. ${tipo.nombre}`).join('\n') +
            `\n\n0. Menú principal\n\nResponde con el número del alojamiento que deseas conocer.`;

        await sendList(bot, remitente, {
            header: 'Nuestros alojamientos',
            body: `${notice ? `⚠️ ${notice}\n\n` : ''}Selecciona un tipo para ver capacidad, precio, descripción y fotografías.`,
            footer: 'Precios por noche en lempiras · “menú” para volver',
            buttonText: 'Ver alojamientos',
            sections: [{
                title: 'Tipos disponibles',
                rows: tipos.slice(0, 10).map((tipo, index) => ({
                    id: `cabin_${index + 1}`,
                    title: `🏠 ${tipo.nombre}`,
                    description: `${tipo.capacidad || '-'} personas · HNL ${Number(tipo.precio_noche || 0).toLocaleString()}`
                }))
            }],
            fallbackText: menuCabanas
        });
        logger.info(`Menú tipos de cabañas enviado a ${remitente} - ${tipos.length} opciones`);
        
    } catch (error) {
        logger.error(`Error enviando menú de cabañas a ${remitente}: ${error.message}`, {
            stack: error.stack,
            userId: remitente
        });
        try {
            await sendReplyButtons(bot, remitente, {
                body: constants.ERROR_CARGAR_CABANAS,
                footer: NAVIGATION_FOOTER,
                buttons: [{ id: 'main_menu', title: 'Menú principal' }]
            });
        } catch (fallbackError) {
            logger.critical(`Error de comunicación con ${remitente}: ${fallbackError.message}`, {
                stack: fallbackError.stack,
                userId: remitente
            });
        }
    }
}

async function enviarDetalleCabaña(bot, remitente, seleccion) {
    try {
        const tipos = await loadMenuCabinTypes();
        
        const rawSelection = String(seleccion ?? '').trim();
        const seleccionNum = /^\d+$/.test(rawSelection) ? Number(rawSelection) : NaN;
        if (!Number.isInteger(seleccionNum) || seleccionNum < 1 || seleccionNum > tipos.length) {
            await enviarMenuCabanas(bot, remitente, `Selecciona un número entre 1 y ${tipos.length}.`);
            return;
        }
        
        const tipo = tipos[seleccionNum - 1];
        if (!tipo || typeof tipo !== 'object') {
            throw new Error('Tipo de cabaña seleccionado no válido');
        }
        
        await establecerEstado(remitente, 'DETALLE_CABAÑA', { seleccion: seleccionNum });
        
        const nombre = tipo.nombre || 'Cabaña sin nombre';
        const detalles = buildCabinDetails(tipo);
        
        try {
            const { images: imageUrls, videos: videoUrls } = cabinMedia(tipo);

            const galleryUrl = imageUrls.length > 0
                ? await buildCabinGalleryUrl(tipo, imageUrls)
                : null;
            if (!galleryUrl) logger.warn('El tipo de cabaña no tiene fotografías HTTPS configuradas', { cabin: tipo.type_key });

            await sendReplyButtons(bot, remitente, {
                body: detalles,
                ...(galleryUrl ? { headerImage: { url: galleryUrl } } : {}),
                footer: 'Villas Julie',
                buttons: [
                    { id: 'detail_back', title: 'Ver alojamientos' },
                    { id: 'detail_reserve', title: 'Reservar' },
                    { id: 'detail_menu', title: 'Menú principal' }
                ],
                fallbackText: `${detalles}\n\n${constants.SELECCION_DETALLE_OPCIONES}`
            });

            for (const videoUrl of videoUrls) {
                try {
                    await bot.sendMessage(remitente, {
                        video: { url: videoUrl }
                    });
                } catch (videoError) {
                    logger.warn(`Error enviando video a ${remitente}: ${videoError.message}`, {
                        url: videoUrl
                    });
                }
            }
            
            logger.info(`Detalles de cabaña enviados a ${remitente}: ${nombre}`);
            
        } catch (mediaError) {
            logger.error(`Error enviando medios a ${remitente}: ${mediaError.message}`, {
                stack: mediaError.stack,
                userId: remitente
            });
            
            await sendReplyButtons(bot, remitente, {
                body: detalles,
                buttons: [
                    { id: 'detail_back', title: 'Ver alojamientos' },
                    { id: 'detail_reserve', title: 'Reservar' },
                    { id: 'detail_menu', title: 'Menú principal' }
                ],
                fallbackText: `${detalles}\n\n${constants.SELECCION_DETALLE_OPCIONES}`
            });
        }
        
    } catch (error) {
        logger.error(`Error enviando detalles de cabaña a ${remitente}: ${error.message}`, {
            stack: error.stack,
            userId: remitente,
            seleccion
        });
        try {
            await sendReplyButtons(bot, remitente, {
                body: constants.ERROR_CARGAR_DETALLE_CABANA,
                footer: NAVIGATION_FOOTER,
                buttons: [
                    { id: 'detail_back', title: 'Ver alojamientos' },
                    { id: 'main_menu', title: 'Menú principal' }
                ]
            });
        } catch (fallbackError) {
            logger.critical(`Error de comunicación con ${remitente}: ${fallbackError.message}`, {
                stack: fallbackError.stack,
                userId: remitente
            });
        }
    }
}

async function enviarMenuActividades(bot, remitente, notice = '') {
    const actividades = await loadMenuActivities();
    const fallback = actividades.length
        ? `${notice ? `⚠️ ${notice}\n\n` : ''}🌴 *Experiencias locales*\n\n${actividades.map((item, index) => `${index + 1}. ${item.nombre}`).join('\n')}\n\n0. Menú principal\n\nResponde con el número de una experiencia.`
        : '⚠️ No hay experiencias disponibles en este momento.';
    if (!actividades.length) {
        await establecerEstado(remitente, 'MENU_PRINCIPAL');
        return sendReplyButtons(bot, remitente, {
            body: fallback,
            footer: NAVIGATION_FOOTER,
            buttons: [{ id: 'main_menu', title: 'Menú principal' }]
        });
    }

    await establecerEstado(remitente, 'actividades');
    return sendList(bot, remitente, {
        header: 'Experiencias locales',
        body: `${notice ? `⚠️ ${notice}\n\n` : ''}Descubre actividades para disfrutar durante tu estadía.`,
        buttonText: 'Ver experiencias',
        footer: '“menú” para inicio · “volver” para repetir',
        sections: [{
            title: 'Actividades',
            rows: actividades.slice(0, 10).map((item, index) => ({
                id: `activity_${index + 1}`,
                title: item.nombre,
                description: [item.categoria, item.duracion].filter(Boolean).join(' · ')
            }))
        }],
        fallbackText: fallback
    });
}

module.exports = {
    enviarMenuPrincipal,
    enviarMenuCabanas,
    enviarDetalleCabaña,
    enviarMenuActividades
};
