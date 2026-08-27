const { sendActividadDetails } = require('../../controllers/actividadesController');
const { enviarMenuPrincipal } = require('../../services/messagingService');

async function handleActividadesState(bot, remitente, mensajeTexto, establecerEstado) {
    if (mensajeTexto.trim() === '0') {
        await enviarMenuPrincipal(bot, remitente);
    } else {
        const seleccion = parseInt(mensajeTexto.trim());
        if (isNaN(seleccion)) {
            await bot.sendMessage(remitente, {
                text: '⚠️ Selección inválida. Por favor, ingresa un número válido del menú.'
            });
        } else {
            await sendActividadDetails(bot, remitente, seleccion, establecerEstado);
        }
    }
}

module.exports = {
    handleActividadesState
};
