const logger = require('../config/logger');

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(maxLength - 1, 0))}…`;
}

function textFallback(body, options) {
  const commands = {
    main_menu: '0', reservation_start: '2', detail_back: '1', detail_reserve: '2', detail_menu: '0',
    dates_yes: 'sí', dates_no: 'no', terms_accept: 'sí', terms_decline: 'no', activities_more: '1',
    weather_retry: '1', post_cancel_yes: '1', post_cancel_no: '2',
    help_request: 'ayuda'
  };
  const lines = options.map((option, index) => {
    const command = option.fallbackValue || commands[option.id] || (/^\d+$/.test(option.id) ? option.id : index + 1);
    return `${command}. ${option.title}`;
  });
  return `${body}\n\n${lines.join('\n')}`;
}

async function sendReplyButtons(bot, to, { body, buttons, header, headerImage, footer, fallbackText }) {
  const normalizedButtons = (buttons || []).filter((button) => button?.id && button?.title).slice(0, 3).map((button) => ({
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
  let remainingRows = 10;
  const normalizedSections = (sections || []).slice(0, 10).map((section) => {
    const rows = (section.rows || [])
      .filter((row) => row?.id && row?.title)
      .slice(0, remainingRows)
      .map((row) => ({
        id: truncate(row.id, 200),
        title: truncate(row.title, 24),
        ...(row.description ? { description: truncate(row.description, 72) } : {})
      }));
    remainingRows -= rows.length;
    return { title: truncate(section.title, 24), rows };
  }).filter((section) => section.rows.length > 0);

  if (!normalizedSections.length) {
    return bot.sendMessage(to, { text: truncate(fallbackText || body || 'No hay opciones disponibles.', 4096) });
  }

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
      text: truncate(fallbackText || textFallback(body, rows), 4096)
    });
  }
}

module.exports = { sendReplyButtons, sendList, truncate };
