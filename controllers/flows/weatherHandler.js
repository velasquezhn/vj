const WeatherService = require('../../services/weatherService');
const { sendReplyButtons } = require('../../services/whatsappInteractiveService');
const { enviarMenuPrincipal } = require('../../services/messagingService');
const { CONVERSATION_STATES, BUTTON_IDS } = require('../../services/whatsappConversation');

const weatherService = new WeatherService(process.env.OPENWEATHER_API_KEY);

async function showWeatherPrompt(bot, recipient, setState) {
  await setState(recipient, CONVERSATION_STATES.WEATHER_CITY, {});
  return sendReplyButtons(bot, recipient, {
    header: 'Consultar clima',
    body: 'Escribe la ciudad que deseas consultar. Para evitar confusiones, puedes incluir el país.\n\nEjemplo: *La Ceiba, Honduras*',
    footer: 'También puedes consultar Tela directamente',
    buttons: [
      { id: BUTTON_IDS.WEATHER_TELA, title: 'Clima de Tela' },
      { id: BUTTON_IDS.WEATHER_OTHER, title: 'Otra ciudad' },
      { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
    ],
    fallbackText: '🌦️ *Consultar clima*\n\nEscribe una ciudad y país, por ejemplo: *La Ceiba, Honduras*.\n\n1. Clima de Tela\n2. Escribir otra ciudad\n0. Menú principal'
  });
}

async function sendWeatherResult(bot, recipient, query, setState, service = weatherService) {
  const result = await service.getWeatherForecast(query);
  await setState(recipient, CONVERSATION_STATES.WEATHER_RESULT, { weatherQuery: query });
  return sendReplyButtons(bot, recipient, {
    header: result.success ? 'Pronóstico actualizado' : 'No pudimos completar la consulta',
    body: result.message,
    footer: result.success ? 'Información del proveedor OpenWeather' : 'La conversación sigue disponible',
    buttons: [
      { id: BUTTON_IDS.WEATHER_RETRY, title: 'Actualizar' },
      { id: BUTTON_IDS.WEATHER_OTHER, title: 'Otra ciudad' },
      { id: BUTTON_IDS.MAIN_MENU, title: 'Menú principal' }
    ],
    fallbackText: `${result.message}\n\n1. Intentar nuevamente\n2. Consultar otra ciudad\n0. Menú principal`
  });
}

async function handleWeatherState(bot, recipient, input, state, data, setState, service = weatherService) {
  const value = String(input || '').trim();
  const normalized = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (normalized === '0' || normalized === 'menu') return enviarMenuPrincipal(bot, recipient);
  if (state === CONVERSATION_STATES.WEATHER_RESULT && (normalized === '1' || normalized === 'actualizar' || normalized === 'reintentar')) {
    return sendWeatherResult(bot, recipient, data?.weatherQuery || 'Tela, HN', setState, service);
  }
  if (normalized === '2' || normalized === 'otra' || normalized === 'otra ciudad') {
    return showWeatherPrompt(bot, recipient, setState);
  }
  if (normalized === '1' || normalized === 'tela' || normalized === 'tela, hn' || normalized === 'tela, honduras') {
    return sendWeatherResult(bot, recipient, 'Tela, HN', setState, service);
  }
  if (!value) {
    return showWeatherPrompt(bot, recipient, setState);
  }
  return sendWeatherResult(bot, recipient, value, setState, service);
}

module.exports = { showWeatherPrompt, sendWeatherResult, handleWeatherState };
