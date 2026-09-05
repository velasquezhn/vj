const { sendActividadDetails } = require('../../controllers/actividadesController');
const { enviarMenuPrincipal, enviarMenuActividades } = require('../../services/messagingService');
const { loadMenuActivities } = require('../../services/menuActivitiesService');

async function handleActividadesState(bot, remitente, mensajeTexto, establecerEstado) {
    if (mensajeTexto.trim() === '0') {
        await enviarMenuPrincipal(bot, remitente);
    } else {
        const input = mensajeTexto.trim();
        if (!/^\d+$/.test(input)) {
            await enviarMenuActividades(bot, remitente, 'Responde con el número de una experiencia.');
        } else {
            const seleccion = Number(input);
            const activities = await loadMenuActivities();
            if (seleccion < 1 || seleccion > activities.length) {
                await enviarMenuActividades(bot, remitente, `Selecciona un número entre 1 y ${activities.length}.`);
                return;
            }
            await sendActividadDetails(bot, remitente, seleccion, establecerEstado);
        }
    }
}

module.exports = {
    handleActividadesState
};
