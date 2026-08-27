const logger = require('../config/logger');

function truncate(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function textFallback(body, options) {
  const lines = options.map((option, index) => `${index + 1}. ${option.title}`);
  return `${body}\n\n${lines.join('\n')}`;
}

async function sendReplyButtons(bot, to, { body, buttons, header, headerImage, footer, fallbackText }) {
  const normalizedButtons = buttons.slice(0, 3).map((button) => ({
    type: 'reply',
    reply: {
      id: truncate(button.id, 256),
      title: truncate(button.title, 20)
    }
  }));

  const interactive = {
    type: 'button',
    body: { text: truncate(body, 1024) },
    action: { buttons: normalizedButtons }
  };
  if (headerImage) {
    interactive.header = {
      type: 'image',
      image: headerImage.id ? { id: headerImage.id } : { link: headerImage.url }
    };
  } else if (header) interactive.header = { type: 'text', text: truncate(header, 60) };
  if (footer) interactive.footer = { text: truncate(footer, 60) };

  try {
    return await bot.sendMessage(to, { interactive });
  } catch (error) {
    logger.warn('Meta rechazó botones interactivos; se usa respaldo de texto', {
      status: error.response?.status,
      code: error.response?.data?.error?.code
    });
    const fallback = truncate(fallbackText || textFallback(body, buttons), 1024);
    if (headerImage) return bot.sendMessage(to, { image: headerImage, caption: fallback });
    return bot.sendMessage(to, { text: fallback });
  }
}

async function sendList(bot, to, { body, buttonText, sections, header, footer, fallbackText }) {
  const normalizedSections = sections.slice(0, 10).map((section) => ({
    title: truncate(section.title, 24),
    rows: section.rows.slice(0, 10).map((row) => ({
      id: truncate(row.id, 200),
      title: truncate(row.title, 24),
      ...(row.description ? { description: truncate(row.description, 72) } : {})
    }))
  }));

  const interactive = {
    type: 'list',
    body: { text: truncate(body, 1024) },
    action: {
      button: truncate(buttonText, 20),
      sections: normalizedSections
    }
  };
  if (header) interactive.header = { type: 'text', text: truncate(header, 60) };
  if (footer) interactive.footer = { text: truncate(footer, 60) };

  try {
    return await bot.sendMessage(to, { interactive });
  } catch (error) {
    logger.warn('Meta rechazó una lista interactiva; se usa respaldo de texto', {
      status: error.response?.status,
      code: error.response?.data?.error?.code
    });
    const rows = normalizedSections.flatMap((section) => section.rows);
    return bot.sendMessage(to, {
      text: fallbackText || textFallback(body, rows)
    });
  }
}

module.exports = { sendReplyButtons, sendList };
