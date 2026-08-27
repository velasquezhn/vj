const { obtenerUltimoSaludo, establecerUltimoSaludo } = require('../../services/stateService');
const { enviarMenuPrincipal } = require('../../services/messagingService');
const logger = require('../../config/logger');
const { normalizeConversationInput } = require('../../services/whatsappMessages');

async function handleGreeting(bot, remitente, mensajeTexto) {
    try {
        // Verificar comando de menú explícito
        const comandoMenu = normalizeConversationInput(mensajeTexto) === 'menu';
        if (comandoMenu) {
            await enviarMenuPrincipal(bot, remitente);
            return true;
        }

        const normalized = String(mensajeTexto || '').trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const esSaludo = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hello)(?:[!.\s].*)?$/.test(normalized);
        if (!esSaludo) return false;

        const hoy = new Date().toISOString().slice(0, 10);
        if (obtenerUltimoSaludo(remitente) !== hoy) await establecerUltimoSaludo(remitente, hoy);
        await enviarMenuPrincipal(bot, remitente);
        return true;

    } catch (error) {
        logger.error(`Error en handleGreeting para ${remitente}: ${error.message}`, {
            userId: remitente,
            error
        });
        
        // Intento de recuperación: enviar menú principal si falla el saludo
        try {
            await enviarMenuPrincipal(bot, remitente);
        } catch (fallbackError) {
            logger.error(`Error de recuperación en handleGreeting: ${fallbackError.message}`, {
                userId: remitente
            });
        }
        
        return true; // Considerar como manejado para evitar loops
    }
}

module.exports = {
    handleGreeting
};
