/**
 * Capa de compatibilidad para los controladores antiguos.
 *
 * La API oficial de WhatsApp no requiere pausas simuladas entre respuestas.
 * Los únicos retrasos conservados están en whatsappCloudService y corresponden
 * al backoff técnico para errores de red, HTTP 429 y fallos 5xx.
 */
async function randomDelay() {
    return undefined;
}

async function sendMessageWithDelay(bot, recipient, message) {
    return bot.sendMessage(recipient, message);
}

async function sendMultipleMessagesWithDelay(bot, recipient, messages) {
    return Promise.all(messages.map((message) => bot.sendMessage(recipient, message)));
}

module.exports = {
    randomDelay,
    sendMessageWithDelay,
    sendMultipleMessagesWithDelay
};
