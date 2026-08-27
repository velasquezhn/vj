const { obtenerUltimoSaludo, establecerUltimoSaludo } = require('../../services/stateService');
const { enviarMenuPrincipal } = require('../../services/messagingService');
const logger = require('../../config/logger');

async function handleGreeting(bot, remitente, mensajeTexto) {
    try {
        // Verificar comando de menú explícito
        const comandoMenu = mensajeTexto.trim().toLowerCase() === 'menu' || mensajeTexto.trim().toLowerCase() === 'menú';
        if (comandoMenu) {
            await enviarMenuPrincipal(bot, remitente);
            return true;
        }

        const hoy = new Date().toISOString().slice(0, 10);
        const ultimoSaludo = obtenerUltimoSaludo(remitente);

        // Si ya se saludó hoy, no hacer nada
        if (ultimoSaludo === hoy) {
            return false;
        }

        // Nuevo saludo diario
        await establecerUltimoSaludo(remitente, hoy);
        
        // El menú interactivo ya contiene la bienvenida. Se envía una sola
        // respuesta inicial para evitar duplicados y reducir consumo de API.
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
