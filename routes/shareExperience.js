const { establecerEstado } = require('../services/stateService');

/**
 * Sends the instructions message for sharing Instagram photo and sets the user state.
 * @param {Object} bot - Bot instance
 * @param {string} remitente - User ID
 * @param {Function} establecerEstadoFunc - Function to set user state
 */
async function sendShareExperienceInstructions(bot, remitente, establecerEstadoFunc) {
  try {
    await bot.sendMessage(remitente, {
      text: `📸 ¡Gana L 500 de descuento en tu próxima reserva!\n\n` +
            `1. Sube una foto a *Instagram* o *Facebook*\n` +
            `2. Etiqueta 👉 @villasjulie\n` +
            `3. Envíanos el enlace aquí ⬇️\n\n` +
            `Participa para ganarte L 500 de descuento, 4 ganadores al año.\n\n` +
            `Envía aquí el enlace público de la publicación.` +
            `\n\nEscribe *cancelar* para salir o *menú* para volver al inicio.`
    });
    await establecerEstadoFunc(remitente, 'share_experience');
  } catch (error) {
    console.error('Error enviando instrucciones para compartir experiencia:', error);
  }
}

/**
 * Handles the user's Instagram link submission, validates it, and sends appropriate response.
 * @param {Object} bot - Bot instance
 * @param {string} remitente - User ID
 * @param {string} mensaje - User message (Instagram link)
 * @param {Function} establecerEstadoFunc - Function to set user state
 */
async function handleShareExperienceResponse(bot, remitente, mensaje, establecerEstadoFunc) {
  const socialLink = mensaje.trim();
  const socialPostPattern = /^https?:\/\/(?:www\.)?(?:instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]+|facebook\.com\/[A-Za-z0-9._-]+\/(?:posts|videos)\/[A-Za-z0-9._-]+)\/?(?:\?.*)?$/i;
  if (socialPostPattern.test(socialLink)) {
    try {
      await bot.sendMessage(remitente, {
        text: '¡Gracias por compartir tu experiencia! 🎉 Estás participando en un descuento de L 500 en tu próxima reserva.' +
              `\n\nEscribe *menú* para volver al inicio.`
      });
      await establecerEstadoFunc(remitente, null); // Limpiar estado
    } catch (error) {
      console.error('Error enviando confirmación de descuento:', error);
    }
  } else {
    try {
      await bot.sendMessage(remitente, {
        text: 'No reconocí ese enlace. Envía el enlace público de una publicación o reel de Instagram, o de una publicación o video de Facebook.\n\nEscribe *cancelar* para salir o *menú* para volver al inicio.'
      });
    } catch (error) {
      console.error('Error enviando mensaje de enlace inválido:', error);
    }
  }
}

module.exports = {
  sendShareExperienceInstructions,
  handleShareExperienceResponse
};
