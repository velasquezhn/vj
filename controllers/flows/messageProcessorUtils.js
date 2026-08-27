function extractMessageText(mensajeObj) {
    if (!mensajeObj?.message) return '';

    if (mensajeObj.message.conversation) {
        return mensajeObj.message.conversation.trim();
    }
    
    if (mensajeObj.message.extendedTextMessage?.text) {
        return mensajeObj.message.extendedTextMessage.text.trim();
    }
    
    return '';
}

module.exports = {
    extractMessageText
};
