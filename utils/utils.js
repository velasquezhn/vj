async function safeSend(bot, recipient, text) {
  try {
    await bot.sendMessage(recipient, typeof text === 'string' ? { text } : text);
    return true;
  } catch {
    return false;
  }
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

module.exports = { safeSend, isValidUrl };
