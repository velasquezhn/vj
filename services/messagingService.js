const logger = require('../config/logger');
const constants = require('../controllers/constants');
const { establecerEstado } = require('./stateService');
const { loadMenuCabinTypes } = require('./menuCabinTypesService');
const { loadMenuActivities } = require('./menuActivitiesService');
const { isValidUrl } = require('../utils/utils');
const { sendReplyButtons, sendList } = require('./whatsappInteractiveService');

async function enviarMenuPrincipal(bot, remitente) {
    const GRUPO_JID = '120363420483868468@g.us'; // Ensure this matches your group JID
    if (remitente === GRUPO_JID) {
        // Prevent sending menu to group
        logger.warn(`Intento de enviar menú principal al grupo ${remitente} bloqueado.`);
        return;
    }
    try {
        await establecerEstado(remitente, 'MENU_PRINCIPAL');
        await sendList(bot, remitente, {
            header: 'Villas Julie',
            body: '¡Hola! Te ayudamos a planificar tu estadía frente al mar. ¿Qué deseas hacer?',
            footer: 'Puedes escribir “menú” en cualquier momento',
            buttonText: 'Ver opciones',
            sections: [{
                title: 'Servicios',
                rows: [
                    { id: 'main_1', title: '🏡 Alojamientos', description: 'Tipos de cabañas, capacidad y precios' },
                    { id: 'main_2', title: '📅 Reservar ahora', description: 'Consulta fechas y crea tu reserva' },
                    { id: 'main_3', title: '🌴 Experiencias', description: 'Actividades disponibles en la zona' },
                    { id: 'main_4', title: '📲 Contacto', description: 'Habla con nuestro equipo' },
                    { id: 'main_5', title: '🌦️ Clima', description: 'Pronóstico para tu visita' },
                    { id: 'main_6', title: '❓ Preguntas frecuentes', description: 'Horarios, servicios y pagos' },
                    { id: 'main_7', title: '📸 Compartir experiencia', description: 'Envíanos fotos de tu visita' },
                    { id: 'main_8', title: '🛎️ Mi reserva', description: 'Pagos, cambios y asistencia' },
                    { id: 'main_9', title: '💎 Beneficios', description: 'Programa de fidelidad' }
                ]
            }],
            fallbackText: constants.MENU_PRINCIPAL
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

async function enviarMenuCabanas(bot, remitente) {
    try {
        const tipos = await loadMenuCabinTypes();
        
        if (tipos.length === 0) {
            await bot.sendMessage(remitente, { text: constants.ERROR_NO_CABANAS });
            await enviarMenuPrincipal(bot, remitente);
            return;
        }
        
        await establecerEstado(remitente, 'LISTA_CABAÑAS');
        
        const menuCabanas = `🏡 *Villas Julie — Alojamientos*\n\n` +
            tipos.map((tipo, index) => `${index + 1}. ${tipo.nombre}`).join('\n') +
            `\n\n0. Volver ↩️\nPor favor selecciona el número de la opción que te interesa:`;

        await sendList(bot, remitente, {
            header: 'Nuestros alojamientos',
            body: 'Selecciona un tipo para ver capacidad, precio, descripción y fotografías.',
            footer: 'Precios por noche en lempiras',
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
            await bot.sendMessage(remitente, { 
                text: constants.ERROR_CARGAR_CABANAS 
            });
            await enviarMenuPrincipal(bot, remitente);
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
        
        const seleccionNum = parseInt(seleccion);
        if (isNaN(seleccionNum) || seleccionNum < 1 || seleccionNum > tipos.length) {
            await bot.sendMessage(remitente, { text: constants.ERROR_SELECCION_INVALIDA });
            await enviarMenuCabanas(bot, remitente);
            return;
        }
        
        const tipo = tipos[seleccionNum - 1];
        if (!tipo || typeof tipo !== 'object') {
            throw new Error('Tipo de cabaña seleccionado no válido');
        }
        
        await establecerEstado(remitente, 'DETALLE_CABAÑA', { seleccion: seleccionNum });
        
        const nombre = tipo.nombre || 'Cabaña sin nombre';
        const tipoDesc = tipo.tipo || 'Tipo no especificado';
        const descripcion = tipo.descripcion || 'Descripción no disponible';
        const precio = tipo.precio_noche ? `HNL ${tipo.precio_noche.toLocaleString()}` : 'Precio no disponible';
        
        const detalles = `🏖️ *${nombre}*\n\n` +
            `👥 Capacidad: ${tipo.capacidad} personas\n` +
            `🛏️ Habitaciones: ${tipo.habitaciones} | 🚿 Baños: ${tipo.baños}\n` +
            `💰 Precio por noche: ${precio}\n\n` +
            `${descripcion}`;
        
        try {
            const fotos = Array.isArray(tipo.fotos) ? tipo.fotos : (tipo.fotos ? JSON.parse(tipo.fotos) : []);
            const urlsValidas = fotos.filter(url => isValidUrl(url));

            const imageUrls = urlsValidas.filter(url => /\.(jpg|jpeg|png|gif|webp)$/i.test(url));
            const videoUrls = urlsValidas.filter(url => /\.(mp4|mov|avi|mkv)$/i.test(url));

            if (imageUrls.length > 0) {
                await bot.sendMessage(remitente, {
                    image: { url: imageUrls[0] },
                    caption: detalles
                });
                
                for (let i = 1; i < imageUrls.length; i++) {
                    await bot.sendMessage(remitente, {
                        image: { url: imageUrls[i] }
                    });
                }
            } else {
                await bot.sendMessage(remitente, { text: detalles });
            }

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
            
            await sendReplyButtons(bot, remitente, {
                body: '¿Qué deseas hacer ahora?',
                footer: 'Villas Julie',
                buttons: [
                    { id: 'detail_back', title: 'Ver alojamientos' },
                    { id: 'detail_reserve', title: 'Reservar' },
                    { id: 'detail_menu', title: 'Menú principal' }
                ],
                fallbackText: constants.SELECCION_DETALLE_OPCIONES
            });
            
            logger.info(`Detalles de cabaña enviados a ${remitente}: ${nombre}`);
            
        } catch (mediaError) {
            logger.error(`Error enviando medios a ${remitente}: ${mediaError.message}`, {
                stack: mediaError.stack,
                userId: remitente
            });
            
            await bot.sendMessage(remitente, { text: detalles });
            await sendReplyButtons(bot, remitente, {
                body: '¿Qué deseas hacer ahora?',
                buttons: [
                    { id: 'detail_back', title: 'Ver alojamientos' },
                    { id: 'detail_reserve', title: 'Reservar' },
                    { id: 'detail_menu', title: 'Menú principal' }
                ],
                fallbackText: constants.SELECCION_DETALLE_OPCIONES
            });
        }
        
    } catch (error) {
        logger.error(`Error enviando detalles de cabaña a ${remitente}: ${error.message}`, {
            stack: error.stack,
            userId: remitente,
            seleccion
        });
        try {
            await bot.sendMessage(remitente, { 
                text: constants.ERROR_CARGAR_DETALLE_CABANA 
            });
            await enviarMenuCabanas(bot, remitente);
        } catch (fallbackError) {
            logger.critical(`Error de comunicación con ${remitente}: ${fallbackError.message}`, {
                stack: fallbackError.stack,
                userId: remitente
            });
        }
    }
}

async function enviarMenuActividades(bot, remitente) {
    const actividades = await loadMenuActivities();
    const fallback = actividades.length
        ? `🌴 *Experiencias locales*\n\n${actividades.map((item, index) => `${index + 1}. ${item.nombre}`).join('\n')}\n\n0. Menú principal`
        : '⚠️ No hay experiencias disponibles en este momento.';
    if (!actividades.length) return bot.sendMessage(remitente, { text: fallback });

    await establecerEstado(remitente, 'actividades');
    return sendList(bot, remitente, {
        header: 'Experiencias locales',
        body: 'Descubre actividades para disfrutar durante tu estadía.',
        buttonText: 'Ver experiencias',
        footer: 'Selecciona una para conocer los detalles',
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
